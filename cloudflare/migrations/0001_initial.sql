CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);