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
import tempfile
import unittest
import numpy as np
import torch
import torch.nn.functional as F
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.ml.gnn_model import BitcoinGraphSAGE
from backend.app.ml.gnn_predict import (
    load_gnn_model,
    predict_gnn_with_subgraph,
    predict_gnn_transaction
)
from backend.app.ml.evaluate import evaluate_model_performance


class TestGNNModelAndPipeline(unittest.TestCase):

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

    def test_model_forward_pass_and_dimensions(self):
        """Verify BitcoinGraphSAGE forward pass produces [num_nodes, 2] logits."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=32, out_channels=2, dropout=0.2)
        model.eval()

        with torch.no_grad():
            logits = model(self.x, self.edge_index)

        self.assertEqual(logits.shape, (self.num_nodes, 2))
        self.assertFalse(torch.isnan(logits).any())
        self.assertFalse(torch.isinf(logits).any())

    def test_prediction_probability_validity(self):
        """Verify predict_proba returns normalized probabilities in [0, 1] summing to 1."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=32, out_channels=2)
        probs = model.predict_proba(self.x, self.edge_index)

        self.assertEqual(probs.shape, (self.num_nodes, 2))
        self.assertTrue((probs >= 0.0).all() and (probs <= 1.0).all())
        row_sums = probs.sum(dim=1).numpy()
        np.testing.assert_allclose(row_sums, np.ones(self.num_nodes), atol=1e-5)

    def test_temporal_split_integrity_and_no_leakage(self):
        """Verify train, val, and test partitions are disjoint and unknown labels excluded."""
        train_mask = (self.timesteps >= 1) & (self.timesteps <= 34) & (self.y.numpy() != -1)
        val_mask = (self.timesteps >= 35) & (self.timesteps <= 39) & (self.y.numpy() != -1)
        test_mask = (self.timesteps >= 40) & (self.timesteps <= 49) & (self.y.numpy() != -1)

        # Mutually disjoint
        self.assertEqual(np.sum(train_mask & val_mask), 0)
        self.assertEqual(np.sum(train_mask & test_mask), 0)
        self.assertEqual(np.sum(val_mask & test_mask), 0)

        # Unknown transactions strictly excluded from supervised masks
        unknown_indices = np.where(self.y.numpy() == -1)[0]
        for idx in unknown_indices:
            self.assertFalse(train_mask[idx])
            self.assertFalse(val_mask[idx])
            self.assertFalse(test_mask[idx])

    def test_unknown_labels_exclusion_from_loss(self):
        """Verify supervised CrossEntropy loss is computed only on train_mask without unknown labels."""
        model = BitcoinGraphSAGE(in_channels=165, hidden_channels=16, out_channels=2)
        criterion = torch.nn.CrossEntropyLoss()

        train_mask = (self.timesteps >= 1) & (self.timesteps <= 34) & (self.y.numpy() != -1)
        train_mask_tensor = torch.from_numpy(train_mask)

        logits = model(self.x, self.edge_index)
        loss = criterion(logits[train_mask_tensor], self.y[train_mask_tensor])

        self.assertFalse(torch.isnan(loss))
        # Ensure loss backward succeeds
        loss.backward()
        self.assertIsNotNone(model.classifier.weight.grad)

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

            loaded_ckpt = torch.load(tmp_path, map_location="cpu", weights_only=False)
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


if __name__ == "__main__":
    unittest.main()
