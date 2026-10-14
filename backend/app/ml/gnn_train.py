"""
Graph Neural Network Training Engine for TRACE-X Bitcoin Forensic Platform.
Constructs the full transaction graph from Elliptic CSVs, trains a GraphSAGE model
under strict temporal split (1-34 train, 35-39 val, 40-49 test), prevents future leakage,
and generates real forensic evaluation metrics.
"""

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.utils import to_undirected

from backend.app.ml.gnn_model import BitcoinGraphSAGE
from backend.app.ml.evaluate import evaluate_model_performance


MODEL_CACHE_DIR = Path("models")
MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def build_elliptic_graph(
    data_dir: str,
    bidirectional: bool = True
) -> Tuple[Data, Dict[int, int], np.ndarray, list]:
    """
    Constructs PyTorch Geometric Data object from Elliptic CSVs.
    Maps transaction IDs to contiguous indices and builds node features and edge index.

    Args:
        data_dir: Directory containing elliptic CSV files.
        bidirectional: Whether to include reverse edges for bidirectional message passing.

    Returns:
        data: PyG Data object containing x, edge_index, y, train_mask, val_mask, test_mask.
        tx_to_idx: Dict mapping txId (int) to node index (0..N-1).
        tx_ids: Array of original transaction IDs ordered by node index.
        feature_cols: List of feature column names.
    """
    features_path = os.path.join(data_dir, "elliptic_txs_features.csv")
    classes_path = os.path.join(data_dir, "elliptic_txs_classes.csv")
    edgelist_path = os.path.join(data_dir, "elliptic_txs_edgelist.csv")

    print(f"[GNN Dataset] Loading classes from {classes_path}...")
    classes_df = pd.read_csv(classes_path)
    classes_df["txId"] = classes_df["txId"].astype(int)

    # Label mapping: '1' -> 1 (illicit), '2' -> 0 (licit), 'unknown' -> -1
    def map_class(val):
        s = str(val).strip().lower()
        if s in ("1", "illicit"):
            return 1
        elif s in ("2", "licit"):
            return 0
        return -1

    classes_df["label"] = classes_df["class"].apply(map_class)

    print(f"[GNN Dataset] Loading features from {features_path}...")
    features_df = pd.read_csv(features_path, header=None)
    features_df.rename(columns={0: "txId", 1: "time_step"}, inplace=True)
    features_df["txId"] = features_df["txId"].astype(int)
    features_df["time_step"] = features_df["time_step"].astype(int)

    # Merge features with labels
    merged = pd.merge(features_df, classes_df[["txId", "label"]], on="txId", how="inner")
    feature_cols = [c for c in merged.columns if c not in ("txId", "time_step", "label")]

    # Create contiguous node index mapping
    tx_ids = merged["txId"].values
    tx_to_idx = {tx_id: idx for idx, tx_id in enumerate(tx_ids)}
    num_nodes = len(tx_ids)

    # Node features tensor [num_nodes, 165]
    x_matrix = merged[feature_cols].values.astype(np.float32)
    x = torch.from_numpy(x_matrix)

    # Node labels tensor [num_nodes]
    y_array = merged["label"].values.astype(np.int64)
    y = torch.from_numpy(y_array)

    time_steps = merged["time_step"].values

    print(f"[GNN Dataset] Loading edge list from {edgelist_path}...")
    edges_df = pd.read_csv(edgelist_path)
    edges_df["txId1"] = edges_df["txId1"].astype(int)
    edges_df["txId2"] = edges_df["txId2"].astype(int)

    # Filter edges to valid mapped nodes
    valid_mask = edges_df["txId1"].isin(tx_to_idx) & edges_df["txId2"].isin(tx_to_idx)
    valid_edges = edges_df[valid_mask]

    src_indices = [tx_to_idx[src] for src in valid_edges["txId1"].values]
    dst_indices = [tx_to_idx[dst] for dst in valid_edges["txId2"].values]

    edge_index = torch.tensor([src_indices, dst_indices], dtype=torch.long)

    if bidirectional:
        # Message passing in financial forensic graphs benefits from both upstream
        # and downstream visibility (where money came from and where it flowed)
        edge_index = to_undirected(edge_index, num_nodes=num_nodes)

    # Temporal split masks (strict chronological evaluation)
    # Timesteps 1-34: train, 35-39: val, 40-49: test
    # Supervised optimization ONLY evaluates labeled transactions (y != -1)
    train_mask = (time_steps >= 1) & (time_steps <= 34) & (y_array != -1)
    val_mask = (time_steps >= 35) & (time_steps <= 39) & (y_array != -1)
    test_mask = (time_steps >= 40) & (time_steps <= 49) & (y_array != -1)

    pyg_data = Data(
        x=x,
        edge_index=edge_index,
        y=y,
        train_mask=torch.from_numpy(train_mask),
        val_mask=torch.from_numpy(val_mask),
        test_mask=torch.from_numpy(test_mask)
    )

    print(f"[GNN Dataset] Graph successfully constructed:")
    print(f"  * Nodes: {num_nodes:,}")
    print(f"  * Edges: {pyg_data.num_edges:,} ({'bidirectional' if bidirectional else 'directed'})")
    print(f"  * Features per node: {x.size(1)}")
    print(f"  * Train nodes (1-34): {train_mask.sum():,} (Illicit: {(y_array[train_mask] == 1).sum():,})")
    print(f"  * Val nodes (35-39):   {val_mask.sum():,} (Illicit: {(y_array[val_mask] == 1).sum():,})")
    print(f"  * Test nodes (40-49):  {test_mask.sum():,} (Illicit: {(y_array[test_mask] == 1).sum():,})")
    print(f"  * Unknown / Unlabeled: {(y_array == -1).sum():,} (used for message passing topology only)")

    return pyg_data, tx_to_idx, tx_ids, feature_cols


