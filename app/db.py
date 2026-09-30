from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.getenv("PC_PRICE_WATCH_DB", str(DATA_DIR / "watch.db")))

_lock = threading.Lock()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _lock:
        conn = connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS watches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query TEXT NOT NULL,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'PC Parts',
                    image_url TEXT,
                    currency TEXT NOT NULL DEFAULT 'GBP',
                    marketplace TEXT NOT NULL DEFAULT 'EBAY_GB',
                    target_price REAL,
                    alert_on_lowest INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_checked TEXT,
                    last_price REAL,
                    last_source TEXT,
                    last_listing_url TEXT,
                    last_listing_title TEXT
                );

                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    watch_id INTEGER NOT NULL,
                    price REAL NOT NULL,
                    source TEXT NOT NULL,
                    listing_url TEXT,
                    listing_title TEXT,
                    recorded_at TEXT NOT NULL,
                    FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    watch_id INTEGER,
                    kind TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    read INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE SET NULL
                );

                CREATE INDEX IF NOT EXISTS idx_snapshots_watch ON snapshots(watch_id, recorded_at);
                """
            )
            conn.commit()
        finally:
            conn.close()


def get_setting(key: str, default: str = "") -> str:
    with _lock:
        conn = connect()
        try:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else default
        finally:
            conn.close()


def get_settings() -> dict[str, str]:
    with _lock:
        conn = connect()
        try:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
            return {row["key"]: row["value"] for row in rows}
        finally:
            conn.close()


def set_settings(values: dict[str, str]) -> None:
    with _lock:
        conn = connect()
        try:
            for key, value in values.items():
                conn.execute(
                    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value or ""),
                )
            conn.commit()
        finally:
            conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def create_watch(
    *,
    query: str,
    title: str,
    category: str,
    image_url: str | None,
    currency: str,
    marketplace: str,
    target_price: float | None,
    alert_on_lowest: bool,
) -> dict[str, Any]:
    with _lock:
        conn = connect()
        try:
            cur = conn.execute(
                """
                INSERT INTO watches (
                    query, title, category, image_url, currency, marketplace,
                    target_price, alert_on_lowest, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    query.strip(),
                    title.strip(),
                    category.strip() or "PC Parts",
                    image_url,
                    currency,
                    marketplace,
                    target_price,
                    1 if alert_on_lowest else 0,
                    utcnow(),
                ),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM watches WHERE id = ?", (cur.lastrowid,)).fetchone()
            return dict(row)
        finally:
            conn.close()


def list_watches() -> list[dict[str, Any]]:
    with _lock:
        conn = connect()
        try:
            rows = conn.execute("SELECT * FROM watches ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def get_watch(watch_id: int) -> dict[str, Any] | None:
    with _lock:
        conn = connect()
        try:
            row = conn.execute("SELECT * FROM watches WHERE id = ?", (watch_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


def delete_watch(watch_id: int) -> None:
    with _lock:
        conn = connect()
        try:
            conn.execute("DELETE FROM watches WHERE id = ?", (watch_id,))
            conn.commit()
        finally:
            conn.close()


def update_watch_price(
    watch_id: int,
    *,
    price: float,
    source: str,
    listing_url: str | None,
    listing_title: str | None,
    image_url: str | None = None,
) -> None:
    with _lock:
        conn = connect()
        try:
            now = utcnow()
            if image_url:
                conn.execute(
                    """
                    UPDATE watches SET last_checked = ?, last_price = ?, last_source = ?,
                        last_listing_url = ?, last_listing_title = ?, image_url = COALESCE(?, image_url)
                    WHERE id = ?
                    """,
                    (now, price, source, listing_url, listing_title, image_url, watch_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE watches SET last_checked = ?, last_price = ?, last_source = ?,
                        last_listing_url = ?, last_listing_title = ?
                    WHERE id = ?
                    """,
                    (now, price, source, listing_url, listing_title, watch_id),
                )
            conn.execute(
                """
                INSERT INTO snapshots (watch_id, price, source, listing_url, listing_title, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (watch_id, price, source, listing_url, listing_title, now),
            )
            conn.commit()
        finally:
            conn.close()


def list_snapshots(watch_id: int, limit: int = 120) -> list[dict[str, Any]]:
    with _lock:
        conn = connect()
        try:
            rows = conn.execute(
                """
                SELECT * FROM snapshots WHERE watch_id = ?
                ORDER BY recorded_at ASC
                LIMIT ?
                """,
                (watch_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def add_alert(watch_id: int | None, kind: str, message: str) -> None:
    with _lock:
        conn = connect()
        try:
            conn.execute(
                "INSERT INTO alerts (watch_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
                (watch_id, kind, message, utcnow()),
            )
            conn.commit()
        finally:
            conn.close()


def list_alerts(limit: int = 30) -> list[dict[str, Any]]:
    with _lock:
        conn = connect()
        try:
            rows = conn.execute(
                """
                SELECT alerts.*, watches.title AS watch_title
                FROM alerts
                LEFT JOIN watches ON watches.id = alerts.watch_id
                ORDER BY alerts.created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def unread_alert_count() -> int:
    with _lock:
        conn = connect()
        try:
            row = conn.execute("SELECT COUNT(*) AS n FROM alerts WHERE read = 0").fetchone()
            return int(row["n"])
        finally:
            conn.close()


def mark_alerts_read() -> None:
    with _lock:
        conn = connect()
        try:
            conn.execute("UPDATE alerts SET read = 1")
            conn.commit()
        finally:
            conn.close()


def export_debug() -> str:
    return json.dumps({"db": str(DB_PATH)}, indent=2)
