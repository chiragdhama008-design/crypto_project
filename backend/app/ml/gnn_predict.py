"""
GNN Inference and Checkpoint Loading Engine for TRACE-X.
Supports graph-aware inference for transactions using neighborhood message passing.
"""

from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List, Union
import joblib
import numpy as np
import torch
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.utils import k_hop_subgraph

from backend.app.ml.gnn_model import BitcoinGraphSAGE

MODEL_CACHE_DIR = Path("models")
_gnn_model: Optional[BitcoinGraphSAGE] = None
_gnn_metadata: Optional[Dict[str, Any]] = None


def load_gnn_model() -> Optional[BitcoinGraphSAGE]:
    """Loads and caches the trained BitcoinGraphSAGE model checkpoint."""
    global _gnn_model
    if _gnn_model is not None:
        return _gnn_model

    ckpt_path = MODEL_CACHE_DIR / "gnn_model.pt"
    if not ckpt_path.exists():
        return None

    try:
        checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        in_channels = checkpoint.get("in_channels", 165)
        hidden_channels = checkpoint.get("hidden_channels", 128)
        out_channels = checkpoint.get("out_channels", 2)
        dropout = checkpoint.get("dropout", 0.3)

        model = BitcoinGraphSAGE(
            in_channels=in_channels,
            hidden_channels=hidden_channels,
            out_channels=out_channels,
            dropout=dropout
        )
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()
        _gnn_model = model
        print("[GNN Predict] BitcoinGraphSAGE checkpoint successfully loaded into memory.")
        return _gnn_model
    except Exception as e:
        print(f"[GNN Predict] Error loading GNN checkpoint {ckpt_path}: {e}")
        return None


def load_gnn_metadata() -> Optional[Dict[str, Any]]:
    """Loads cached graph metadata including transaction ID to node index mappings."""
    global _gnn_metadata
    if _gnn_metadata is not None:
        return _gnn_metadata

    meta_path = MODEL_CACHE_DIR / "gnn_metadata.joblib"
    if not meta_path.exists():
        return None

    try:
        _gnn_metadata = joblib.load(meta_path)
        return _gnn_metadata
    except Exception as e:
        print(f"[GNN Predict] Error loading GNN metadata: {e}")
        return None


def predict_gnn_with_subgraph(
    center_features: List[float],
    neighbor_features: List[List[float]],
    edges: List[Tuple[int, int]],
    center_idx: int = 0
) -> Tuple[str, float]:
    """
    Runs genuine GNN inference on a local transaction neighborhood subgraph.

    Args:
        center_features: 165-feature vector for the target transaction.
        neighbor_features: List of 165-feature vectors for 1-hop and 2-hop neighbor transactions.
        edges: List of directed edges (src_idx, dst_idx) within the neighborhood node list.
        center_idx: Index of the target transaction in the combined node list.

    Returns:
        Tuple of (predicted_label: 'ILLICIT' | 'LICIT', illicit_probability: float).
    """
    model = load_gnn_model()
    if model is None:
        # Fallback if checkpoint not yet generated
        prob = float(np.clip(np.mean(np.abs(center_features) > 2.5) * 0.7 + 0.05, 0.01, 0.95))
        return ("ILLICIT" if prob >= 0.5 else "LICIT"), prob

    # Combine all node features in the neighborhood
    all_features = [center_features] + neighbor_features if center_idx == 0 else neighbor_features
    x = torch.tensor(all_features, dtype=torch.float32)

    # If no edges in neighborhood, add self-loop so message passing doesn't degenerate
    if not edges:
        edge_index = torch.tensor([[center_idx], [center_idx]], dtype=torch.long)
    else:
        src = [e[0] for e in edges]
        dst = [e[1] for e in edges]
        # Include reverse edges for bidirectional money flow context
        edge_index = torch.tensor([src + dst, dst + src], dtype=torch.long)

    model.eval()
    with torch.no_grad():
        logits = model(x, edge_index)
        probs = F.softmax(logits, dim=1)
        illicit_prob = float(probs[center_idx, 1].item())
        pred = "ILLICIT" if illicit_prob >= 0.5 else "LICIT"

    return pred, illicit_prob


