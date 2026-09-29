from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class Offer:
    title: str
    price: float
    currency: str
    source: str
    url: str
    image_url: str | None = None
    condition: str | None = None
    seller: str | None = None
    item_id: str | None = None


@dataclass
class SearchResult:
    query: str
    offers: list[Offer] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    sources_used: list[str] = field(default_factory=list)
    shop_searches: list[dict[str, str]] = field(default_factory=list)

    @property
    def cheapest(self) -> Offer | None:
        priced = [o for o in self.offers if o.price > 0]
        if not priced:
            return None
        return min(priced, key=lambda o: o.price)


def insight_from_snapshots(snapshots: list[dict[str, Any]], current: float | None) -> dict[str, Any]:
    prices = [float(s["price"]) for s in snapshots if s.get("price") is not None]
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    recent: list[float] = []
    for snap in snapshots:
        try:
            recorded = datetime.fromisoformat(str(snap["recorded_at"]))
        except ValueError:
            continue
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=timezone.utc)
        if recorded >= cutoff:
            recent.append(float(snap["price"]))

    lowest = min(prices) if prices else current
    average_30 = (sum(recent) / len(recent)) if recent else current
    current_price = current if current is not None else (prices[-1] if prices else None)

    status = "building"
    delta_pct = None
    if current_price is not None and average_30:
        delta_pct = ((current_price - average_30) / average_30) * 100
        if len(recent) < 3:
            status = "building"
        elif current_price <= (lowest or current_price) and len(prices) >= 2:
            status = "lowest"
        elif delta_pct <= -5:
            status = "good"
        elif delta_pct >= 8:
            status = "high"
        else:
            status = "fair"

    labels = []
    series = []
    for snap in snapshots[-60:]:
        labels.append(str(snap["recorded_at"])[5:16].replace("T", " "))
        series.append(float(snap["price"]))

    return {
        "current": current_price,
        "lowest": lowest,
        "average_30": average_30,
        "delta_pct": delta_pct,
        "status": status,
        "sample_count": len(prices),
        "labels": labels,
        "series": series,
    }


STATUS_COPY = {
    "building": ("Building history", "We need a few price checks before calling this a deal."),
    "good": ("Good price", "Currently below the recent average — a strong time to buy."),
    "lowest": ("Cheapest recorded", "This is the lowest price we have seen for this watch."),
    "fair": ("Fair price", "Close to the recent average. Waiting may still pay off."),
    "high": ("High price", "Above the recent average. A reminder will fire if it drops."),
}
