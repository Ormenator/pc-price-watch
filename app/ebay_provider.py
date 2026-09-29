from __future__ import annotations

import base64
import time
from typing import Any

import httpx

from app.config import AppConfig
from app.pricing import Offer

_token: str | None = None
_token_expires = 0.0


class EbayError(RuntimeError):
    pass


def _basic_auth(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def get_app_token(config: AppConfig) -> str:
    global _token, _token_expires
    if _token and time.time() < _token_expires - 60:
        return _token
    if not config.ebay_ready:
        raise EbayError("Add your eBay Client ID and Secret in Settings.")

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"Basic {_basic_auth(config.ebay_client_id, config.ebay_client_secret)}",
    }
    data = {
        "grant_type": "client_credentials",
        "scope": "https://api.ebay.com/oauth/api_scope",
    }
    with httpx.Client(timeout=20.0) as client:
        response = client.post("https://api.ebay.com/identity/v1/oauth2/token", headers=headers, data=data)
        if response.status_code >= 400:
            raise EbayError(
                "eBay login failed. Check the Client ID/Secret from developer.ebay.com "
                f"(HTTP {response.status_code})."
            )
        payload = response.json()
    _token = payload["access_token"]
    _token_expires = time.time() + float(payload.get("expires_in", 7200))
    return _token


def search_ebay(config: AppConfig, query: str, limit: int = 20) -> list[Offer]:
    token = get_app_token(config)
    params = {
        "q": query,
        "limit": str(limit),
        "filter": "buyingOptions:{FIXED_PRICE},conditions:{NEW}",
        "sort": "price",
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": config.ebay_marketplace,
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=20.0) as client:
        response = client.get(
            "https://api.ebay.com/buy/browse/v1/item_summary/search",
            params=params,
            headers=headers,
        )
        if response.status_code >= 400:
            raise EbayError(f"eBay search failed (HTTP {response.status_code}).")
        payload: dict[str, Any] = response.json()

    offers: list[Offer] = []
    for item in payload.get("itemSummaries") or []:
        price_block = item.get("price") or {}
        try:
            price = float(price_block.get("value"))
        except (TypeError, ValueError):
            continue
        image = (item.get("image") or {}).get("imageUrl")
        offers.append(
            Offer(
                title=item.get("title") or query,
                price=price,
                currency=price_block.get("currency") or config.marketplace_meta["currency"],
                source="eBay",
                url=item.get("itemWebUrl") or "",
                image_url=image,
                condition=(item.get("condition") or None),
                seller=((item.get("seller") or {}).get("username")),
                item_id=item.get("itemId"),
            )
        )
    offers.sort(key=lambda o: o.price)
    return offers
