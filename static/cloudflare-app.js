const app = document.getElementById("app");
const authKey = "ppw-cloudflare-session";
const savedAuth = sessionStorage.getItem(authKey);
let auth = savedAuth ? JSON.parse(savedAuth) : null;
let appState = null;
let pendingWatch = null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function basicHeader(credentials) {
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (auth && path !== "/api/auth") headers.set("authorization", basicHeader(auth));
  if (options.body && typeof options.body !== "string") {
    headers.set("content-type", "application/json");
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (response.status === 401 && path !== "/api/auth") {
    auth = null;
    sessionStorage.removeItem(authKey);
  }
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
  return payload;
}

function money(value, currency = "GBP") {
  if (value === null || value === undefined || value === "") return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function safeExternalUrl(value) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function activeClass(current, candidate) {
  return current === candidate ? "active" : "";
}

function shell(content, path) {
  const unread = appState?.unread || 0;
  return `
    <div class="top-note">Honest prices from official APIs · retailer links stay on retailer sites</div>
    <header class="site-header">
      <a class="brand" href="/"><img src="/logo.svg" alt="" width="40" height="40" /><span>PC Hardware Watch</span></a>
      <form class="search-form" action="/search" method="get">
        <input type="search" name="q" placeholder="Search graphics cards, motherboards…" required autocomplete="off" />
        <button type="submit">Search</button>
      </form>
      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch between dark and light">
        <span class="toggle-track"><span class="toggle-knob"></span></span>
        <span class="toggle-copy"><span class="dark-label">Dark</span><span class="light-label">Light</span></span>
      </button>
      <nav>
        <a class="${activeClass(path, "/")}" href="/">Home</a>
        <a class="${activeClass(path, "/about")}" href="/about">About</a>
        <a class="${path === "/search" ? "active" : ""}" href="/search">Parts catalog</a>
        <a class="${activeClass(path, "/watchlist")}" href="/watchlist">Watchlist</a>
        <a class="alerts-link ${activeClass(path, "/alerts")}" href="/alerts">Alerts${unread ? ` <span class="badge">${unread}</span>` : ""}</a>
        <a class="${activeClass(path, "/settings")}" href="/settings">Settings</a>
        ${auth ? '<button type="button" class="text-link" data-logout>Sign out</button>' : '<a class="text-link" href="/watchlist">Sign in</a>'}
      </nav>
    </header>
    <main>${content}</main>
    <footer><p>© 2026 PC Hardware Watch. Live prices come from connected official APIs, including eBay and optional Best Buy. Other links open official retailer searches; we don’t scrape shops.</p></footer>`;
}

function loginPage(message = "") {
  app.innerHTML = `
    <main class="settings-form login-screen">
      <div class="section-head"><div><h1>PC Hardware Watch</h1><p class="muted">Sign in to your private watchlist.</p></div></div>
      ${message ? `<div class="banner warn"><p>${escapeHtml(message)}</p></div>` : ""}
      <form id="login-form">
        <label>Username<input name="username" value="admin" autocomplete="username" required /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button class="cta" type="submit">Sign in</button>
      </form>
      <p><a class="text-link" href="/">Back to homepage</a></p>
    </main>`;
}

async function saveWatch(body) {
  const created = await api("/api/watches", { method: "POST", body });
  location.href = `/part/${created.id}`;
}

function emptyState(message, action = "") {
  return `<div class="empty-card"><p>${message}</p>${action}</div>`;
}

function popularCards(popular) {
  return `<div class="grid cards">${popular.map((item) => `
    <a class="card quiet" data-category="${escapeHtml(item.category)}" href="/search?q=${encodeURIComponent(item.query)}&category=${encodeURIComponent(item.category)}">
      <span class="icon-blob ${escapeHtml(item.icon)}"></span><span class="kicker">${escapeHtml(item.category)}</span>
      <strong>${escapeHtml(item.query)}</strong><p class="mood">${escapeHtml(item.mood)}</p>
    </a>`).join("")}</div>`;
}

function catalogCards(items) {
  if (!items.length) return emptyState("No catalog parts match that search yet.");
  return `<div class="grid cards">${items.map((item) => {
    const details = [item.platform, item.chipset, item.form_factor, item.memory].filter(Boolean).join(" · ");
    return `<a class="card quiet" data-category="${escapeHtml(item.category)}" href="/search?q=${encodeURIComponent(item.name)}&category=${encodeURIComponent(item.category)}">
      <span class="kicker">${escapeHtml(item.category)} · ${escapeHtml(item.manufacturer)}</span>
      <strong>${escapeHtml(item.name)}</strong><p class="muted">${escapeHtml(details)}</p>
    </a>`;
  }).join("")}</div>`;
}

function catalogSection(items, heading) {
  return `<section><div class="section-head"><div><h2>${heading}</h2><p class="muted">Choose a model to compare live prices.</p></div></div>${catalogCards(items)}</section>`;
}

function catalogFilters(categories) {
  return `<div class="chip-row" data-filter-chips><button type="button" class="chip is-on" data-filter="all">All parts</button>${categories.map(({ category, count }) => `<button type="button" class="chip" data-filter="${escapeHtml(category)}">${escapeHtml(category)} <span>${Number(count)}</span></button>`).join("")}</div>`;
}

function homePage(state) {
  const watches = state.watches || [];
  return `
    <section class="hero">
      <div class="hero-copy reveal"><p class="eyebrow">A friend who watches the price for you</p>
        <h1>Hunt the part. We’ll tap you when it’s actually cheap.</h1>
        <p class="lede">Search a GPU, CPU, SSD — anything. Set a “that’s my number” reminder, or we’ll shout when it hits a new low.</p>
        <div class="hero-actions"><a class="cta" href="${state.config.ebay_ready ? "/search" : "/settings"}">${state.config.ebay_ready ? "Start a hunt" : "Connect eBay — 2 minutes"}</a>
          <a class="cta ghost" href="/about">About price tracking</a></div>
      </div>
      <div class="hero-art" data-tilt aria-hidden="true"><div class="sticker s1">new low?</div><div class="sticker s2">wait… or buy</div><img src="/gpu.svg" alt="" /></div>
    </section>
    <section><div class="section-head"><div><h2>What’s everyone watching?</h2><p class="muted">Tap a card — it’s a real search, not a demo.</p></div></div>
      <div class="chip-row" data-filter-chips><button type="button" class="chip is-on" data-filter="all">All the bits</button><button type="button" class="chip" data-filter="Graphics Cards">GPUs</button><button type="button" class="chip" data-filter="Processors">CPUs</button><button type="button" class="chip" data-filter="Memory">RAM</button><button type="button" class="chip" data-filter="Storage">Storage</button></div>
      ${popularCards(state.popular)}</section>
    <section><div class="section-head"><h2>Your little watch window</h2><a class="text-link" href="/watchlist">Open the whole list →</a></div>
      ${watches.length ? `<div class="grid cards">${watches.map((watch) => `<a class="card" href="/part/${watch.id}"><span class="kicker">${escapeHtml(watch.category)}</span><strong>${escapeHtml(watch.title)}</strong><p class="price">${watch.last_price ? money(watch.last_price, watch.currency) : "Checking…"}</p></a>`).join("")}</div>` : emptyState("Nothing on the board yet. Search a part and hit Keep an eye on this — that’s the whole game.", '<a class="cta ghost" href="/search">Browse popular hunts</a>')}
    </section>`;
}

function searchPage(query, result, category, catalog) {
  if (!query) {
    return `<section class="section-head"><div><h1>Search PC parts</h1><p class="muted">Find a model in the catalog, then compare live prices.</p></div></section>
      ${catalogFilters(catalog.categories)}${catalogSection(catalog.items, "Browse the catalog")}<section>${popularCards(appState.popular)}</section>`;
  }
  const errors = result.errors?.length ? `<div class="banner warn">${result.errors.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}${!appState.config.ebay_ready ? '<p><a href="/settings">Open Settings</a> and add your free eBay API keys.</p>' : ""}</div>` : "";
  const cheapest = result.cheapest;
  const featured = cheapest ? `<div class="insight-layout"><div class="art-panel" data-tilt><img src="${safeExternalUrl(cheapest.image_url || "/gpu.svg")}" alt="" onerror="this.src='/gpu.svg'" /></div>
    <div class="insight-panel"><span class="pill good">Cheapest live offer</span><h2>${escapeHtml(cheapest.title)}</h2><p class="huge">${money(cheapest.price, cheapest.currency)}</p><p class="muted">${escapeHtml(cheapest.source)}${cheapest.seller ? ` · ${escapeHtml(cheapest.seller)}` : ""}</p>
      <form class="watch-form" id="watch-form"><input type="hidden" name="query" value="${escapeHtml(query)}" /><input type="hidden" name="title" value="${escapeHtml(query)}" /><input type="hidden" name="category" value="${escapeHtml(category || catalog.items[0]?.category || "PC Parts")}" /><input type="hidden" name="image_url" value="${escapeHtml(cheapest.image_url || "")}" /><input type="hidden" name="currency" value="${escapeHtml(cheapest.currency)}" /><input type="hidden" name="marketplace" value="${escapeHtml(appState.config.ebay_marketplace)}" />
        <div class="target-row"><button type="button" class="stepper" data-step="-10" aria-label="Lower target">−</button><label>Ping me at or below<input type="number" step="1" min="0" name="target_price" placeholder="Your number" data-live-target /></label><button type="button" class="stepper" data-step="10" aria-label="Raise target">+</button></div><p class="target-live muted" data-target-live>Leave blank to only hear about new lows.</p>
        <label class="check"><input type="checkbox" name="alert_on_lowest" checked />Also alert me when this hunt hits a new low</label><button type="submit" class="cta">Keep an eye on this</button></form>
    </div></div>` : '<p class="muted">No live offers right now. You can still track this model and check again later.</p>';
  const unpricedWatch = cheapest ? "" : `<form class="watch-form" id="watch-form">
    <input type="hidden" name="query" value="${escapeHtml(query)}" />
    <input type="hidden" name="title" value="${escapeHtml(query)}" />
    <input type="hidden" name="category" value="${escapeHtml(category || catalog.items[0]?.category || "PC Parts")}" />
    <input type="hidden" name="currency" value="GBP" />
    <input type="hidden" name="marketplace" value="${escapeHtml(appState.config.ebay_marketplace)}" />
    <label class="check"><input type="checkbox" name="alert_on_lowest" checked />Alert me when a price becomes available</label>
    <button type="submit" class="cta">Track this model</button>
  </form>`;
  const shops = result.shop_searches?.length ? `<section class="shop-searches"><div class="subhead-row"><div><h2 class="subhead">Search more shops</h2><p class="muted">Open the shop’s own search page. We don’t copy or scrape listings.</p></div></div><div class="shop-link-grid">${result.shop_searches.map((shop) => `<a class="shop-link" href="${safeExternalUrl(shop.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${escapeHtml(shop.name)}</strong><small>${escapeHtml(shop.domain)}${shop.affiliate ? " · Affiliate link" : ""}</small></span><span class="shop-region">${escapeHtml(shop.region)} ↗</span></a>`).join("")}</div></section>` : "";
  const offers = result.offers?.length ? `<div class="subhead-row"><h2 class="subhead">All live offers</h2><p class="muted" data-compare-out>Tick a few to compare.</p></div><div class="offer-list" data-compare>${result.offers.map((offer) => `<article class="offer" data-price="${Number(offer.price)}"><label class="check tight"><input type="checkbox" data-compare-item /><span><strong>${escapeHtml(offer.title)}</strong><p class="muted">${escapeHtml(offer.source)}${offer.condition ? ` · ${escapeHtml(offer.condition)}` : ""}</p></span></label><div class="offer-price"><span>${money(offer.price, offer.currency)}</span><a href="${safeExternalUrl(offer.url)}" target="_blank" rel="noopener">Open listing</a></div></article>`).join("")}</div>` : "";
  return `<section class="section-head"><div><h1>Search results</h1><p class="muted">Live offers from connected APIs, cheapest first.</p></div></section>${catalog.items.length ? catalogSection(catalog.items, "Catalog matches") : ""}${errors}${result.sources_used?.length ? `<p class="muted">Talking to: ${result.sources_used.map(escapeHtml).join(", ")}</p>` : ""}${featured}${unpricedWatch}${shops}${offers}`;
}

function watchlistPage(data) {
  const cards = data.cards || [];
  if (!cards.length) return `<div class="section-head"><div><h1>The board</h1><p class="muted">Everything you’re patiently stalking.</p></div></div>${emptyState("Empty board. That’s honest. Go hunt a part.", '<a class="cta" href="/search">Find something to watch</a>')}`;
  return `<div class="section-head"><div><h1>The board</h1><p class="muted">Everything you’re patiently stalking. Flip cards if you just want the good ones.</p></div></div>
    <div class="chip-row"><button class="chip is-on" data-watch-filter="all">All</button><button class="chip" data-watch-filter="good">Feeling cheap</button><button class="chip" data-watch-filter="lowest">New lows</button><button class="chip" data-watch-filter="high">Wait it out</button></div>
    <div class="grid cards">${cards.map(({ watch, insight, status_label }) => `<a class="card" href="/part/${watch.id}" data-status="${escapeHtml(insight.status)}"><span class="pill ${escapeHtml(insight.status)}">${escapeHtml(status_label)}</span><span class="kicker">${escapeHtml(watch.category)}</span><strong>${escapeHtml(watch.title)}</strong><p class="price">${watch.last_price ? money(watch.last_price, watch.currency) : "Checking…"}</p>${watch.target_price ? `<p class="muted">Your number ${money(watch.target_price, watch.currency)}</p>` : ""}</a>`).join("")}</div>`;
}

function chartMarkup(insight) {
  return `<div class="chart-wrap"><canvas id="price-chart" height="180" aria-label="Price history chart"></canvas><script type="application/json" id="chart-data">${JSON.stringify({ labels: insight.labels, series: insight.series }).replace(/</g, "\\u003c")}</script></div>`;
}

function partPage(data) {
  const { watch, insight } = data;
  return `<section class="insight-layout"><div class="art-panel" data-tilt><img src="${safeExternalUrl(watch.image_url || "/gpu.svg")}" alt="" onerror="this.src='/gpu.svg'" /></div>
    <div class="insight-panel"><span class="pill ${escapeHtml(insight.status)}">${escapeHtml(data.status_label)}</span><p class="kicker">${escapeHtml(watch.category)}</p><h1>${escapeHtml(watch.title)}</h1>
      <div class="stat-row"><button class="stat is-on" data-stat><span>Right now</span><strong>${money(insight.current, watch.currency)}</strong></button><button class="stat" data-stat><span>30-day vibe</span><strong>${money(insight.average_30, watch.currency)}</strong></button><button class="stat" data-stat><span>Lowest we’ve seen</span><strong>${money(insight.lowest, watch.currency)}</strong></button></div>
      <p class="blurb">${insight.delta_pct === null ? escapeHtml(data.status_blurb) : `Currently about ${Math.abs(insight.delta_pct).toFixed(1)}% ${insight.delta_pct < 0 ? "below" : "above"} the recent average.`}</p>
      ${watch.last_listing_url ? `<p class="muted">Cheapest listing: <a href="${safeExternalUrl(watch.last_listing_url)}" target="_blank" rel="noopener">${escapeHtml(watch.last_source || "Open listing")}</a>${watch.last_listing_title ? ` · ${escapeHtml(watch.last_listing_title)}` : ""}</p>` : ""}
      ${chartMarkup(insight)}<div class="actions"><button type="button" class="cta ghost" data-refresh="${watch.id}">Poke the price</button><button type="button" class="cta danger" data-delete="${watch.id}">Let it go</button></div>${watch.target_price ? `<p class="hint">Your number: ${money(watch.target_price, watch.currency)}</p>` : ""}
    </div></section>`;
}

function alertsPage(data) {
  const alerts = data.alerts || [];
  if (!alerts.length) return `<div class="section-head"><div><h1>Taps on the shoulder</h1><p class="muted">Target hits and new lows appear here.</p></div></div>${emptyState("Quiet so far. That’s either zen, or you haven’t watched a part yet.")}`;
  return `<div class="section-head"><div><h1>Taps on the shoulder</h1><p class="muted">Target hits, new lows, the occasional “hmm.”</p></div></div><div class="offer-list">${alerts.map((alert) => `<article class="offer alert-card kind-${escapeHtml(alert.kind)}"><div><span class="kicker">${escapeHtml(alert.kind)}${alert.watch_title ? ` · ${escapeHtml(alert.watch_title)}` : ""}</span><p>${escapeHtml(alert.message)}</p></div><span class="muted">${escapeHtml(String(alert.created_at).slice(0, 16).replace("T", " "))} UTC</span></article>`).join("")}</div>`;
}

async function settingsPage() {
  const settings = await api("/api/settings");
  return `<div class="section-head"><div><h1>Keys &amp; vibes</h1><p class="muted">API keys are stored in your private D1 database. Free eBay keys: <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener">developer.ebay.com</a>.</p></div></div>
    <div id="settings-message"></div><form class="settings-form" id="settings-form">
      <fieldset><legend>eBay Browse API</legend><label>Client ID<input name="ebay_client_id" value="${escapeHtml(settings.ebay_client_id)}" autocomplete="off" /></label><label>Client Secret<input name="ebay_client_secret" type="password" autocomplete="new-password" data-secret placeholder="${settings.ebay_ready ? "Saved; leave blank to keep it" : "Paste your client secret"}" /></label><label>Marketplace<select name="ebay_marketplace">${Object.entries(appState.marketplaces).map(([key, market]) => `<option value="${key}" ${settings.ebay_marketplace === key ? "selected" : ""}>${escapeHtml(market.label)} (${escapeHtml(market.currency)})</option>`).join("")}</select></label></fieldset>
      <fieldset><legend>Best Buy (optional, US)</legend><label>API key<input name="bestbuy_api_key" type="password" autocomplete="new-password" data-secret placeholder="${settings.bestbuy_ready ? "Saved; leave blank to keep it" : "Paste your API key"}" /></label></fieldset>
      <p class="muted">In-app alerts are supported. Email alerts need a separate email API provider; SMTP settings from the local version are not used on Cloudflare.</p><button class="cta" type="submit">Save this</button>
    </form>`;
}

function aboutPage() {
  return `<div class="section-head"><div><h1>About the watch</h1><p class="muted">Price history from official APIs, with retailer searches that stay on the retailer’s own site.</p></div></div>
    <section class="how"><div class="steps"><article class="step is-on"><span class="n">1</span><strong>Name the part</strong><p>Search eBay and optional Best Buy listings.</p></article><article class="step"><span class="n">2</span><strong>Pick your number</strong><p>Set a target price or wait for a new low.</p></article><article class="step"><span class="n">3</span><strong>We keep watch</strong><p>Cloudflare checks watched parts on a schedule and stores price history in D1.</p></article></div></section>`;
}

function drawPriceChart() {
  const canvas = document.getElementById("price-chart");
  const dataNode = document.getElementById("chart-data");
  if (!canvas || !dataNode) return;
  const data = JSON.parse(dataNode.textContent || "{}");
  const values = data.series || [];
  const context = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(300, bounds.width * ratio);
  canvas.height = 180 * ratio;
  context.scale(ratio, ratio);
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  context.clearRect(0, 0, width, height);
  if (!values.length) return;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || 1;
  context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7a59";
  context.lineWidth = 2.5;
  context.beginPath();
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : 8 + index * (width - 16) / (values.length - 1);
    const y = height - 12 - ((value - low) / spread) * (height - 24);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function setTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ppw-theme", next); } catch {}
}

function applyFilters(filter, selector, attribute, predicate) {
  document.querySelectorAll(selector).forEach((item) => {
    item.hidden = !predicate(item.getAttribute(attribute), filter);
  });
}

async function render() {
  const path = location.pathname;
  appState = await api("/api/state");
  let content;
  if (path === "/") content = homePage(appState);
  else if (path === "/search") {
    const query = new URLSearchParams(location.search).get("q") || "";
    const category = new URLSearchParams(location.search).get("category") || "";
    const [result, catalog] = await Promise.all([
      query ? api(`/api/search?q=${encodeURIComponent(query)}`) : Promise.resolve(null),
      api(`/api/catalog?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`),
    ]);
    content = searchPage(query, result, category, catalog);
  } else if (path === "/watchlist") content = watchlistPage(await api("/api/watches"));
  else if (path === "/alerts") {
    const data = await api("/api/alerts");
    appState.unread = 0;
    content = alertsPage(data);
  }
  else if (path === "/settings") content = await settingsPage();
  else if (path === "/about") content = aboutPage();
  else {
    const match = path.match(/^\/part\/(\d+)$/);
    if (match) content = partPage(await api(`/api/watches/${match[1]}`));
    else content = emptyState("That page wasn’t found.", '<a class="cta" href="/">Back home</a>');
  }
  app.innerHTML = shell(content, path);
  drawPriceChart();
}

async function boot() {
  if (location.pathname === "/") return;
  const publicPaths = ["/search", "/about"];
  if (!auth && !publicPaths.includes(location.pathname)) {
    loginPage();
    return;
  }
  try {
    await render();
  } catch (cause) {
    if (!auth) loginPage("That sign-in did not work. Check your username and password.");
    else app.innerHTML = `<main class="empty-card"><p>${escapeHtml(cause.message)}</p><button class="cta ghost" type="button" data-retry>Try again</button></main>`;
  }
}

app.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === "login-form") {
    event.preventDefault();
    const values = new FormData(form);
    const candidate = { username: String(values.get("username")), password: String(values.get("password")) };
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { authorization: basicHeader(candidate) } });
      if (!response.ok) throw new Error("That sign-in did not work. Check your username and password.");
      auth = candidate;
      sessionStorage.setItem(authKey, JSON.stringify(auth));
      if (pendingWatch) {
        const body = pendingWatch;
        pendingWatch = null;
        try {
          await saveWatch(body);
        } catch (cause) {
          if (!auth) {
            pendingWatch = body;
            loginPage("Sign in again to save this price watch.");
          } else {
            await boot();
            alert(cause.message);
          }
        }
      } else {
        await boot();
      }
    } catch (cause) {
      loginPage(cause.message);
    }
  } else if (form.id === "watch-form") {
    event.preventDefault();
    const values = new FormData(form);
    const body = Object.fromEntries(values.entries());
    body.alert_on_lowest = values.has("alert_on_lowest");
    if (!auth) {
      pendingWatch = body;
      loginPage("Sign in to save this price watch.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Adding watch…";
    try {
      await saveWatch(body);
    } catch (cause) {
      if (!auth) {
        pendingWatch = body;
        loginPage("Sign in to save this price watch.");
        return;
      }
      button.disabled = false;
      button.textContent = "Keep an eye on this";
      alert(cause.message);
    }
  } else if (form.id === "settings-form") {
    event.preventDefault();
    const values = new FormData(form);
    const body = Object.fromEntries(values.entries());
    try {
      await api("/api/settings", { method: "POST", body });
      document.getElementById("settings-message").innerHTML = '<div class="banner ok"><p>Saved. Go hunt something.</p></div>';
    } catch (cause) {
      document.getElementById("settings-message").innerHTML = `<div class="banner warn"><p>${escapeHtml(cause.message)}</p></div>`;
    }
  } else if (form.matches(".search-form")) {
    event.preventDefault();
    const query = new FormData(form).get("q");
    location.href = `/search?q=${encodeURIComponent(String(query || "").trim())}`;
  }
});

