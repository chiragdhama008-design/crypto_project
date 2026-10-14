"""
TRACE-X Database and Supabase Client Layer.
Handles database connections, schema execution, connection pooling, and client wrappers.
"""

import os
from typing import Optional, Generator, Dict, Any
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from supabase import create_client, Client
from backend.app.config import settings

Base = declarative_base()

_engine = None
_SessionLocal = None
_supabase_client: Optional[Client] = None
_db_status = {
    "connected": False,
    "provider": "None",
    "error": None,
    "tables_initialized": False
}


def get_supabase_client() -> Optional[Client]:
    """Initializes and returns the Supabase client if credentials exist."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if settings.has_supabase_api:
        try:
            key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
            _supabase_client = create_client(settings.SUPABASE_URL, key)
            return _supabase_client
        except Exception as e:
            print(f"[Database] Warning: Supabase client initialization error: {e}")
            return None
    return None


def get_database_url() -> str:
    """Returns database URL or local PostgreSQL / developer fallback."""
    if settings.has_supabase_db:
        url = settings.DATABASE_URL
        # Ensure postgresql:// prefix (some tools give postgres://)
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url
    # Fallback to local SQLite file for immediate local developer validation before Supabase keys are pasted
    return "sqlite:///./tracex_dev.db"


def init_db():
    """Initializes database engine and checks connection."""
    global _engine, _SessionLocal, _db_status
    db_url = get_database_url()
    is_postgres = db_url.startswith("postgresql")

    connect_args = {}
    if not is_postgres:
        connect_args["check_same_thread"] = False

    try:
        _engine = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args=connect_args
        )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
        
        # Test connection
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        _db_status["connected"] = True
        _db_status["provider"] = "Supabase PostgreSQL" if is_postgres else "Local Developer Storage"
        _db_status["error"] = None
        print(f"[Database] Successfully connected to {_db_status['provider']}")

        # Ensure schema tables exist
        initialize_schema()

    except Exception as e:
        if is_postgres:
            print(f"[Database] Primary PostgreSQL connection failed ({e}). Falling back to local developer SQLite storage...")
            try:
                db_url = "sqlite:///./tracex_dev.db"
                _engine = create_engine(db_url, pool_pre_ping=True, connect_args={"check_same_thread": False})
                _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
                with _engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                _db_status["connected"] = True
                _db_status["provider"] = "Local Developer Storage"
                _db_status["error"] = None
                print(f"[Database] Successfully connected to fallback {_db_status['provider']}")
                initialize_schema()
                return
            except Exception as fallback_e:
                print(f"[Database] Fallback storage failed: {fallback_e}")
        _db_status["connected"] = False
        _db_status["provider"] = "None"
        _db_status["error"] = str(e)
        print(f"[Database] Connection warning: {e}")


def initialize_schema():
    """Creates tables if they do not exist."""
    global _engine, _db_status
    if not _engine:
        return

    schema_file = os.path.join(os.path.dirname(__file__), "..", "..", "sql", "schema.sql")
    if not os.path.exists(schema_file):
        schema_file = "sql/schema.sql"

    try:
        is_postgres = (_db_status.get("provider") == "Supabase PostgreSQL")

        if is_postgres and os.path.exists(schema_file):
            with open(schema_file, "r", encoding="utf-8") as f:
                ddl = f.read()
            with _engine.connect() as conn:
                # Execute DDL statements
                conn.execute(text(ddl))
                conn.commit()
            _db_status["tables_initialized"] = True
            print("[Database] Supabase schema DDL verified/executed.")
        else:
            # For SQLite developer mode, execute compatible table creation
            _create_sqlite_dev_tables()
            _db_status["tables_initialized"] = True
    except Exception as e:
        print(f"[Database] Schema creation notice: {e}")


def _create_sqlite_dev_tables():
    """Creates compatible tables for development if Postgres is not yet configured."""
    ddl = """
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER UNIQUE NOT NULL,
        time_step INTEGER NOT NULL,
        known_label VARCHAR(16) NOT NULL,
        prediction VARCHAR(16),
        prediction_probability REAL,
        risk_score INTEGER,
        risk_level VARCHAR(16),
        in_degree INTEGER DEFAULT 0,
        out_degree INTEGER DEFAULT 0,
        total_degree INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transaction_features (
        transaction_id INTEGER PRIMARY KEY,
        features TEXT NOT NULL,
        feature_summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transaction_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_transaction_id INTEGER NOT NULL,
        destination_transaction_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS model_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        model_name VARCHAR(64) NOT NULL,
        prediction VARCHAR(16) NOT NULL,
        probability REAL NOT NULL,
        risk_score INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS model_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name VARCHAR(64) NOT NULL,
        precision REAL NOT NULL,
        recall REAL NOT NULL,
        f1 REAL NOT NULL,
        roc_auc REAL NOT NULL,
        pr_auc REAL NOT NULL,
        accuracy REAL NOT NULL,
        evaluation_strategy VARCHAR(128) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS investigation_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_name VARCHAR(256) NOT NULL,
        description TEXT,
        status VARCHAR(32) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS case_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL,
        transaction_id INTEGER NOT NULL,
        notes TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS investigation_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL,
        transaction_id INTEGER,
        note TEXT NOT NULL,
        author VARCHAR(64) DEFAULT 'Investigator',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ingestion_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_name VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL,
        rows_processed INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_risk_score ON transactions(risk_score);
    CREATE INDEX IF NOT EXISTS idx_tx_label ON transactions(known_label);
    CREATE INDEX IF NOT EXISTS idx_tx_pred ON transactions(prediction);
    CREATE INDEX IF NOT EXISTS idx_tx_time ON transactions(time_step);
    CREATE INDEX IF NOT EXISTS idx_edge_src ON transaction_edges(source_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_edge_dst ON transaction_edges(destination_transaction_id);
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    """
    with _engine.connect() as conn:
        for stmt in ddl.strip().split(";"):
            if stmt.strip():
                conn.execute(text(stmt))
        conn.commit()


def get_db_status() -> Dict[str, Any]:
    """Returns database connection status."""
    return _db_status


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    if _SessionLocal is None:
        init_db()
    
    if _SessionLocal is None:
        raise RuntimeError("Database engine could not be initialized.")

    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
