#!/usr/bin/env python3
"""
TRACE-X Forensic Platform
Elliptic Dataset Inspection Script
Reports comprehensive statistics, class distribution, temporal properties, and graph properties.
"""

import os
import sys
import argparse
from pathlib import Path
import pandas as pd
import numpy as np

def inspect_dataset(dataset_dir: str):
    dir_path = Path(dataset_dir)
    print("=" * 70)
    print("TRACE-X FORENSIC PLATFORM - ELLIPTIC DATASET INSPECTION")
    print("=" * 70)
    print(f"Target Directory: {dir_path.resolve()}")

    classes_file = dir_path / "elliptic_txs_classes.csv"
    edgelist_file = dir_path / "elliptic_txs_edgelist.csv"
    features_file = dir_path / "elliptic_txs_features.csv"

    for f, name in [(classes_file, "Classes"), (edgelist_file, "Edgelist"), (features_file, "Features")]:
        if not f.exists():
            print(f"[ERROR] Required dataset file not found: {f}")
            sys.exit(1)
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  * {name} File: {f.name} ({size_mb:.2f} MB)")

    print("\n--- 1. CLASSES ANALYSIS ---")
    classes_df = pd.read_csv(classes_file)
    total_txs = len(classes_df)
    print(f"Total Transactions in Classes file: {total_txs:,}")

    # Check duplicates and nulls
    dup_txs = classes_df["txId"].duplicated().sum()
    null_classes = classes_df["class"].isnull().sum()
    print(f"Duplicate Transaction IDs: {dup_txs}")
    print(f"Missing (Null) Class Values: {null_classes}")

    # Class distribution
    # 1: illicit, 2: licit, 'unknown': unknown
    val_counts = classes_df["class"].value_counts(dropna=False)
    illicit_count = int(val_counts.get("1", 0) or val_counts.get(1, 0))
    licit_count = int(val_counts.get("2", 0) or val_counts.get(2, 0))
    unknown_count = int(val_counts.get("unknown", 0))

    print(f"\nClass Distribution:")
    print(f"  - Known Illicit (1): {illicit_count:,} ({illicit_count / total_txs * 100:.2f}%)")
    print(f"  - Known Licit   (2): {licit_count:,} ({licit_count / total_txs * 100:.2f}%)")
    print(f"  - Unknown          : {unknown_count:,} ({unknown_count / total_txs * 100:.2f}%)")
    total_labeled = illicit_count + licit_count
    print(f"  - Total Labeled    : {total_labeled:,} ({total_labeled / total_txs * 100:.2f}%)")
    print(f"  - Class Imbalance (Illicit/Licit ratio): 1 : {licit_count / max(illicit_count, 1):.1f}")

    print("\n--- 2. GRAPH EDGELIST ANALYSIS ---")
    edges_df = pd.read_csv(edgelist_file)
    total_edges = len(edges_df)
    print(f"Total Directed Edges: {total_edges:,}")
    dup_edges = edges_df.duplicated().sum()
    print(f"Duplicate Edges: {dup_edges}")
    unique_src = edges_df["txId1"].nunique()
    unique_dst = edges_df["txId2"].nunique()
    all_edge_nodes = set(edges_df["txId1"]).union(set(edges_df["txId2"]))
    print(f"Unique Source Transactions: {unique_src:,}")
    print(f"Unique Destination Transactions: {unique_dst:,}")
    print(f"Total Unique Nodes in Graph: {len(all_edge_nodes):,}")

    # Out/In degree stats
    out_degrees = edges_df["txId1"].value_counts()
    in_degrees = edges_df["txId2"].value_counts()
    print(f"Max Out-degree: {out_degrees.max()} | Mean Out-degree: {out_degrees.mean():.2f}")
    print(f"Max In-degree:  {in_degrees.max()} | Mean In-degree:  {in_degrees.mean():.2f}")

    print("\n--- 3. FEATURES & TEMPORAL ANALYSIS ---")
    # Read chunk of features to inspect columns & time steps without blowing RAM
    time_steps = set()
    total_features_rows = 0
    num_cols = 0
    sample_stats = []

    print("Reading features file metadata (streaming)...")
    for chunk in pd.read_csv(features_file, header=None, chunksize=50000):
        total_features_rows += len(chunk)
        num_cols = chunk.shape[1]
        time_steps.update(chunk[1].unique())
        if len(sample_stats) == 0:
            sample_stats.append(chunk.iloc[:, 2:].describe())

    # Column 0 = txId, Column 1 = time_step, Columns 2.. = 165 features
    num_features = num_cols - 2
    sorted_timesteps = sorted(list(time_steps))
    print(f"Total Rows in Features: {total_features_rows:,}")
    print(f"Feature Columns Count: {num_features} (plus txId and time_step)")
    print(f"Total Time Steps: {len(sorted_timesteps)} (Range: {min(sorted_timesteps)} to {max(sorted_timesteps)})")

    print("\n--- 4. DATASET CONSISTENCY CHECK ---")
    tx_classes_set = set(classes_df["txId"])
    print(f"Consistency Check: classes ({total_txs:,}) == features ({total_features_rows:,}): {total_txs == total_features_rows}")

    print("\n" + "=" * 70)
    print("INSPECTION SUMMARY COMPLETED")
    print("=" * 70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect Elliptic Bitcoin Dataset")
    parser.add_argument("--data-dir", default=os.getenv("DATASET_PATH", "data/elliptic_bitcoin_dataset"),
                        help="Path to directory containing Elliptic CSV files")
    args = parser.parse_args()
    inspect_dataset(args.data_dir)
