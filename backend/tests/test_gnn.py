"""
Unit and Integration Tests for Graph Neural Network (GNN) implementation in TRACE-X.
Tests:
- Graph construction and node index mapping
- Feature and label alignment
- Temporal split integrity (1-34, 35-39, 40-49)
- Exclusion of unknown labels from supervised loss
- Model forward pass and output dimensions
- Checkpoint saving and loading
- Prediction probability validity
- Missing checkpoint graceful fallback
- API endpoints: /api/models, /api/models/gnn/metrics, /api/ml/predict
- Backward compatibility with existing models
"""

import os
import json
import math
import tempfile
import unittest
import numpy as np
import torch
import torch.nn.functional as F
from pathlib import Path
from fastapi.testclient import TestClient

import backend.app.database as db_module
from backend.app.main import app
from backend.app.models import Transaction, TransactionFeature, TransactionEdge
from backend.app.ml.evaluate import evaluate_model_performance

try:
    from backend.app.ml.gnn_model import BitcoinGraphSAGE
    from backend.app.ml.gnn_predict import (
        load_gnn_model,
        predict_gnn_with_subgraph,
        predict_gnn_transaction,
    )
    HAS_TORCH_GEOMETRIC = True
except ImportError:
    BitcoinGraphSAGE = None
    load_gnn_model = None
    predict_gnn_with_subgraph = None
    predict_gnn_transaction = None
    HAS_TORCH_GEOMETRIC = False


