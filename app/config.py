from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

from app import db

load_dotenv()

MARKETPLACES = {
    "EBAY_GB": {"label": "eBay UK", "currency": "GBP", "symbol": "£"},
    "EBAY_US": {"label": "eBay US", "currency": "USD", "symbol": "$"},
    "EBAY_DE": {"label": "eBay DE", "currency": "EUR", "symbol": "€"},
    "EBAY_AU": {"label": "eBay AU", "currency": "AUD", "symbol": "A$"},
}


def _first(*values: str | None) -> str:
    for value in values:
        if value and value.strip():
            return value.strip()
    return ""


@dataclass
class AppConfig:
    ebay_client_id: str
    ebay_client_secret: str
    ebay_marketplace: str
    bestbuy_api_key: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    alert_from: str
    alert_to: str

    @property
    def ebay_ready(self) -> bool:
        return bool(self.ebay_client_id and self.ebay_client_secret)

    @property
    def bestbuy_ready(self) -> bool:
        return bool(self.bestbuy_api_key)

    @property
    def email_ready(self) -> bool:
        return bool(self.smtp_host and self.alert_from and self.alert_to)

    @property
    def marketplace_meta(self) -> dict:
        return MARKETPLACES.get(self.ebay_marketplace, MARKETPLACES["EBAY_GB"])


def load_config() -> AppConfig:
    stored = db.get_settings()
    marketplace = _first(
        stored.get("ebay_marketplace"),
        os.getenv("EBAY_MARKETPLACE"),
        "EBAY_GB",
    )
    if marketplace not in MARKETPLACES:
        marketplace = "EBAY_GB"
    port_raw = _first(stored.get("smtp_port"), os.getenv("SMTP_PORT"), "587")
    try:
        smtp_port = int(port_raw)
    except ValueError:
        smtp_port = 587
    return AppConfig(
        ebay_client_id=_first(stored.get("ebay_client_id"), os.getenv("EBAY_CLIENT_ID")),
        ebay_client_secret=_first(stored.get("ebay_client_secret"), os.getenv("EBAY_CLIENT_SECRET")),
        ebay_marketplace=marketplace,
        bestbuy_api_key=_first(stored.get("bestbuy_api_key"), os.getenv("BESTBUY_API_KEY")),
        smtp_host=_first(stored.get("smtp_host"), os.getenv("SMTP_HOST")),
        smtp_port=smtp_port,
        smtp_user=_first(stored.get("smtp_user"), os.getenv("SMTP_USER")),
        smtp_password=_first(stored.get("smtp_password"), os.getenv("SMTP_PASSWORD")),
        alert_from=_first(stored.get("alert_from"), os.getenv("ALERT_FROM")),
        alert_to=_first(stored.get("alert_to"), os.getenv("ALERT_TO")),
    )
