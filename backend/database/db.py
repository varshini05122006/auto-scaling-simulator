import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
DB_PATH = BASE / "database" / "autoscaling.db"


def get_connection():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = get_connection()

    con.execute("""
        CREATE TABLE IF NOT EXISTS simulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            traffic INTEGER NOT NULL,
            cpu REAL NOT NULL,
            memory REAL NOT NULL,
            latency REAL NOT NULL,
            response_time REAL NOT NULL,
            throughput REAL NOT NULL,
            network REAL NOT NULL,
            servers INTEGER NOT NULL,
            cost REAL NOT NULL,
            action TEXT NOT NULL,
            reason TEXT NOT NULL
        )
    """)

    con.commit()
    con.close()
