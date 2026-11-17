#!/usr/bin/env python3
"""
ChainGuard Forensic Platform
High-Performance Dataset Ingestion & ML Pipeline.
Streams, normalizes, predicts, scores, and bulk-inserts Elliptic Bitcoin transactions, edges, and features.
Supports both Supabase PostgreSQL and local SQLite storage using batched bulk inserts.
"""

import os
import sys
import time
import argparse
from pathlib import Path
from datetime import datetime
import json
import numpy as np
import pandas as pd
import joblib

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import settings
from backend.app.database import init_db, get_db, initialize_schema
from backend.app.models import Transaction, TransactionFeature, TransactionEdge, IngestionRun
from backend.app.data_sources.elliptic.loader import EllipticDataSource
from backend.app.risk.engine import calculate_risk_score


def run_ingestion(data_dir: str, limit: int = None, edges_limit: int = None, batch_size: int = 10000, clear: bool = True):
    start_time = time.time()
    print("=" * 70)
    print("CHAINGUARD FORENSIC PLATFORM - DATASET INGESTION & ML SCORING PIPELINE")
    print("=" * 70)
    print(f"Data Directory : {data_dir}")
    print(f"Batch Size     : {batch_size:,}")
    print(f"Tx Limit       : {'ALL' if limit is None else f'{limit:,}'}")
    print(f"Edges Limit    : {'ALL' if edges_limit is None else f'{edges_limit:,}'}")
    print(f"Clear Existing : {clear}")

    # 1. Initialize data source abstraction
    loader = EllipticDataSource(data_dir)
    if not loader.validate():
        print("[ERROR] Dataset validation failed. Aborting ingestion.")
        sys.exit(1)

    metadata = loader.get_metadata()
    print(f"[Ingestion] Verified data source: {metadata.source_name}")

    # 2. Initialize Database Engine & Schema
    init_db()
    db = next(get_db())

    # 3. Clear existing transaction/edge/feature data if requested
    if clear:
        print("[Ingestion] Clearing previous transaction, feature, and edge records...")
        db.query(TransactionEdge).delete()
        db.query(TransactionFeature).delete()
        db.query(Transaction).delete()
        db.commit()
        print("[Ingestion] Database tables reset successfully.")

    # 4. Load Active ML Model for Real-Time Inference
    active_model = None
    model_path = Path("models/gradient_boosting.joblib")
    if model_path.exists():
        try:
            from backend.app.ml.predict import load_model
            active_model = load_model("gradient_boosting")
            print(f"[ML Pipeline] Loaded active model for inference: {model_path}")
        except Exception as e:
            print(f"[ML Pipeline] Warning: Could not load model: {e}")
    else:
        print("[ML Pipeline] Notice: No saved model found at models/gradient_boosting.joblib. Will use default baseline scoring.")

    # 5. Precalculate Illicit Neighborhood Signals from Graph
    print("[Graph Intelligence] Precalculating illicit neighborhood exposure from edgelist...")
    t_g0 = time.time()
    try:
        classes_df = pd.read_csv(Path(data_dir) / "elliptic_txs_classes.csv")
        illicit_txs = set(classes_df[classes_df["class"] == "1"]["txId"])
        edges_df = pd.read_csv(Path(data_dir) / "elliptic_txs_edgelist.csv")
        e1 = edges_df[edges_df["txId2"].isin(illicit_txs)]["txId1"].value_counts()
        e2 = edges_df[edges_df["txId1"].isin(illicit_txs)]["txId2"].value_counts()
        illicit_neighbors_map = (e1.add(e2, fill_value=0)).to_dict()
        print(f"[Graph Intelligence] Graph exposure computed in {time.time() - t_g0:.2f}s ({len(illicit_neighbors_map):,} nodes have illicit connections)")
    except Exception as e:
        print(f"[Graph Intelligence] Warning: Graph precalculation error: {e}")
        illicit_neighbors_map = {}

    # Create Ingestion Run Record
    run_record = IngestionRun(
        dataset_name=metadata.source_name,
        status="RUNNING",
        rows_processed=0,
        started_at=datetime.utcnow()
    )
    db.add(run_record)
    db.commit()
    db.refresh(run_record)

    total_inserted_txs = 0
    total_inserted_features = 0
    total_inserted_edges = 0

    try:
        # 6. Stream, Predict, Score, and Bulk-Insert Transactions & Features
        print("\n--- PHASE 1: INGESTING TRANSACTIONS & FEATURES WITH REAL ML INFERENCE ---")
        tx_stream = loader.stream_transactions(batch_size=batch_size)

        for batch_num, tx_batch in enumerate(tx_stream, start=1):
            if limit and total_inserted_txs >= limit:
                break

            tx_records = []
            feat_records = []

            # Batch ML prediction
            probs = None
            if active_model is not None and tx_batch and tx_batch[0].features is not None:
                try:
                    feat_matrix = np.array([t.features for t in tx_batch], dtype=float)
                    probs = active_model.predict_proba(feat_matrix)[:, 1]
                except Exception as e:
                    probs = None

            for i, n_tx in enumerate(tx_batch):
                if limit and total_inserted_txs + len(tx_records) >= limit:
                    break

                label_str = n_tx.known_label.value
                illicit_n = int(illicit_neighbors_map.get(n_tx.transaction_id, 0))

                if probs is not None:
                    prob = float(probs[i])
                    pred = "ILLICIT" if prob >= 0.5 else "LICIT"
                    score, level, _ = calculate_risk_score(
                        known_label=label_str,
                        ml_probability=prob,
                        graph_metrics={
                            "known_illicit_neighbors": illicit_n,
                            "suspicious_neighbors_count": 0,
                            "illicit_neighborhood_ratio": illicit_n / max(n_tx.total_degree, 1),
                            "total_neighbors": n_tx.total_degree
                        },
                        features=n_tx.features
                    )
                    final_score = score
                    final_level = level.value
                    prob_val = prob
                else:
                    pred = None
                    prob_val = None
                    score, level, _ = calculate_risk_score(
                        known_label=label_str,
                        ml_probability=0.0,
                        graph_metrics={
                            "known_illicit_neighbors": illicit_n,
                            "suspicious_neighbors_count": 0,
                            "illicit_neighborhood_ratio": illicit_n / max(n_tx.total_degree, 1),
                            "total_neighbors": n_tx.total_degree
                        },
                        features=n_tx.features
                    )
                    final_score = score
                    final_level = level.value

                tx_records.append({
                    "transaction_id": n_tx.transaction_id,
                    "time_step": n_tx.time_step,
                    "known_label": label_str,
                    "prediction": pred,
                    "prediction_probability": prob_val,
                    "risk_score": final_score,
                    "risk_level": final_level,
                    "in_degree": n_tx.in_degree,
                    "out_degree": n_tx.out_degree,
                    "total_degree": n_tx.total_degree
                })

                if n_tx.features is not None:
                    feat_records.append({
                        "transaction_id": n_tx.transaction_id,
                        "features": json.dumps(n_tx.features),
                        "feature_summary": json.dumps({
                            "dim": len(n_tx.features),
                            "min": round(float(min(n_tx.features)), 3),
                            "max": round(float(max(n_tx.features)), 3)
                        })
                    })

            # Bulk insert transactions and features
            db.bulk_insert_mappings(Transaction, tx_records)
            db.bulk_insert_mappings(TransactionFeature, feat_records)
            db.commit()

            total_inserted_txs += len(tx_records)
            total_inserted_features += len(feat_records)

            print(f"  Batch {batch_num:02d}: Ingested & scored {total_inserted_txs:,} transactions & features...")

        # 7. Stream and Bulk-Insert Graph Edges
        print("\n--- PHASE 2: INGESTING GRAPH EDGES ---")
        edge_stream = loader.stream_edges(batch_size=batch_size * 2)

        for edge_batch_num, edge_batch in enumerate(edge_stream, start=1):
            if edges_limit and total_inserted_edges >= edges_limit:
                break

            edge_records = [
                {
                    "source_transaction_id": n_edge.source_transaction_id,
                    "destination_transaction_id": n_edge.destination_transaction_id
                }
                for n_edge in edge_batch
            ]
            if edges_limit and total_inserted_edges + len(edge_records) > edges_limit:
                edge_records = edge_records[:edges_limit - total_inserted_edges]

            db.bulk_insert_mappings(TransactionEdge, edge_records)
            db.commit()

            total_inserted_edges += len(edge_records)
            if edge_batch_num % 5 == 0 or total_inserted_edges == metadata.total_edges:
                print(f"  Edge Batch {edge_batch_num:02d}: Ingested {total_inserted_edges:,} edges...")

        # Update run status
        elapsed = time.time() - start_time
        run_record.status = "COMPLETED"
        run_record.rows_processed = total_inserted_txs + total_inserted_edges
        run_record.completed_at = datetime.utcnow()
        db.commit()

        print("\n" + "=" * 70)
        print("INGESTION & ML SCORING COMPLETED SUCCESSFULLY")
        print("=" * 70)
        print(f"Transactions Ingested : {total_inserted_txs:,}")
        print(f"Features Ingested     : {total_inserted_features:,}")
        print(f"Directed Edges        : {total_inserted_edges:,}")
        print(f"Total Database Rows   : {total_inserted_txs + total_inserted_features + total_inserted_edges:,}")
        print(f"Time Elapsed          : {elapsed:.2f} seconds")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        run_record.status = "FAILED"
        run_record.error_message = str(e)
        db.commit()
        print(f"\n[FATAL] Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Elliptic dataset into ChainGuard database")
    parser.add_argument("--data-dir", default=os.getenv("DATASET_PATH", "data/elliptic_bitcoin_dataset"),
                        help="Path to directory containing Elliptic CSV files")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of transactions to ingest (useful for testing)")
    parser.add_argument("--edges-limit", type=int, default=None,
                        help="Limit number of edges to ingest")
    parser.add_argument("--batch-size", type=int, default=10000,
                        help="Batch insert chunk size")
    parser.add_argument("--no-clear", action="store_true",
                        help="Do not clear existing transaction/edge records")
    args = parser.parse_args()

    run_ingestion(
        data_dir=args.data_dir,
        limit=args.limit,
        edges_limit=args.edges_limit,
        batch_size=args.batch_size,
        clear=not args.no_clear
    )
