from __future__ import annotations

from typing import Any

import httpx

from app.config import AppConfig
from app.pricing import Offer


class BestBuyError(RuntimeError):
    pass


def search_bestbuy(config: AppConfig, query: str, limit: int = 12) -> list[Offer]:
    if not config.bestbuy_ready:
        return []
    safe = query.replace('"', " ")
    url = (
        "https://api.bestbuy.com/v1/products"
        f"((search={safe}))"
    )
    params = {
        "apiKey": config.bestbuy_api_key,
        "format": "json",
        "show": "sku,name,salePrice,regularPrice,url,image,manufacturer,onlineAvailability",
        "pageSize": str(limit),
        "sort": "salePrice.asc",
    }
    with httpx.Client(timeout=20.0) as client:
        response = client.get(url, params=params)
        if response.status_code >= 400:
            raise BestBuyError(f"Best Buy search failed (HTTP {response.status_code}).")
        payload: dict[str, Any] = response.json()

    offers: list[Offer] = []
    for item in payload.get("products") or []:
        price = item.get("salePrice") or item.get("regularPrice")
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        if not item.get("onlineAvailability", True):
            continue
        offers.append(
            Offer(
                title=item.get("name") or query,
                price=price_f,
                currency="USD",
                source="Best Buy",
                url=item.get("url") or "",
                image_url=item.get("image"),
                seller="Best Buy",
                item_id=str(item.get("sku") or ""),
            )
        )
    offers.sort(key=lambda o: o.price)
    return offers