app.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target.closest("button") : null;
  if (!target) return;
  if (target.id === "theme-toggle") setTheme();
  if (target.hasAttribute("data-logout")) {
    auth = null;
    appState = null;
    sessionStorage.removeItem(authKey);
    loginPage();
  }
  if (target.hasAttribute("data-retry")) await boot();
  if (target.hasAttribute("data-step")) {
    const input = document.querySelector("[data-live-target]");
    if (input) input.value = String(Math.max(0, Number(input.value || 0) + Number(target.dataset.step)));
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (target.hasAttribute("data-filter")) {
    const row = target.closest("[data-filter-chips]");
    row?.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("is-on", chip === target));
    const filter = target.dataset.filter;
    applyFilters(filter, ".card[data-category]", "data-category", (category, chosen) => chosen === "all" || category === chosen);
  }
  if (target.hasAttribute("data-watch-filter")) {
    document.querySelectorAll("[data-watch-filter]").forEach((chip) => chip.classList.toggle("is-on", chip === target));
    const filter = target.dataset.watchFilter;
    applyFilters(filter, ".card[data-status]", "data-status", (status, chosen) => chosen === "all" || (chosen === "good" ? ["good", "lowest"].includes(status) : status === chosen));
  }
  if (target.hasAttribute("data-stat")) {
    document.querySelectorAll("[data-stat]").forEach((button) => button.classList.toggle("is-on", button === target));
  }
  if (target.hasAttribute("data-refresh")) {
    target.disabled = true;
    target.textContent = "Checking…";
    try {
      await api(`/api/watches/${target.dataset.refresh}/refresh`, { method: "POST" });
      await boot();
    } catch (cause) { alert(cause.message); }
  }
  if (target.hasAttribute("data-delete")) {
    if (!confirm("Stop watching this part?")) return;
    try {
      await api(`/api/watches/${target.dataset.delete}`, { method: "DELETE" });
      location.href = "/watchlist";
    } catch (cause) { alert(cause.message); }
  }
});

app.addEventListener("input", (event) => {
  if (!event.target.matches("[data-live-target]")) return;
  const value = event.target.value.trim();
  const live = document.querySelector("[data-target-live]");
  if (live) live.textContent = value ? `We’ll alert you if it drops to ${value} or below.` : "Leave blank to only hear about new lows.";
});

app.addEventListener("change", (event) => {
  if (!event.target.matches("[data-compare-item]")) return;
  const checks = [...document.querySelectorAll("[data-compare-item]:checked")];
  const prices = checks.map((input) => Number(input.closest(".offer").dataset.price));
  const output = document.querySelector("[data-compare-out]");
  document.querySelectorAll(".offer").forEach((card) => card.classList.toggle("is-picked", Boolean(card.querySelector("[data-compare-item]")?.checked)));
  if (output) output.textContent = prices.length ? `Among the ${prices.length} you ticked, cheapest is ${Math.min(...prices).toFixed(2)}.` : "Tick a few to compare.";
});

document.addEventListener("pointermove", (event) => {
  const glow = document.querySelector(".cursor-glow");
  if (glow) {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  }
});

boot();