class TestGNNModelAndPipeline(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls._tmpdir = tempfile.TemporaryDirectory()
        cls._test_db_path = Path(cls._tmpdir.name) / "test_gnn.db"
        cls._orig_get_db_url = db_module.get_database_url
        db_module.get_database_url = lambda: f"sqlite:///{cls._test_db_path.as_posix()}"
        db_module.init_db()

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
        self.num_nodes = 20
        self.in_channels = 165
        self.num_edges = 30

        # Synthetic test graph
        torch.manual_seed(42)
        self.x = torch.randn(self.num_nodes, self.in_channels)
        src = torch.randint(0, self.num_nodes, (self.num_edges,))
        dst = torch.randint(0, self.num_nodes, (self.num_edges,))
        self.edge_index = torch.stack([src, dst], dim=0)

        # Labels: 1 = illicit, 0 = licit, -1 = unknown
        self.y = torch.tensor([1, 0, -1, 1, 0, 0, -1, 1, 0, -1, 0, 1, 0, 0, -1, 0, 1, 0, -1, 0], dtype=torch.long)
        self.timesteps = np.array([1, 5, 10, 15, 20, 30, 34, 35, 36, 38, 39, 40, 41, 43, 45, 47, 48, 49, 12, 28])

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_model_forward_pass_and_dimensions(self):
        """Verify BitcoinGraphSAGE forward pass produces [num_nodes, 2] logits."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=32, out_channels=2, dropout=0.2)
        model.eval()

        with torch.no_grad():
            logits = model(self.x, self.edge_index)

        self.assertEqual(logits.shape, (self.num_nodes, 2))
        self.assertFalse(torch.isnan(logits).any())
        self.assertFalse(torch.isinf(logits).any())

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_prediction_probability_validity(self):
        """Verify predict_proba returns normalized probabilities in [0, 1] summing to 1."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=32, out_channels=2)
        probs = model.predict_proba(self.x, self.edge_index)

        self.assertEqual(probs.shape, (self.num_nodes, 2))
        self.assertTrue((probs >= 0.0).all() and (probs <= 1.0).all())
        row_sums = np.array(probs.sum(dim=1).tolist())
        np.testing.assert_allclose(row_sums, np.ones(self.num_nodes), atol=1e-5)

    def test_temporal_split_integrity_and_no_leakage(self):
        """Verify train, val, and test partitions are disjoint and unknown labels excluded."""
        y_arr = np.array(self.y.tolist())
        train_mask = (self.timesteps >= 1) & (self.timesteps <= 34) & (y_arr != -1)
        val_mask = (self.timesteps >= 35) & (self.timesteps <= 39) & (y_arr != -1)
        test_mask = (self.timesteps >= 40) & (self.timesteps <= 49) & (y_arr != -1)

        # Mutually disjoint
        self.assertEqual(np.sum(train_mask & val_mask), 0)
        self.assertEqual(np.sum(train_mask & test_mask), 0)
        self.assertEqual(np.sum(val_mask & test_mask), 0)

        # Unknown transactions strictly excluded from supervised masks
        unknown_indices = np.where(y_arr == -1)[0]
        for idx in unknown_indices:
            self.assertFalse(train_mask[idx])
            self.assertFalse(val_mask[idx])
            self.assertFalse(test_mask[idx])

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_unknown_labels_exclusion_from_loss(self):
        """Verify supervised CrossEntropy loss is computed only on train_mask without unknown labels."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=16, out_channels=2)
        criterion = torch.nn.CrossEntropyLoss()

        y_arr = np.array(self.y.tolist())
        train_mask = (self.timesteps >= 1) & (self.timesteps <= 34) & (y_arr != -1)
        train_mask_tensor = torch.tensor(train_mask.tolist(), dtype=torch.bool)

        logits = model(self.x, self.edge_index)
        loss = criterion(logits[train_mask_tensor], self.y[train_mask_tensor])

        self.assertFalse(torch.isnan(loss))
        # Ensure loss backward succeeds
        loss.backward()
        self.assertIsNotNone(model.classifier.weight.grad)

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_checkpoint_saving_and_loading(self):
        """Verify checkpoint serialization and loading preserves architecture and weights."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=64, out_channels=2)
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            torch.save({
                "model_state_dict": model.state_dict(),
                "in_channels": 165,
                "hidden_channels": 64,
                "out_channels": 2,
                "dropout": 0.3
            }, tmp_path)

            loaded_ckpt = torch.load(tmp_path, map_location="cpu", weights_only=True)
            loaded_model = BitcoinGraphSAGE(
                in_channels=loaded_ckpt["in_channels"],
                hidden_channels=loaded_ckpt["hidden_channels"],
                out_channels=loaded_ckpt["out_channels"]
            )
            loaded_model.load_state_dict(loaded_ckpt["model_state_dict"])
            loaded_model.eval()

            model.eval()
            with torch.no_grad():
                out_orig = model(self.x, self.edge_index)
                out_loaded = loaded_model(self.x, self.edge_index)
                torch.testing.assert_close(out_orig, out_loaded)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_subgraph_inference(self):
        """Verify predict_gnn_with_subgraph runs message passing on local neighborhood."""
        center_f = [0.1] * 165
        neighbor_f = [[-0.2] * 165, [0.5] * 165]
        edges = [(0, 1), (1, 2), (2, 0)]

        pred, prob = predict_gnn_with_subgraph(
            center_features=center_f,
            neighbor_features=neighbor_f,
            edges=edges,
            center_idx=0
        )

        self.assertIn(pred, ("ILLICIT", "LICIT"))
        self.assertTrue(0.0 <= prob <= 1.0)

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_subgraph_inference_nonzero_center_idx(self):
        """Verify predict_gnn_with_subgraph preserves node identity for non-zero center_idx."""
        center_f = [0.25] * 165
        n1_f = [-0.5] * 165
        n2_f = [0.8] * 165

        # Isomorphic graphs: node 0 in first graph corresponds to node 1 in second graph
        _, prob_idx0 = predict_gnn_with_subgraph(
            center_features=center_f,
            neighbor_features=[n1_f, n2_f],
            edges=[(0, 1), (1, 2)],
            center_idx=0,
        )
        _, prob_idx1 = predict_gnn_with_subgraph(
            center_features=center_f,
            neighbor_features=[n1_f, n2_f],
            edges=[(1, 0), (0, 2)],
            center_idx=1,
        )

        self.assertAlmostEqual(prob_idx0, prob_idx1, places=5)

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_predict_gnn_transaction_two_hop_db(self):
        """Verify DB subgraph inference reaches 2-hop neighbors."""
        session = db_module._SessionLocal()
        try:
            for tx_id in (900001, 900002, 900003):
                session.query(TransactionEdge).filter(
                    (TransactionEdge.source_transaction_id == tx_id) |
                    (TransactionEdge.destination_transaction_id == tx_id)
                ).delete()
                session.query(TransactionFeature).filter(TransactionFeature.transaction_id == tx_id).delete()
                session.query(Transaction).filter(Transaction.transaction_id == tx_id).delete()
            session.commit()

            for idx, tx_id in enumerate((900001, 900002, 900003)):
                session.add(Transaction(
                    transaction_id=tx_id,
                    time_step=40,
                    known_label="UNKNOWN",
                    risk_score=20,
                    risk_level="LOW",
                    in_degree=1 if idx > 0 else 0,
                    out_degree=1 if idx < 2 else 0,
                    total_degree=1 if idx in (0, 2) else 2,
                ))
                session.add(TransactionFeature(
                    transaction_id=tx_id,
                    features=json.dumps([0.1 * (idx + 1)] * 165),
                ))

            # 2-hop chain: 900001 -> 900002 -> 900003
            session.add(TransactionEdge(source_transaction_id=900001, destination_transaction_id=900002))
            session.add(TransactionEdge(source_transaction_id=900002, destination_transaction_id=900003))
            session.commit()

            pred, prob, meta = predict_gnn_transaction(
                transaction_id=900001,
                features=[0.1] * 165,
                db_session=session,
            )

            self.assertIn(pred, ("ILLICIT", "LICIT"))
            self.assertTrue(0.0 <= prob <= 1.0)
            self.assertEqual(meta["mode"], "graph_subgraph_2hop")
            self.assertEqual(meta["nodes_in_subgraph"], 3)
            # Undirected deduplicated edges: 2 undirected pairs -> 4 directed edges
            self.assertEqual(meta["edges_in_subgraph"], 4)
        finally:
            session.close()

    def test_metric_calculation_accuracy(self):
        """Verify evaluate_model_performance calculates valid confusion matrix and AUC metrics."""
        y_true = np.array([1, 0, 1, 0, 0, 1, 0, 0, 1, 0])
        y_prob = np.array([0.9, 0.1, 0.8, 0.2, 0.3, 0.7, 0.1, 0.4, 0.6, 0.2])
        y_pred = (y_prob >= 0.5).astype(int)

        metrics = evaluate_model_performance(
            y_true=y_true,
            y_pred=y_pred,
            y_prob=y_prob,
            model_name="GNN Test",
            evaluation_strategy="Temporal"
        )

        self.assertEqual(metrics["model_name"], "GNN Test")
        self.assertTrue(0.0 <= metrics["accuracy"] <= 1.0)
        self.assertTrue(0.0 <= metrics["roc_auc"] <= 1.0)
        self.assertTrue(0.0 <= metrics["pr_auc"] <= 1.0)
        self.assertEqual(
            metrics["confusion_matrix"]["true_positive"] + metrics["confusion_matrix"]["false_negative"],
            int(np.sum(y_true == 1))
        )

    def test_api_list_models_includes_gnn(self):
        """Verify GET /api/models includes GNN in supported architectures and models list."""
        resp = self.client.get("/api/models")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertIn("Graph Neural Network (GNN)", data["supported_architectures"])
        model_names = [m["model_name"] for m in data["models"]]
        self.assertTrue(any("gnn" in name.lower() or "graph" in name.lower() for name in model_names))

    def test_api_get_gnn_metrics(self):
        """Verify GET /api/models/gnn/metrics returns complete evaluation schema."""
        resp = self.client.get("/api/models/gnn/metrics")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertIn("Graph Neural Network", data["model_name"])
        self.assertIn("accuracy", data)
        self.assertIn("precision", data)
        self.assertIn("recall", data)
        self.assertIn("f1", data)
        self.assertIn("roc_auc", data)
        self.assertIn("pr_auc", data)
        self.assertIn("illicit_f1", data)
        self.assertIn("confusion_matrix", data)
        self.assertIn("roc_curve", data)
        self.assertIn("pr_curve", data)
        self.assertIsInstance(data["roc_curve"], list)
        self.assertIsInstance(data["pr_curve"], list)

    @unittest.skipUnless(HAS_TORCH_GEOMETRIC, "Requires optional torch-geometric package")
    def test_api_ml_predict_with_gnn(self):
        """Verify POST /api/ml/predict with model_name='gnn' returns probability and label."""
        payload = {
            "features": [0.0] * 165,
            "model_name": "gnn"
        }
        resp = self.client.post("/api/ml/predict", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["model_name"], "gnn")
        self.assertIn(data["prediction"], ("ILLICIT", "LICIT"))
        self.assertTrue(0.0 <= data["illicit_probability"] <= 1.0)
        self.assertTrue(0.0 <= data["licit_probability"] <= 1.0)
        self.assertAlmostEqual(data["illicit_probability"] + data["licit_probability"], 1.0, places=3)

    def test_api_ml_predict_backward_compatibility(self):
        """Verify existing classifiers still work as expected."""
        for model in ["gradient_boosting", "random_forest", "logistic_regression"]:
            payload = {
                "features": [0.0] * 165,
                "model_name": model
            }
            resp = self.client.post("/api/ml/predict", json=payload)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn(data["prediction"], ("ILLICIT", "LICIT"))
            self.assertTrue(0.0 <= data["illicit_probability"] <= 1.0)

    def test_api_ml_predict_validation_and_aliases(self):
        """Verify /api/ml/predict rejects non-165 vectors, NaN/Inf, and unsupported models."""
        # Invalid feature count
        resp_len = self.client.post("/api/ml/predict", json={"features": [0.0] * 10, "model_name": "gnn"})
        self.assertEqual(resp_len.status_code, 400)

        # Invalid model name
        resp_model = self.client.post("/api/ml/predict", json={"features": [0.0] * 165, "model_name": "nonexistent_model"})
        self.assertEqual(resp_model.status_code, 400)

        # Canonical alias normalization ('gb' -> 'gradient_boosting')
        resp_alias = self.client.post("/api/ml/predict", json={"features": [0.0] * 165, "model_name": "gb"})
        self.assertEqual(resp_alias.status_code, 200)
        self.assertEqual(resp_alias.json()["model_name"], "gradient_boosting")

        # Strict RFC JSON metrics check (no Inf/NaN in curves)
        metrics_resp = self.client.get("/api/models/gnn/metrics")
        self.assertEqual(metrics_resp.status_code, 200)
        roc_curve = metrics_resp.json().get("roc_curve", [])
        for pt in roc_curve:
            if pt.get("threshold") is not None:
                self.assertTrue(math.isfinite(pt["threshold"]))


if __name__ == "__main__":
    unittest.main()
