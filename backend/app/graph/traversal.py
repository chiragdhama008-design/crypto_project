"""
Graph traversal and neighborhood discovery engine for TRACE-X.
Queries 1-hop and 2-hop transaction networks, bounds size (max 100-200 nodes),
and retrieves flow directionality and node classifications.
"""

from typing import Dict, Any, List, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.models import Transaction, TransactionEdge


def get_transaction_subgraph(
    db: Session,
    transaction_id: int,
    depth: int = 1,
    max_nodes: int = 120
) -> Dict[str, Any]:
    """
    Traverses the directed graph starting from transaction_id up to depth (1 or 2).
    Extracts incoming and outgoing transaction edges with safety limit to avoid browser freezes.
    """
    visited_nodes: Set[int] = {transaction_id}
    collected_edges: Set[Tuple[int, int]] = set()
    node_hop: Dict[int, int] = {transaction_id: 0}
    current_frontier: Set[int] = {transaction_id}

    for current_depth in range(1, depth + 1):
        if not current_frontier or len(visited_nodes) >= max_nodes:
            break

        frontier_list = list(current_frontier)
        # Query outgoing edges (source in frontier) with deterministic ordering
        out_edges = db.query(
            TransactionEdge.source_transaction_id,
            TransactionEdge.destination_transaction_id
        ).filter(
            TransactionEdge.source_transaction_id.in_(frontier_list)
        ).order_by(TransactionEdge.id.asc()).limit(max_nodes).all()

        # Query incoming edges (destination in frontier) with deterministic ordering
        in_edges = db.query(
            TransactionEdge.source_transaction_id,
            TransactionEdge.destination_transaction_id
        ).filter(
            TransactionEdge.destination_transaction_id.in_(frontier_list)
        ).order_by(TransactionEdge.id.asc()).limit(max_nodes).all()

        next_frontier: Set[int] = set()

        for src, dst in out_edges:
            collected_edges.add((src, dst))
            if dst not in visited_nodes and len(visited_nodes) < max_nodes:
                visited_nodes.add(dst)
                node_hop[dst] = current_depth
                next_frontier.add(dst)

        for src, dst in in_edges:
            collected_edges.add((src, dst))
            if src not in visited_nodes and len(visited_nodes) < max_nodes:
                visited_nodes.add(src)
                node_hop[src] = current_depth
                next_frontier.add(src)

        current_frontier = next_frontier

    # Fetch transaction metadata for all visited nodes
    tx_records = db.query(Transaction).filter(
        Transaction.transaction_id.in_(list(visited_nodes))
    ).all()
    tx_map = {t.transaction_id: t for t in tx_records}

    nodes_output = []
    illicit_count = 0
    licit_count = 0
    unknown_count = 0
    high_risk_count = 0

    for node_id in visited_nodes:
        tx = tx_map.get(node_id)
        if tx:
            label = tx.known_label or "UNKNOWN"
            pred = tx.prediction
            risk = tx.risk_score or 0
            risk_level = tx.risk_level or "LOW"
            prob = tx.prediction_probability
            t_step = tx.time_step
            in_d = tx.in_degree
            out_d = tx.out_degree
        else:
            label = "UNKNOWN"
            pred = None
            risk = 0
            risk_level = "LOW"
            prob = None
            t_step = 1
            in_d = 0
            out_d = 0

        if label == "ILLICIT" or pred == "ILLICIT":
            illicit_count += 1
        elif label == "LICIT":
            licit_count += 1
        else:
            unknown_count += 1

        if risk >= 60:
            high_risk_count += 1

        nodes_output.append({
            "id": str(node_id),
            "transaction_id": node_id,
            "label": label,
            "prediction": pred,
            "risk_score": risk,
            "risk_level": risk_level,
            "probability": prob,
            "time_step": t_step,
            "in_degree": in_d,
            "out_degree": out_d,
            "is_center": (node_id == transaction_id),
            "hop_level": node_hop.get(node_id, 0)
        })

    edges_output = []
    for src, dst in collected_edges:
        edges_output.append({
            "id": f"e_{src}_{dst}",
            "source": str(src),
            "target": str(dst),
            "direction": "out" if src == transaction_id else "in"
        })

    return {
        "nodes": nodes_output,
        "edges": edges_output,
        "metadata": {
            "center_transaction_id": transaction_id,
            "depth": depth,
            "total_nodes": len(nodes_output),
            "total_edges": len(edges_output),
            "illicit_count": illicit_count,
            "licit_count": licit_count,
            "unknown_count": unknown_count,
            "high_risk_count": high_risk_count,
            "truncated": len(visited_nodes) >= max_nodes,
            "max_limit": max_nodes
        }
    }
