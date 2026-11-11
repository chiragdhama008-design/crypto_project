"""
Integration tests for TRACE-X FastAPI endpoints.
Uses an isolated temporary SQLite database so local development state is untouched.
"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

import backend.app.database as db_module
from backend.app.config import settings
from backend.app.main import app
from backend.app.models import Transaction


class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmpdir = tempfile.TemporaryDirectory()
        cls._test_db_path = Path(cls._tmpdir.name) / "test_api.db"
        cls._orig_get_db_url = db_module.get_database_url
        db_module.get_database_url = lambda: f"sqlite:///{cls._test_db_path.as_posix()}"
        db_module.init_db()

        # Seed deterministic sample transaction for search & risk contract checks
        session = db_module._SessionLocal()
        try:
            existing = session.query(Transaction).filter(Transaction.transaction_id == 230425980).first()
            if not existing:
                session.add(Transaction(
                    transaction_id=230425980,
                    time_step=40,
                    known_label="UNKNOWN",
                    prediction="ILLICIT",
                    prediction_probability=0.9123,
                    risk_score=85,
                    risk_level="CRITICAL",
                    in_degree=2,
                    out_degree=3,
                    total_degree=5,
                ))
                session.commit()
        finally:
            session.close()

    @classmethod
    def tearDownClass(cls):
        if db_module._engine is not None:
            db_module._engine.dispose()
        db_module._engine = None
        db_module._SessionLocal = None
        db_module.get_database_url = cls._orig_get_db_url
        cls._tmpdir.cleanup()

    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint_and_security_headers(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("database", data)
        self.assertEqual(res.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(res.headers.get("x-frame-options"), "DENY")

    def test_dashboard_endpoint(self):
        res = self.client.get("/api/dashboard")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_transactions", data)
        self.assertIn("risk_distribution", data)

    def test_transactions_endpoint_and_non_numeric_search(self):
        res = self.client.get("/api/transactions?limit=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("transactions", data)
        self.assertIn("total", data)

        # Non-numeric search previously crashed on .cast(str) instead of .cast(String)
        res_alpha = self.client.get("/api/transactions?search=abc")
        self.assertEqual(res_alpha.status_code, 200)
        self.assertEqual(res_alpha.json()["total"], 0)

        # Partial numeric auto-suggest search
        res_suggest = self.client.get("/api/search/transactions?query=2304")
        self.assertEqual(res_suggest.status_code, 200)
        self.assertTrue(any(item["transaction_id"] == 230425980 for item in res_suggest.json()))

    def test_risk_high_contract_fields(self):
        res = self.client.get("/api/risk/high?level=CRITICAL")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(len(data["transactions"]) >= 1)
        tx = data["transactions"][0]
        self.assertIn("prediction_probability", tx)
        self.assertIn("probability", tx)
        self.assertIn("total_degree", tx)
        self.assertEqual(tx["prediction_probability"], tx["probability"])
        self.assertEqual(tx["total_degree"], 5)

    def test_dataset_status_no_host_path_leak(self):
        res = self.client.get("/api/dataset/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("dataset_configured", data)
        self.assertIn("dataset_directory_name", data)
        self.assertNotIn("dataset_path", data)

    def test_models_endpoint(self):
        res = self.client.get("/api/models")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("active_model", data)

    def test_predict_rejects_nan_infinity(self):
        raw_payload = '{"features": [' + ", ".join(["NaN"] + ["0.0"] * 164) + '], "model_name": "gradient_boosting"}'
        res = self.client.post(
            "/api/ml/predict",
            content=raw_payload,
            headers={"Content-Type": "application/json"},
        )
        self.assertIn(res.status_code, (400, 422))

    def test_optional_admin_key_gate(self):
        import scripts.train_model as train_model_mod
        orig_key = settings.ADMIN_API_KEY
        try:
            settings.ADMIN_API_KEY = "hackathon-secret-key"
            with patch.object(train_model_mod, "run_training", return_value=None):
                res_missing = self.client.post("/api/ml/train", json={"models": ["logistic_regression"]})
                self.assertEqual(res_missing.status_code, 403)

                res_wrong = self.client.post(
                    "/api/ml/train",
                    json={"models": ["logistic_regression"]},
                    headers={"X-Admin-Key": "wrong-key"},
                )
                self.assertEqual(res_wrong.status_code, 403)

                res_ok = self.client.post(
                    "/api/ml/train",
                    json={"models": ["logistic_regression"]},
                    headers={"X-Admin-Key": "hackathon-secret-key"},
                )
                self.assertEqual(res_ok.status_code, 200)
        finally:
            settings.ADMIN_API_KEY = orig_key

    def test_predict_missing_model_returns_503_no_silent_fallback(self):
        import backend.app.ml.predict as predict_mod
        orig_dir = predict_mod.MODEL_CACHE_DIR
        orig_cache = dict(predict_mod._loaded_models)
        try:
            with tempfile.TemporaryDirectory() as empty_dir:
                predict_mod.MODEL_CACHE_DIR = Path(empty_dir)
                predict_mod._loaded_models.clear()
                res = self.client.post(
                    "/api/ml/predict",
                    json={"features": [0.0] * 165, "model_name": "random_forest"},
                )
                self.assertEqual(res.status_code, 503)
        finally:
            predict_mod.MODEL_CACHE_DIR = orig_dir
            predict_mod._loaded_models.clear()
            predict_mod._loaded_models.update(orig_cache)

    def test_hist_gb_permutation_importances_and_canonical_filename(self):
        import numpy as np
        import backend.app.ml.train as train_mod

        rng = np.random.default_rng(42)
        X_train = rng.normal(size=(120, 165))
        y_train = (X_train[:, 0] > 0.2).astype(int)
        X_test = rng.normal(size=(40, 165))
        y_test = (X_test[:, 0] > 0.2).astype(int)

        orig_dir = train_mod.MODEL_CACHE_DIR
        try:
            with tempfile.TemporaryDirectory() as tmp_models:
                train_mod.MODEL_CACHE_DIR = Path(tmp_models)
                _, metrics = train_mod.train_baseline_model(
                    model_type="gb",
                    X_train=X_train,
                    y_train=y_train,
                    X_test=X_test,
                    y_test=y_test,
                    feature_cols=[f"f{i}" for i in range(165)],
                )
                self.assertTrue((Path(tmp_models) / "gradient_boosting.joblib").exists())
                self.assertTrue((Path(tmp_models) / "gradient_boosting_metrics.json").exists())
                top_imps = [f["importance"] for f in metrics["feature_importances"]]
                # Real permutation importance puts signal Feature 1 at the top (non-uniform)
                self.assertGreater(len(set(top_imps)), 1)
                self.assertEqual(metrics["feature_importances"][0]["feature_index"], 0)
        finally:
            train_mod.MODEL_CACHE_DIR = orig_dir

    def test_cases_crud_and_validation(self):
        # Create empty case first and verify report generation succeeds cleanly with 0 transactions
        empty_case_res = self.client.post("/api/cases", json={
            "case_name": "Empty Dossier Check Case"
        })
        self.assertEqual(empty_case_res.status_code, 200)
        empty_case_id = empty_case_res.json()["id"]
        empty_rep = self.client.get(f"/api/cases/{empty_case_id}/report")
        self.assertEqual(empty_rep.status_code, 200)
        self.assertEqual(empty_rep.json()["risk_assessment_summary"]["total_investigated"], 0)

        # Create case
        create_res = self.client.post("/api/cases", json={
            "case_name": "Automated Unit Test Case",
            "description": "Integration test created case."
        })
        self.assertEqual(create_res.status_code, 200)
        case_data = create_res.json()
        case_id = case_data["id"]

        # Fetch case
        get_res = self.client.get(f"/api/cases/{case_id}")
        self.assertEqual(get_res.status_code, 200)

        # Attach transaction & validate status enum
        tx_res = self.client.post(f"/api/cases/{case_id}/transactions", json={"transaction_ids": [230425980]})
        self.assertEqual(tx_res.status_code, 200)
        self.assertEqual(tx_res.json()["transaction_count"], 1)

        patch_ok = self.client.patch(f"/api/cases/{case_id}", json={"status": "under review"})
        self.assertEqual(patch_ok.status_code, 200)
        self.assertEqual(patch_ok.json()["status"], "UNDER REVIEW")

        patch_bad = self.client.patch(f"/api/cases/{case_id}", json={"status": "INVALID_STATUS"})
        self.assertEqual(patch_bad.status_code, 422)

        # Nonexistent case returns 404
        missing_tx_res = self.client.post("/api/cases/999999/transactions", json={"transaction_ids": [230425980]})
        self.assertEqual(missing_tx_res.status_code, 404)

        # Add note
        note_res = self.client.post(f"/api/cases/{case_id}/notes", json={
            "note": "Test note from integration suite."
        })
        self.assertEqual(note_res.status_code, 200)

        # Generate report & check SHA-256 digest
        rep_res = self.client.get(f"/api/cases/{case_id}/report")
        self.assertEqual(rep_res.status_code, 200)
        rep_data = rep_res.json()
        self.assertEqual(len(rep_data.get("integrity_sha256", "")), 64)


if __name__ == "__main__":
    unittest.main()