def train_gnn_model(
    data_dir: str,
    epochs: int = 60,
    lr: float = 0.005,
    weight_decay: float = 1e-4,
    hidden_channels: int = 128,
    dropout: float = 0.3,
    patience: int = 15,
    random_seed: int = 42
) -> Tuple[BitcoinGraphSAGE, Dict[str, Any]]:
    """
    Trains BitcoinGraphSAGE with early stopping on validation PR-AUC/F1,
    evaluates on the temporal test set, and saves model artifacts.
    """
    torch.manual_seed(random_seed)
    np.random.seed(random_seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[GNN Train] Training on device: {device}")

    start_time = time.time()

    # 1. Build Graph
    data, tx_to_idx, tx_ids, feature_cols = build_elliptic_graph(data_dir=data_dir, bidirectional=True)
    data = data.to(device)

    # 2. Compute Class Weighting to counter ~1:8 imbalance in train set
    train_labels = data.y[data.train_mask].cpu().numpy()
    num_licit = (train_labels == 0).sum()
    num_illicit = (train_labels == 1).sum()
    illicit_weight = float(num_licit / max(num_illicit, 1))
    class_weights = torch.tensor([1.0, illicit_weight], dtype=torch.float32).to(device)
    print(f"[GNN Train] Class weights: Licit=1.0, Illicit={illicit_weight:.2f}")

    criterion = nn.CrossEntropyLoss(weight=class_weights)

    # 3. Initialize Model
    model = BitcoinGraphSAGE(
        in_channels=data.x.size(1),
        hidden_channels=hidden_channels,
        out_channels=2,
        dropout=dropout
    ).to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

    # 4. Training Loop with Early Stopping
    best_val_f1 = -1.0
    best_epoch = 0
    best_state_dict = None
    no_improve_epochs = 0

    val_y_true = data.y[data.val_mask].cpu().numpy()

    print(f"[GNN Train] Starting {epochs} epochs of GraphSAGE optimization...")
    for epoch in range(1, epochs + 1):
        epoch_start = time.time()
        model.train()
        optimizer.zero_grad()

        # Full-graph message passing
        logits = model(data.x, data.edge_index)

        # Loss only on supervised training partition
        loss = criterion(logits[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

        # Validation evaluation
        model.eval()
        with torch.no_grad():
            val_logits = model(data.x, data.edge_index)[data.val_mask]
            val_probs = F.softmax(val_logits, dim=1)[:, 1].cpu().numpy()
            val_preds = (val_probs >= 0.5).astype(int)

            # Compute illicit F1
            val_tp = ((val_preds == 1) & (val_y_true == 1)).sum()
            val_fp = ((val_preds == 1) & (val_y_true == 0)).sum()
            val_fn = ((val_preds == 0) & (val_y_true == 1)).sum()
            val_prec = val_tp / max(val_tp + val_fp, 1)
            val_rec = val_tp / max(val_tp + val_fn, 1)
            val_f1 = (2 * val_prec * val_rec) / max(val_prec + val_rec, 1e-6)

        epoch_time = time.time() - epoch_start

        if epoch % 5 == 0 or epoch == 1:
            print(f"  [Epoch {epoch:02d}/{epochs:02d}] Train Loss: {loss.item():.4f} | Val Illicit F1: {val_f1*100:.1f}% (P: {val_prec*100:.1f}%, R: {val_rec*100:.1f}%) | Time: {epoch_time:.2f}s")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_epoch = epoch
            best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            no_improve_epochs = 0
        else:
            no_improve_epochs += 1
            if no_improve_epochs >= patience:
                print(f"[GNN Train] Early stopping triggered at epoch {epoch} (Best epoch: {best_epoch} with Val F1: {best_val_f1*100:.2f}%)")
                break

    # 5. Load best model state
    if best_state_dict is not None:
        model.load_state_dict(best_state_dict)

    training_duration = round(time.time() - start_time, 2)
    print(f"[GNN Train] Training completed in {training_duration}s. Evaluating on temporal test set...")

    # 6. Evaluate on Test Partition (Timesteps 40-49)
    model.eval()
    with torch.no_grad():
        test_logits = model(data.x, data.edge_index)[data.test_mask]
        test_probs = F.softmax(test_logits, dim=1)[:, 1].cpu().numpy()
        test_preds = (test_probs >= 0.5).astype(int)

    test_y_true = data.y[data.test_mask].cpu().numpy()

    metrics = evaluate_model_performance(
        y_true=test_y_true,
        y_pred=test_preds,
        y_prob=test_probs,
        model_name="Graph Neural Network (GNN)",
        evaluation_strategy="Temporal Chronological Split (Train: Steps 1-34, Test: Steps 40-49)",
        training_period="Timesteps 1 - 34",
        validation_period="Timesteps 35 - 39",
        testing_period="Timesteps 40 - 49"
    )

    metrics["training_duration_seconds"] = training_duration
    metrics["best_epoch"] = best_epoch
    metrics["architecture"] = "2-Layer GraphSAGE (SAGEConv)"
    metrics["test_samples_evaluated"] = int(len(test_y_true))

    # Feature Importance for GNN via first-layer weight magnitudes
    # Aggregates importance across input feature channels
    with torch.no_grad():
        conv1_weights = model.conv1.lin_l.weight.data.cpu().numpy()
        feat_importances = np.mean(np.abs(conv1_weights), axis=0)
        feat_importances = feat_importances / (np.sum(feat_importances) + 1e-9)

    top_indices = np.argsort(feat_importances)[::-1][:20]
    top_features = []
    for idx in top_indices:
        cat = "Local Transaction Features" if idx < 93 else "Neighborhood Aggregate Features"
        top_features.append({
            "feature_index": int(idx),
            "feature_name": f"Feature {idx + 1}",
            "importance": round(float(feat_importances[idx]), 5),
            "category": cat
        })
    metrics["feature_importances"] = top_features

    # 7. Save Artifacts
    # A. PyTorch checkpoint
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "in_channels": data.x.size(1),
        "hidden_channels": hidden_channels,
        "out_channels": 2,
        "dropout": dropout,
        "metrics": metrics,
        "training_duration": training_duration,
        "best_epoch": best_epoch
    }
    torch.save(checkpoint, MODEL_CACHE_DIR / "gnn_model.pt")

    # B. Metrics JSON
    with open(MODEL_CACHE_DIR / "gnn_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    # C. Metadata and node mappings for inference
    metadata = {
        "tx_to_idx": tx_to_idx,
        "tx_ids": tx_ids,
        "feature_cols": feature_cols,
        "num_nodes": len(tx_ids),
        "bidirectional": True
    }
    joblib.dump(metadata, MODEL_CACHE_DIR / "gnn_metadata.joblib")

    print(f"[GNN Train] Successfully saved GNN artifacts:")
    print(f"  * Checkpoint: {MODEL_CACHE_DIR / 'gnn_model.pt'}")
    print(f"  * Metrics:    {MODEL_CACHE_DIR / 'gnn_metrics.json'}")
    print(f"  * Metadata:   {MODEL_CACHE_DIR / 'gnn_metadata.joblib'}")
    print(f"  * Illicit Precision: {metrics['illicit_precision'] * 100:.2f}%")
    print(f"  * Illicit Recall:    {metrics['illicit_recall'] * 100:.2f}%")
    print(f"  * Illicit F1:        {metrics['illicit_f1'] * 100:.2f}%")
    print(f"  * PR-AUC:            {metrics['pr_auc']:.4f}")
    print(f"  * ROC-AUC:           {metrics['roc_auc']:.4f}")

    return model, metrics