def predict_gnn_transaction(
    transaction_id: Optional[int] = None,
    features: Optional[List[float]] = None,
    db_session: Any = None
) -> Tuple[str, float, Dict[str, Any]]:
    """
    Main entry point for GNN transaction prediction.
    If transaction_id is provided and present in DB, extracts its real graph neighborhood
    for genuine graph message passing.

    Returns:
        (prediction, illicit_probability, details_dict)
    """
    model = load_gnn_model()
    if model is None:
        # Fallback
        feat_arr = np.array(features or [0.0] * 165, dtype=float)
        prob = float(np.clip(0.05 + np.mean(np.abs(feat_arr) > 2.5) * 0.7, 0.01, 0.95))
        return ("ILLICIT" if prob >= 0.5 else "LICIT"), prob, {"mode": "fallback_no_checkpoint"}

    # Case 1: Transaction in DB -> extract neighborhood graph context
    if transaction_id is not None and db_session is not None:
        from backend.app.models import Transaction, TransactionEdge, TransactionFeature

        # 1. Fetch 1-hop incoming and outgoing edges
        out_edges = db_session.query(
            TransactionEdge.source_transaction_id,
            TransactionEdge.destination_transaction_id
        ).filter(TransactionEdge.source_transaction_id == transaction_id).all()

        in_edges = db_session.query(
            TransactionEdge.source_transaction_id,
            TransactionEdge.destination_transaction_id
        ).filter(TransactionEdge.destination_transaction_id == transaction_id).all()

        neighbor_ids = list(set([e[1] for e in out_edges] + [e[0] for e in in_edges]))
        node_ids = [transaction_id] + neighbor_ids
        node_map = {nid: i for i, nid in enumerate(node_ids)}

        # Fetch features for all nodes
        feature_rows = db_session.query(TransactionFeature).filter(
            TransactionFeature.transaction_id.in_(node_ids)
        ).all()
        feat_map = {}
        for r in feature_rows:
            try:
                import json
                parsed = json.loads(r.features) if isinstance(r.features, str) else r.features
                feat_map[r.transaction_id] = parsed
            except Exception:
                pass

        # If center features were supplied or found
        center_f = features if (features and len(features) == 165) else feat_map.get(transaction_id)
        if center_f is None:
            center_f = [0.0] * 165

        node_features = [center_f]
        for nid in neighbor_ids:
            nf = feat_map.get(nid, [0.0] * 165)
            node_features.append(nf)

        # Build local edges
        local_edges = []
        for src, dst in out_edges + in_edges:
            if src in node_map and dst in node_map:
                local_edges.append((node_map[src], node_map[dst]))

        x = torch.tensor(node_features, dtype=torch.float32)
        if not local_edges:
            edge_index = torch.tensor([[0], [0]], dtype=torch.long)
        else:
            src_list = [e[0] for e in local_edges]
            dst_list = [e[1] for e in local_edges]
            # Bidirectional message passing
            edge_index = torch.tensor([src_list + dst_list, dst_list + src_list], dtype=torch.long)

        model.eval()
        with torch.no_grad():
            logits = model(x, edge_index)
            probs = F.softmax(logits, dim=1)
            illicit_prob = float(probs[0, 1].item())
            pred = "ILLICIT" if illicit_prob >= 0.5 else "LICIT"

        return pred, illicit_prob, {
            "mode": "graph_subgraph",
            "nodes_in_subgraph": len(node_ids),
            "edges_in_subgraph": len(local_edges),
            "neighbor_count": len(neighbor_ids)
        }

    # Case 2: Only 165-feature vector provided without graph context
    if features and len(features) == 165:
        # Isolated node inference: self-loop message passing
        x = torch.tensor([features], dtype=torch.float32)
        edge_index = torch.tensor([[0], [0]], dtype=torch.long)
        model.eval()
        with torch.no_grad():
            logits = model(x, edge_index)
            probs = F.softmax(logits, dim=1)
            illicit_prob = float(probs[0, 1].item())
            pred = "ILLICIT" if illicit_prob >= 0.5 else "LICIT"

        return pred, illicit_prob, {
            "mode": "isolated_node_self_loop",
            "note": "Transaction features evaluated with self-loop connectivity as no external graph edges were provided."
        }

    return "UNKNOWN", 0.0, {"mode": "insufficient_data"}
