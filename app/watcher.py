from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app import db
from app.config import AppConfig, load_config
from app.pricing import insight_from_snapshots
from app.search import search_parts


def send_email(config: AppConfig, subject: str, body: str) -> None:
    if not config.email_ready:
        return
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.alert_from
    message["To"] = config.alert_to
    message.set_content(body)
    with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=20) as smtp:
        smtp.starttls()
        if config.smtp_user:
            smtp.login(config.smtp_user, config.smtp_password)
        smtp.send_message(message)


def refresh_watch(watch_id: int) -> dict:
    config = load_config()
    watch = db.get_watch(watch_id)
    if not watch:
        raise ValueError("Watch not found")

    previous_price = watch.get("last_price")
    snapshots_before = db.list_snapshots(watch_id)
    previous_low = min((float(s["price"]) for s in snapshots_before), default=None)

    result = search_parts(config, watch["query"])
    cheapest = result.cheapest
    if cheapest is None:
        db.add_alert(watch_id, "error", f"No live offers found for {watch['title']}.")
        return {"ok": False, "errors": result.errors}

    db.update_watch_price(
        watch_id,
        price=cheapest.price,
        source=cheapest.source,
        listing_url=cheapest.url,
        listing_title=cheapest.title,
        image_url=cheapest.image_url,
    )
    watch = db.get_watch(watch_id)
    snapshots = db.list_snapshots(watch_id)
    insight = insight_from_snapshots(snapshots, cheapest.price)

    messages: list[str] = []
    if watch.get("target_price") is not None and cheapest.price <= float(watch["target_price"]):
        symbol = _symbol(watch)
        msg = (
            f"{watch['title']} is {symbol}{cheapest.price:.2f} "
            f"— at or below your target of {symbol}{float(watch['target_price']):.2f}."
        )
        messages.append(msg)
        db.add_alert(watch_id, "target", msg)

    if watch.get("alert_on_lowest") and previous_low is not None and cheapest.price < previous_low - 0.01:
        msg = f"{watch['title']} just hit a new lowest: {_symbol(watch)}{cheapest.price:.2f}."
        messages.append(msg)
        db.add_alert(watch_id, "lowest", msg)
    elif watch.get("alert_on_lowest") and previous_price is None:
        msg = f"Started watching {watch['title']} at {_symbol(watch)}{cheapest.price:.2f}."
        db.add_alert(watch_id, "info", msg)

    if insight["status"] == "good" and previous_price and cheapest.price < float(previous_price):
        msg = (
            f"{watch['title']} is a good price ({insight['delta_pct']:.1f}% below the 30-day average)."
        )
        if msg not in messages:
            messages.append(msg)
            db.add_alert(watch_id, "good", msg)

    for msg in messages:
        try:
            send_email(config, f"PC Hardware Watch: {watch['title']}", msg + f"\n\n{cheapest.url}")
        except OSError:
            db.add_alert(watch_id, "error", "Price alert saved, but email could not be sent. Check SMTP settings.")

    return {"ok": True, "watch": watch, "insight": insight, "errors": result.errors}


def refresh_all() -> list[dict]:
    results = []
    for watch in db.list_watches():
        try:
            results.append(refresh_watch(int(watch["id"])))
        except Exception as exc:  # noqa: BLE001 - keep the loop alive for other watches
            db.add_alert(int(watch["id"]), "error", f"Refresh failed: {exc}")
            results.append({"ok": False, "errors": [str(exc)]})
    return results


def _symbol(watch: dict) -> str:
    return {"GBP": "£", "USD": "$", "EUR": "€", "AUD": "A$"}.get(watch.get("currency") or "GBP", "£")
