from __future__ import annotations

import asyncio
import os
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app import db
from app.config import MARKETPLACES, load_config
from app.pricing import STATUS_COPY, insight_from_snapshots
from app.search import search_parts
from app.watcher import refresh_all, refresh_watch

ROOT = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(ROOT / "templates"))

POPULAR = [
    {"query": "RTX 4070 Super", "category": "Graphics Cards", "mood": "The usual ‘is it time?’ GPU", "icon": "gpu"},
    {"query": "RTX 5070", "category": "Graphics Cards", "mood": "New-gen itch", "icon": "gpu"},
    {"query": "Ryzen 7 7800X3D", "category": "Processors", "mood": "Gaming sweet spot", "icon": "cpu"},
    {"query": "Intel Core Ultra 7 265K", "category": "Processors", "mood": "Fresh silicon", "icon": "cpu"},
    {"query": "32GB DDR5 6000", "category": "Memory", "mood": "The kit everyone waits on", "icon": "ram"},
    {"query": "2TB NVMe SSD", "category": "Storage", "mood": "Game library room", "icon": "ssd"},
    {"query": "B650 motherboard", "category": "Motherboards", "mood": "Build foundation", "icon": "mobo"},
    {"query": "850W 80+ Gold PSU", "category": "Power Supplies", "mood": "Don’t cheap this one", "icon": "psu"},
]

basic_auth = HTTPBasic(auto_error=False)


def require_site_auth(
    request: Request,
    credentials: Annotated[HTTPBasicCredentials | None, Depends(basic_auth)],
) -> None:
    if request.url.path == "/":
        return
    username = os.getenv("APP_USERNAME", "")
    password = os.getenv("APP_PASSWORD", "")
    if not username or not password:
        return
    if credentials is None or not (
        secrets.compare_digest(credentials.username, username)
        and secrets.compare_digest(credentials.password, password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Basic"},
        )


app = FastAPI(title="PC Hardware Watch", dependencies=[Depends(require_site_auth)])
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")


def ctx(request: Request, **extra):
    config = load_config()
    payload = {
        "request": request,
        "config": config,
        "unread": db.unread_alert_count(),
        "marketplaces": MARKETPLACES,
        "path": request.url.path,
        "popular": POPULAR,
    }
    payload.update(extra)
    return payload


@app.on_event("startup")
async def startup() -> None:
    db.init_db()
    asyncio.create_task(_poll_loop())


async def _poll_loop() -> None:
    await asyncio.sleep(8)
    while True:
        try:
            await asyncio.to_thread(refresh_all)
        except Exception:
            pass
        await asyncio.sleep(30 * 60)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    watches = db.list_watches()[:4]
    return templates.TemplateResponse(
        "home.html",
        ctx(request, popular=POPULAR, watches=watches, alerts=db.list_alerts(5)),
    )


@app.get("/search", response_class=HTMLResponse)
def search_page(request: Request, q: str = "", category: str = "PC Parts"):
    config = load_config()
    result = search_parts(config, q) if q.strip() else None
    return templates.TemplateResponse(
        "search.html",
        ctx(request, q=q, category=category, result=result, popular=POPULAR),
    )


@app.post("/watch")
def create_watch(
    request: Request,
    query: Annotated[str, Form()],
    title: Annotated[str, Form()],
    category: Annotated[str, Form()] = "PC Parts",
    image_url: Annotated[str, Form()] = "",
    currency: Annotated[str, Form()] = "GBP",
    marketplace: Annotated[str, Form()] = "EBAY_GB",
    target_price: Annotated[str, Form()] = "",
    alert_on_lowest: Annotated[str, Form()] = "",
):
    try:
        target = float(target_price) if target_price.strip() else None
    except ValueError:
        target = None
    watch = db.create_watch(
        query=query,
        title=title or query,
        category=category,
        image_url=image_url or None,
        currency=currency,
        marketplace=marketplace,
        target_price=target,
        alert_on_lowest=alert_on_lowest == "on",
    )
    try:
        refresh_watch(int(watch["id"]))
    except Exception:
        pass
    return RedirectResponse(f"/part/{watch['id']}", status_code=303)


@app.get("/part/{watch_id}", response_class=HTMLResponse)
def part_page(request: Request, watch_id: int):
    watch = db.get_watch(watch_id)
    if not watch:
        return RedirectResponse("/watchlist", status_code=303)
    snapshots = db.list_snapshots(watch_id)
    insight = insight_from_snapshots(snapshots, watch.get("last_price"))
    status_label, status_blurb = STATUS_COPY[insight["status"]]
    return templates.TemplateResponse(
        "part.html",
        ctx(
            request,
            watch=watch,
            snapshots=snapshots,
            insight=insight,
            status_label=status_label,
            status_blurb=status_blurb,
        ),
    )


@app.post("/part/{watch_id}/refresh")
def part_refresh(watch_id: int):
    refresh_watch(watch_id)
    return RedirectResponse(f"/part/{watch_id}", status_code=303)


@app.post("/part/{watch_id}/delete")
def part_delete(watch_id: int):
    db.delete_watch(watch_id)
    return RedirectResponse("/watchlist", status_code=303)


@app.get("/watchlist", response_class=HTMLResponse)
def watchlist(request: Request):
    watches = db.list_watches()
    cards = []
    for watch in watches:
        insight = insight_from_snapshots(db.list_snapshots(int(watch["id"])), watch.get("last_price"))
        cards.append({"watch": watch, "insight": insight, "status_label": STATUS_COPY[insight["status"]][0]})
    return templates.TemplateResponse("watchlist.html", ctx(request, cards=cards))


@app.get("/alerts", response_class=HTMLResponse)
def alerts_page(request: Request):
    alerts = db.list_alerts(50)
    db.mark_alerts_read()
    return templates.TemplateResponse("alerts.html", ctx(request, alerts=alerts, unread=0))


@app.get("/about", response_class=HTMLResponse)
def about(request: Request):
    return templates.TemplateResponse("about.html", ctx(request))


@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request, saved: int = 0):
    stored = db.get_settings()
    return templates.TemplateResponse("settings.html", ctx(request, stored=stored, saved=bool(saved)))


@app.post("/settings")
def save_settings(
    ebay_client_id: Annotated[str, Form()] = "",
    ebay_client_secret: Annotated[str, Form()] = "",
    ebay_marketplace: Annotated[str, Form()] = "EBAY_GB",
    bestbuy_api_key: Annotated[str, Form()] = "",
    smtp_host: Annotated[str, Form()] = "",
    smtp_port: Annotated[str, Form()] = "587",
    smtp_user: Annotated[str, Form()] = "",
    smtp_password: Annotated[str, Form()] = "",
    alert_from: Annotated[str, Form()] = "",
    alert_to: Annotated[str, Form()] = "",
):
    db.set_settings(
        {
            "ebay_client_id": ebay_client_id.strip(),
            "ebay_client_secret": ebay_client_secret.strip(),
            "ebay_marketplace": ebay_marketplace.strip() or "EBAY_GB",
            "bestbuy_api_key": bestbuy_api_key.strip(),
            "smtp_host": smtp_host.strip(),
            "smtp_port": smtp_port.strip() or "587",
            "smtp_user": smtp_user.strip(),
            "smtp_password": smtp_password.strip(),
            "alert_from": alert_from.strip(),
            "alert_to": alert_to.strip(),
        }
    )
    return RedirectResponse("/settings?saved=1", status_code=303)
