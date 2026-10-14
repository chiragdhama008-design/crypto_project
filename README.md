# 🔍 TRACE-X — Forensic Intelligence Platform for Bitcoin Transaction Analysis

> An end-to-end crypto forensic analysis platform that ingests the [Elliptic Bitcoin Dataset](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set), trains machine-learning models to classify transactions as **illicit** or **licit**, computes composite risk scores, visualizes transaction graphs, and provides an investigation case-management dashboard — all through a modern React + FastAPI full-stack application.

---

## 📑 Table of Contents

- [What Does This Project Do?](#-what-does-this-project-do)
- [High-Level Architecture](#-high-level-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure (Folder by Folder)](#-project-structure-folder-by-folder)
  - [Root Files](#root-files)
  - [`backend/` — Python FastAPI Server](#backend--python-fastapi-server)
  - [`frontend/` — React + TypeScript Dashboard](#frontend--react--typescript-dashboard)
  - [`models/` — Trained ML Artifacts](#models--trained-ml-artifacts)
  - [`scripts/` — CLI Data Pipelines](#scripts--cli-data-pipelines)
  - [`sql/` — Database Schema](#sql--database-schema)
- [The Dataset — Elliptic Bitcoin](#-the-dataset--elliptic-bitcoin)
- [How the ML Pipeline Works](#-how-the-ml-pipeline-works)
- [How Risk Scoring Works](#-how-risk-scoring-works)
- [API Endpoints](#-api-endpoints)
- [Frontend Pages](#-frontend-pages)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone & Configure](#1-clone--configure)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Ingest the Dataset](#3-ingest-the-dataset)
  - [4. Train ML Models](#4-train-ml-models)
  - [5. Start the Backend](#5-start-the-backend)
  - [6. Start the Frontend](#6-start-the-frontend)
- [Environment Variables](#-environment-variables)
- [Running Tests](#-running-tests)

---

## 🧠 What Does This Project Do?

Imagine you have **203,769 Bitcoin transactions** and you want to figure out which ones are linked to fraud, money laundering, or other illegal activity. That's exactly what TRACE-X does:

1. **Ingests** real-world Bitcoin transaction data (the Elliptic dataset with 200K+ transactions, 234K+ edges, and 165 features per transaction).
2. **Trains** machine learning models (Logistic Regression, Random Forest, Gradient Boosting) to predict whether a transaction is **illicit** or **licit**.
3. **Scores** every transaction with a composite **risk score (0–100)** using ML predictions, graph topology, and feature anomalies.
4. **Visualizes** the transaction graph so you can explore how money flows between suspicious and clean nodes.
5. **Provides** a case management system where investigators can group transactions, add notes, and generate forensic reports.

---

## 🏗 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER / BROWSER                                  │
│                                                                        │
│   React + TypeScript + TailwindCSS + Recharts + Cytoscape.js           │
│   (Vite dev server on http://localhost:5173)                           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  HTTP REST API calls (/api/*)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND (Python)                           │
│                     http://localhost:8000                               │
│                                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐    │
│  │ API      │  │ ML       │  │ Graph    │  │ Risk Scoring        │    │
│  │ Routes   │  │ Pipeline │  │ Engine   │  │ Engine              │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┬───────────┘    │
│       │              │             │                  │                │
│       └──────────────┴─────────────┴──────────────────┘                │
│                          │                                             │
│                    SQLAlchemy ORM                                       │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌────────────────────┐   ┌────────────────────────┐
   │  Supabase          │   │  Local SQLite           │
   │  PostgreSQL        │   │  (tracex_dev.db)        │
   │  (Production)      │   │  (Development fallback) │
   └────────────────────┘   └────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer       | Technology                                                                 |
|-------------|----------------------------------------------------------------------------|
| **Frontend**   | React 19, TypeScript, Vite 8, TailwindCSS 3, Recharts (charts), Cytoscape.js (graph viz), Lucide React (icons), React Router v7 |
| **Backend**    | Python, FastAPI, SQLAlchemy, Pydantic, Supabase Python SDK                |
| **ML & GNN**   | PyTorch & PyTorch Geometric (2-Layer GraphSAGE), scikit-learn (Logistic Regression, Random Forest, Gradient Boosting), NumPy, Pandas, joblib |
| **Database**   | Supabase PostgreSQL (production) / SQLite (local dev fallback)            |
| **Dataset**    | [Elliptic Bitcoin Dataset](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set) — 203K transactions, 234K edges, 165 features |

---

## 📁 Project Structure (Folder by Folder)

```
crypto_project/
├── .env.example            # Template for environment variables
├── .gitignore              # Files excluded from version control
├── tracex_dev.db           # Local SQLite database (auto-created, gitignored)
│
├── backend/                # ← Python FastAPI server (ALL server-side logic)
│   ├── app/
│   │   ├── main.py         #    App entry point — starts FastAPI, mounts routes
│   │   ├── config.py       #    Loads environment variables (Supabase keys, model config, etc.)
│   │   ├── database.py     #    Database connection setup (Supabase PostgreSQL or SQLite fallback)
│   │   ├── models.py       #    SQLAlchemy ORM table definitions
│   │   │
│   │   ├── api/routes/     #    REST API route handlers (one file per feature)
│   │   │   ├── health.py        # GET /api/health — system health check
│   │   │   ├── dashboard.py     # GET /api/dashboard — overview stats & charts
│   │   │   ├── transactions.py  # CRUD /api/transactions — search, filter, paginate
│   │   │   ├── graph.py         # GET /api/graph/:id — subgraph traversal
│   │   │   ├── risk.py          # GET /api/risk — risk alerts & high-risk transactions
│   │   │   ├── models.py        # GET /api/models — ML & GNN performance metrics
│   │   │   ├── analytics.py     # GET /api/analytics — aggregate stats
│   │   │   ├── cases.py         # CRUD /api/cases — investigation case management
│   │   │   ├── reports.py       # GET /api/reports/:id — forensic report generation
│   │   │   ├── ml.py            # POST /api/ml/predict — real-time ML & GNN inference
│   │   │   └── dataset.py       # GET /api/dataset — dataset statistics
│   │   │
│   │   ├── data_sources/   #    Data ingestion & normalization layer
│   │   │   ├── common/
│   │   │   │   ├── schemas.py       # Shared Pydantic models (NormalizedTransaction, enums)
│   │   │   │   └── base_source.py   # Abstract base class for data sources
│   │   │   └── elliptic/
│   │   │       ├── loader.py        # Reads Elliptic CSV files, streams in batches
│   │   │       ├── parser.py        # Parses raw CSV rows into NormalizedTransaction objects
│   │   │       └── mapper.py        # Maps Elliptic class codes (1/2/unknown) → labels
│   │   │
│   │   ├── ml/             #    Machine learning & Graph Neural Network modules
│   │   │   ├── gnn_model.py     # 2-Layer BitcoinGraphSAGE architecture (PyG SAGEConv)
│   │   │   ├── gnn_train.py     # Graph construction, temporal training, early stopping
│   │   │   ├── gnn_predict.py   # Graph-aware inference with neighborhood message passing
│   │   │   ├── preprocessing.py # Temporal train/val/test split of Elliptic data
│   │   │   ├── train.py         # Trains baseline classifiers (LR, RF, GB)
│   │   │   ├── predict.py       # Unified inference dispatcher (GNN + baseline models)
│   │   │   ├── evaluate.py      # Computes precision, recall, F1, ROC-AUC, confusion matrix
│   │   │   └── explain.py       # Feature anomaly detection (z-score signals)
│   │   │
│   │   ├── graph/          #    Transaction graph analysis
│   │   │   ├── traversal.py     # 1-hop / 2-hop BFS subgraph extraction
│   │   │   └── risk.py          # Neighborhood risk signals (illicit neighbors, fan-in/out)
│   │   │
│   │   ├── risk/           #    Composite risk scoring
│   │   │   └── engine.py        # Multi-signal risk score formula (0–100)
│   │   │
│   │   ├── investigations/ #    Case management service
│   │   │   └── service.py       # CRUD for cases, case-transactions, notes
│   │   │
│   │   ├── reports/        #    Forensic report generation
│   │   │   └── generator.py     # Builds case dossier reports with evidence items
│   │   │
│   │   └── schemas/        #    Pydantic response schemas for API validation
│   │       ├── dashboard.py     # Dashboard response models
│   │       ├── transactions.py  # Transaction list/detail schemas
│   │       └── graph.py         # Graph response models
│   │
│   └── tests/              #    Backend unit & integration tests
│       ├── test_api.py          # API endpoint tests
│       ├── test_labels.py       # Label mapping tests
│       ├── test_risk_engine.py  # Risk scoring formula tests
│       └── test_gnn.py          # Graph construction, temporal split, GNN inference tests
│
├── models/                 # ← Saved trained model checkpoints & metrics
│   ├── gnn_model.pt             # PyTorch BitcoinGraphSAGE trained checkpoint
│   ├── gnn_metrics.json         # Real test evaluation metrics for GNN
│   ├── gnn_metadata.joblib      # Node index mapping & graph metadata
│   ├── gradient_boosting.joblib # HistGradientBoosting checkpoint
│   ├── random_forest.joblib     # RandomForestClassifier checkpoint
│   └── logistic_regression.joblib# LogisticRegression checkpoint
│
├── frontend/               # ← React + TypeScript UI
│   ├── package.json        #    NPM dependencies & scripts
│   ├── vite.config.ts      #    Vite dev server configuration
│   ├── tailwind.config.js  #    TailwindCSS theme customization
│   ├── index.html          #    HTML entry point
│   └── src/
│       ├── main.tsx         #    React entry point — renders <App />
│       ├── App.tsx          #    Router definition — maps URL paths to pages
│       ├── index.css        #    Global CSS styles
│       ├── App.css          #    App-level CSS overrides
│       │
│       ├── pages/           #    Full-page components (one per route)
│       │   ├── Overview.tsx              # "/" — Main dashboard with stats & charts
│       │   ├── Transactions.tsx          # "/transactions" — Searchable transaction table
│       │   ├── TransactionInvestigation.tsx # "/transactions/:id" — Deep-dive single tx view
│       │   ├── GraphExplorer.tsx         # "/graph" — Interactive Cytoscape graph visualization
│       │   ├── RiskAlerts.tsx            # "/risk" — High-risk transaction alerts feed
│       │   ├── ModelPerformance.tsx       # "/models" — ML metrics, ROC curves, confusion matrix
│       │   ├── Analytics.tsx             # "/analytics" — Aggregate analytics & breakdowns
│       │   ├── Investigations.tsx        # "/investigations" — Case list & management
│       │   ├── CaseDetail.tsx            # "/cases/:id" — Single case detail with transactions
│       │   ├── Reports.tsx               # "/reports" — Forensic report viewer
│       │   ├── Dataset.tsx               # "/dataset" — Dataset statistics & info
│       │   └── Methodology.tsx           # "/methodology" — How the system works (explainer)
│       │
│       ├── components/      #    Reusable UI components
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx           # Left navigation sidebar
│       │   │   └── TopBar.tsx            # Top header bar with search
│       │   ├── common/
│       │   │   ├── LabelBadge.tsx        # Colored ILLICIT/LICIT/UNKNOWN badge
│       │   │   └── RiskBadge.tsx         # Colored LOW/MEDIUM/HIGH/CRITICAL badge
│       │   ├── graph/
│       │   │   └── CytoscapeCanvas.tsx   # Cytoscape.js graph renderer
│       │   └── investigations/
│       │       └── AddToCaseModal.tsx     # Modal to add transactions to cases
│       │
│       ├── services/
│       │   └── api.ts       #    Axios/fetch API client — all backend HTTP calls
│       │
│       └── types/
│           └── api.ts       #    TypeScript type definitions for API responses
│
└── scripts/                 # ← Standalone utility & ETL scripts
    ├── train_model.py       # Trains GNN, Random Forest, Gradient Boosting, or Logistic Regression
    ├── ingest_dataset.py    # Ingests Elliptic CSV transactions and edges into database
    └── inspect_dataset.py   # Dataset inspection & verification utility
```

## 🤖 How the ML & Graph Neural Network Pipeline Works

```
  Elliptic CSVs                    Temporal Split                    Training
┌───────────────┐   ┌───────────────────────────────┐   ┌─────────────────────────────┐
│ features.csv  │──▶│ Timesteps 1–34  → TRAIN       │──▶│ Logistic Regression         │
│ classes.csv   │   │ Timesteps 35–39 → VALIDATION  │   │ Random Forest               │
│ edgelist.csv  │   │ Timesteps 40–49 → TEST        │   │ Gradient Boosting           │
└───────────────┘   └───────────────────────────────┘   │ Graph Neural Network (GNN)  │
                                                        └──────────────┬──────────────┘
                                                                       │
                     Evaluation Metrics                                │
                    ┌───────────────────────────────┐                  │
                    │ Precision, Recall, F1-Score    │◀─────────────────┘
                    │ ROC-AUC, PR-AUC, Accuracy      │
                    │ Confusion Matrix               │
                    │ Illicit-class (Minority) focus │
                    └───────────────────────────────┘
```

### Why "Temporal Split" instead of Random Split?

In real-world fraud detection, you can't use future data to predict the past. The Elliptic dataset has **49 time steps** representing consecutive 3-hour periods. We train strictly on earlier timesteps (1–34), validate on intermediate timesteps (35–39), and test on unseen future activity (40–49) — this simulates a realistic production deployment scenario.

**Zero Graph Leakage Guarantee:** In the Elliptic dataset, all 234,355 directed edges connect transactions confirmed within the *exact same 3-hour timestep*. There are 0 cross-timestep edges. Thus, message passing during training on timesteps 1–34 has zero access to future graph topology or labels from timesteps 40–49.

### The 4 Models

| Model | Architecture | Input Modality | Strengths |
|-------|--------------|----------------|-----------|
| **Graph Neural Network (GNN)** | 2-Layer GraphSAGE (`SAGEConv`) | Graph Edges (234K) + 165 Features | Directly aggregates counterparty flows to capture multi-hop peeling chains & mule rings |
| **Gradient Boosting** | HistGradientBoostingClassifier | 165 Tabular Features | Top tabular precision, captures complex non-linear feature interactions |
| **Random Forest** | 100-Tree Bagged Decision Forest | 165 Tabular Features | Robust against noise, high precision, interpretable feature importances |
| **Logistic Regression** | L2-Regularized Linear Classifier | 165 Tabular Features | Fast, linear baseline, highly interpretable coefficient weights |

### Graph Neural Network (GraphSAGE) Deep Dive

Unlike conventional classifiers that treat each Bitcoin transaction as an isolated tabular row, TRACE-X includes a **Graph Neural Network (GNN)** built with PyTorch and PyTorch Geometric:
1. **Nodes & Features:** Every transaction is a node with 165 normalized features.
2. **Connectivity:** 234,355 directed edges are converted to bidirectional connectivity for message passing, allowing representations to incorporate both funding sources (upstream) and spending dispersal (downstream).
3. **Neighborhood Aggregation:** Two `SAGEConv` layers aggregate representations from 1-hop and 2-hop transaction neighbors:
   $$\mathbf{h}_v^{(k)} = \text{ReLU}\left(\mathbf{W}^{(k)} \cdot \left[\mathbf{h}_v^{(k-1)} \,\|\, \text{AGG}(\{\mathbf{h}_u^{(k-1)} : u \in \mathcal{N}(v)\})\right]\right)$$
4. **Unknown Label Preservation:** 157,205 unlabeled transactions are preserved in the graph to supply structural neighborhood context, but are strictly excluded from supervised optimization.
5. **Class Imbalance Optimization:** Weighted CrossEntropy ($w_{\text{illicit}} \approx 7.63$) counters the ~1:8 imbalance in the training partition.
## What the labels mean

- **Class 1 (Illicit):** ~4,545 transactions confirmed to be linked to scams, malware, Ponzi schemes, ransomware, etc.
- **Class 2 (Licit):** ~42,019 transactions confirmed to be from legitimate exchanges, wallets, mining pools, etc.
- **Unknown:** ~157,205 transactions with no ground truth label — the ML model predicts these.

### What the 165 features represent

- **Features 1–94 (Local):** Properties of the transaction itself (obfuscated for privacy — things like transaction value, number of inputs/outputs, fee, etc.).
- **Features 95–165 (Aggregate):** Aggregated statistics from the transaction's 1-hop neighbors in the graph (mean, std, min, max of their local features).

---

## 🤖 How the ML Pipeline Works

```
  Elliptic CSVs                    Temporal Split                    Training
┌───────────────┐   ┌───────────────────────────────┐   ┌─────────────────────┐
│ features.csv  │──▶│ Timesteps 1–34  → TRAIN       │──▶│ Logistic Regression │
│ classes.csv   │   │ Timesteps 35–39 → VALIDATION  │   │ Random Forest       │
│ edgelist.csv  │   │ Timesteps 40–49 → TEST        │   │ Gradient Boosting   │
└───────────────┘   └───────────────────────────────┘   └─────────┬───────────┘
                                                                  │
                     Evaluation Metrics                           │
                    ┌───────────────────────────────┐             │
                    │ Precision, Recall, F1-Score    │◀────────────┘
                    │ ROC-AUC, PR-AUC, Accuracy      │
                    │ Confusion Matrix               │
                    │ Per-class (Illicit) metrics     │
                    └───────────────────────────────┘
```

### Why "Temporal Split" instead of Random Split?

In real-world fraud detection, you can't use future data to predict the past. The Elliptic dataset has **49 time steps** representing consecutive periods. We train on earlier timesteps and test on later ones — this simulates a realistic deployment scenario where the model must generalize to new, unseen transaction patterns.

### The 3 Models

| Model | What It Is | Strengths |
|-------|-----------|-----------|
| **Logistic Regression** | A simple linear classifier | Fast, interpretable, good baseline |
| **Random Forest** | Ensemble of many decision trees | Handles non-linear patterns, robust |
| **Gradient Boosting** | Sequential tree ensemble (XGBoost-style) | Best accuracy, captures complex signals |

After training, the best model (default: **Gradient Boosting**) is used for real-time inference during data ingestion and on the dashboard.

---

## ⚠️ How Risk Scoring Works

Every transaction gets a **risk score from 0 to 100**, computed by the **deterministic multi-signal risk engine** in `backend/app/risk/engine.py`. The score is **not** just the ML probability — it combines four signals:

| Signal | Weight | What It Measures |
|--------|--------|-----------------|
| **ML Probability** | 55% | How confident the model is that this transaction is illicit (probability × 55) |
| **Graph Exposure** | 25% | Is this transaction connected to known/predicted illicit nodes? How many? |
| **Structural Topology** | 10% | Does this transaction have abnormally high fan-in or fan-out (many inputs/outputs)? |
| **Feature Anomaly** | 10% | Do any of the 165 features show extreme z-score deviations (|z| > 3.0)? |

### Risk Levels

| Score Range | Level | What It Means |
|-------------|-------|---------------|
| 0 – 30 | 🟢 **LOW** | Normal activity, low suspicion |
| 31 – 60 | 🟡 **MEDIUM** | Some anomalous signals, worth monitoring |
| 61 – 80 | 🟠 **HIGH** | Multiple risk indicators triggered |
| 81 – 100 | 🔴 **CRITICAL** | Strong evidence of illicit activity |

### Overrides

- If a transaction is **confirmed illicit** (ground truth), its minimum score is **90**.
- If a transaction is **confirmed licit**, has low ML probability, and no illicit neighbors, its maximum score is capped at **25**.

---

## 🌐 API Endpoints

The backend exposes a REST API under the `/api` prefix:

| Method | Endpoint | What It Does |
|--------|----------|-------------|
| `GET` | `/api/health` | System health check — database status, model status |
| `GET` | `/api/dashboard` | Overview statistics — total transactions, risk distribution, label breakdown |
| `GET` | `/api/transactions` | Paginated, filterable transaction list (by label, risk level, time step) |
| `GET` | `/api/transactions/:id` | Full detail for a single transaction (features, risk breakdown, graph signals) |
| `GET` | `/api/graph/:id` | 1-hop or 2-hop subgraph around a transaction (nodes + edges) |
| `GET` | `/api/risk/alerts` | High-risk and critical-risk transactions sorted by score |
| `GET` | `/api/models/metrics` | Performance metrics for all trained models |
| `GET` | `/api/analytics` | Aggregate analytics (temporal trends, label distributions) |
| `POST` | `/api/cases` | Create a new investigation case |
| `GET` | `/api/cases` | List all investigation cases |
| `GET` | `/api/cases/:id` | Get case detail with associated transactions and notes |
| `PUT` | `/api/cases/:id` | Update case name, description, or status |
| `POST` | `/api/cases/:id/transactions` | Add transactions to a case |
| `POST` | `/api/cases/:id/notes` | Add investigator notes to a case |
| `GET` | `/api/reports/:caseId` | Generate a full forensic intelligence dossier for a case |
| `POST` | `/api/ml/predict` | Run real-time ML inference on a 165-feature vector |
| `GET` | `/api/dataset` | Dataset metadata and statistics |

Interactive API docs are available at **http://localhost:8000/docs** (Swagger UI) when the backend is running.

---

## 🖥 Frontend Pages

| Route | Page | What You See |
|-------|------|-------------|
| `/` | **Overview** | Dashboard with total transaction counts, risk distribution pie chart, label breakdown, and temporal activity trends |
| `/transactions` | **Transactions** | Searchable, paginated table of all transactions with label/risk badges and filters |
| `/transactions/:id` | **Transaction Investigation** | Deep-dive view: risk score breakdown, feature anomaly signals, graph neighborhood, and "Add to Case" action |
| `/graph` | **Graph Explorer** | Interactive Cytoscape.js graph — enter a transaction ID, see its 1-hop/2-hop neighborhood with color-coded illicit/licit nodes |
| `/risk` | **Risk Alerts** | Feed of highest-risk transactions sorted by composite risk score |
| `/models` | **Model Performance** | ROC curves, PR curves, confusion matrices, and per-metric comparison across all 3 models |
| `/analytics` | **Analytics** | Aggregate charts — illicit vs. licit distributions over time, risk level breakdowns |
| `/investigations` | **Investigations** | Create and manage investigation cases |
| `/cases/:id` | **Case Detail** | View/manage a single case — associated transactions, notes, and forensic evidence |
| `/reports` | **Reports** | Generate and view forensic intelligence dossiers for investigation cases |
| `/dataset` | **Dataset** | Elliptic dataset statistics — class distribution, graph properties, feature info |
| `/methodology` | **Methodology** | Explainer page describing how the ML models, risk scoring, and graph analysis work |

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+** ([Download](https://www.python.org/downloads/))
- **Node.js 18+** and **npm** ([Download](https://nodejs.org/))
- **The Elliptic Dataset** — Download from [Kaggle](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set) and extract it somewhere on your machine

### 1. Clone & Configure

```bash
git clone <repository-url>
cd crypto_project

# Create your environment file from the template
cp .env.example .env
```

Edit `.env` and set:
- `DATASET_PATH` — the folder where you extracted the Elliptic dataset (containing the 3 CSV files)
- (Optional) Supabase credentials if you want PostgreSQL instead of SQLite

### 2. Backend Setup

```bash
# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# Install Python dependencies
pip install fastapi uvicorn sqlalchemy pydantic pydantic-settings supabase
pip install scikit-learn pandas numpy joblib
```

### 3. Ingest the Dataset

This reads the Elliptic CSVs, runs ML inference on every transaction, computes risk scores, and bulk-inserts everything into the database:

```bash
python scripts/ingest_dataset.py --data-dir "path/to/elliptic_bitcoin_dataset"
```

Options:
- `--limit 10000` — Ingest only the first 10K transactions (for quick testing)
- `--batch-size 5000` — Adjust batch insert size
- `--no-clear` — Don't clear existing data before inserting

### 4. Train ML Models

This trains the 3 classifiers using temporal split and saves model artifacts + metrics:

```bash
python scripts/train_model.py --data-dir "path/to/elliptic_bitcoin_dataset"
```

Options:
- `--models logistic_regression random_forest gradient_boosting` — Choose which models to train
- `--no-db` — Don't write metrics to the database

### 5. Start the Backend

```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is now live at **http://localhost:8000**. Visit **http://localhost:8000/docs** for interactive API docs.

### 6. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard is now live at **http://localhost:5173**.

---

## 🔐 Environment Variables

| Variable | Required? | Description |
|----------|-----------|-------------|
| `SUPABASE_URL` | No | Your Supabase project URL (for PostgreSQL). If not set, uses local SQLite. |
| `SUPABASE_ANON_KEY` | No | Supabase anonymous API key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (full access) |
| `DATABASE_URL` | No | PostgreSQL connection string from Supabase |
| `DATASET_PATH` | **Yes** | Local path to the folder containing the 3 Elliptic CSV files |
| `HOST` | No | Backend server host (default: `0.0.0.0`) |
| `PORT` | No | Backend server port (default: `8000`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins for CORS |
| `MODEL_CACHE_DIR` | No | Directory for saved model files (default: `models`) |
| `ACTIVE_MODEL` | No | Which model to use for inference (default: `gradient_boosting`) |

---

## 🧪 Running Tests

```bash
# From the project root
python -m pytest backend/tests/ -v
```

Tests cover:
- **API Endpoints** — Health check, transaction queries
- **Label Mapping** — Correct Elliptic class code → ILLICIT/LICIT/UNKNOWN conversion
- **Risk Engine** — Deterministic scoring formula produces expected outputs for known inputs

---

## 📄 License

This project is for educational and research purposes. The Elliptic dataset is provided under its own [license terms](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set).
