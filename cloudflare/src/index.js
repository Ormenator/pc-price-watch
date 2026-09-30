const MARKETPLACES = {
  EBAY_GB: { label: "eBay UK", currency: "GBP", symbol: "£" },
  EBAY_US: { label: "eBay US", currency: "USD", symbol: "$" },
  EBAY_DE: { label: "eBay DE", currency: "EUR", symbol: "€" },
  EBAY_AU: { label: "eBay AU", currency: "AUD", symbol: "A$" },
};

const POPULAR = [
  { query: "RTX 4070 Super", category: "Graphics Cards", mood: "The usual ‘is it time?’ GPU", icon: "gpu" },
  { query: "RTX 5070", category: "Graphics Cards", mood: "New-gen itch", icon: "gpu" },
  { query: "Ryzen 7 7800X3D", category: "Processors", mood: "Gaming sweet spot", icon: "cpu" },
  { query: "Intel Core Ultra 7 265K", category: "Processors", mood: "Fresh silicon", icon: "cpu" },
  { query: "32GB DDR5 6000", category: "Memory", mood: "The kit everyone waits on", icon: "ram" },
  { query: "2TB NVMe SSD", category: "Storage", mood: "Game library room", icon: "ssd" },
  { query: "B650 motherboard", category: "Motherboards", mood: "Build foundation", icon: "mobo" },
  { query: "850W 80+ Gold PSU", category: "Power Supplies", mood: "Don’t cheap this one", icon: "psu" },
];

const SHOP_SEARCHES = [
  ["Amazon UK", "amazon.co.uk", "https://www.amazon.co.uk/s?k=", "UK", "AFFILIATE_AMAZON_UK"],
  ["Amazon US", "amazon.com", "https://www.amazon.com/s?k=", "US", "AFFILIATE_AMAZON_US"],
  ["Best Buy", "bestbuy.com", "https://www.bestbuy.com/site/searchpage.jsp?st=", "US", "AFFILIATE_BESTBUY"],
  ["Newegg", "newegg.com", "https://www.newegg.com/p/pl?d=", "US", "AFFILIATE_NEWEGG"],
  ["B&H Photo", "bhphotovideo.com", "https://www.bhphotovideo.com/c/search?Ntt=", "US", "AFFILIATE_BH"],
  ["Micro Center", "microcenter.com", "https://www.microcenter.com/search/search_results.aspx?Ntt=", "US", "AFFILIATE_MICROCENTER"],
  ["Walmart", "walmart.com", "https://www.walmart.com/search?q=", "US", "AFFILIATE_WALMART"],
  ["Currys", "currys.co.uk", "https://www.currys.co.uk/search?q=", "UK", "AFFILIATE_CURRYS"],
  ["Scan", "scan.co.uk", "https://www.scan.co.uk/search?q=", "UK", "AFFILIATE_SCAN"],
  ["Overclockers UK", "overclockers.co.uk", "https://www.overclockers.co.uk/search.php?search=", "UK", "AFFILIATE_OVERCLK"],
  ["CCL Computers", "cclonline.com", "https://www.cclonline.com/search/?q=", "UK", "AFFILIATE_CCL"],
  ["Ebuyer", "ebuyer.com", "https://www.ebuyer.com/search?q=", "UK", "AFFILIATE_EBUYER"],
  ["AWD-IT", "awd-it.co.uk", "https://www.awd-it.co.uk/catalogsearch/result/?q=", "UK", "AFFILIATE_AWDIT"],
  ["Alternate", "alternate.co.uk", "https://www.alternate.co.uk/listing.xhtml?q=", "EU", "AFFILIATE_ALTERNATE"],
  ["LDLC", "ldlc.com", "https://www.ldlc.com/en/search/", "EU", "AFFILIATE_LDLC"],
  ["Caseking", "caseking.de", "https://www.caseking.de/en/search?sSearch=", "EU", "AFFILIATE_CASEKING"],
];

const STATUS_COPY = {
  building: ["Building history", "We need a few price checks before calling this a deal."],
  good: ["Good price", "Currently below the recent average — a strong time to buy."],
  lowest: ["Cheapest recorded", "This is the lowest price we have seen for this watch."],
  fair: ["Fair price", "Close to the recent average. Waiting may still pay off."],
  high: ["High price", "Above the recent average. A reminder will fire if it drops."],
};

let ebayToken;
let ebayTokenExpires = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function now() {
  return new Date().toISOString();
}

async function rows(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).all();
  return result.results || [];
}

async function setting(db, key, fallback = "") {
  const result = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return result?.value || fallback;
}

async function allSettings(db) {
  const result = await rows(db, "SELECT key, value FROM settings");
  return Object.fromEntries(result.map((item) => [item.key, item.value]));
}

async function saveSettings(db, values) {
  const timestamp = now();
  await db.batch(Object.entries(values).map(([key, value]) => db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(key, String(value ?? ""), timestamp)));
}

function shopSearches(query, env) {
  return SHOP_SEARCHES.map(([name, domain, base, region, affiliateKey]) => {
    const affiliate = String(env[affiliateKey] || "").trim().replace(/^[?&]+/, "");
    const separator = base.includes("?") ? "&" : "";
    const url = `${base}${encodeURIComponent(query)}${affiliate ? `${separator}&${affiliate}` : ""}`;
    return { name, domain, region, url, affiliate: affiliate ? "yes" : "" };
  });
}

async function ebayAccessToken(config) {
  if (ebayToken && Date.now() < ebayTokenExpires - 60_000) return ebayToken;
  if (!config.ebay_client_id || !config.ebay_client_secret) {
    throw new Error("Add your eBay Client ID and Secret in Settings.");
  }
  const credentials = btoa(`${config.ebay_client_id}:${config.ebay_client_secret}`);
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!response.ok) throw new Error(`eBay login failed (HTTP ${response.status}). Check your API keys.`);
  const payload = await response.json();
  ebayToken = payload.access_token;
  ebayTokenExpires = Date.now() + Number(payload.expires_in || 7200) * 1000;
  return ebayToken;
}

async function searchEbay(config, query) {
  const token = await ebayAccessToken(config);
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.search = new URLSearchParams({
    q: query,
    limit: "20",
    filter: "buyingOptions:{FIXED_PRICE},conditions:{NEW}",
    sort: "price",
  });
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": config.ebay_marketplace,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`eBay search failed (HTTP ${response.status}).`);
  const payload = await response.json();
  return (payload.itemSummaries || []).flatMap((item) => {
    const price = Number(item.price?.value);
    if (!Number.isFinite(price)) return [];
    return [{
      title: item.title || query,
      price,
      currency: item.price?.currency || MARKETPLACES[config.ebay_marketplace]?.currency || "GBP",
      source: "eBay",
      url: item.itemWebUrl || "",
      image_url: item.image?.imageUrl || null,
      condition: item.condition || null,
      seller: item.seller?.username || null,
      item_id: item.itemId || null,
    }];
  }).sort((left, right) => left.price - right.price);
}

async function searchBestBuy(apiKey, query) {
  if (!apiKey) return [];
  const url = new URL("https://api.bestbuy.com/v1/products");
  url.pathname += `((search=${query.replaceAll('"', " ")}))`;
  url.search = new URLSearchParams({
    apiKey,
    format: "json",
    show: "sku,name,salePrice,regularPrice,url,image,manufacturer,onlineAvailability",
    pageSize: "12",
    sort: "salePrice.asc",
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Best Buy search failed (HTTP ${response.status}).`);
  const payload = await response.json();
  return (payload.products || []).flatMap((item) => {
    const price = Number(item.salePrice || item.regularPrice);
    if (!Number.isFinite(price) || item.onlineAvailability === false) return [];
    return [{
      title: item.name || query,
      price,
      currency: "USD",
      source: "Best Buy",
      url: item.url || "",
      image_url: item.image || null,
      condition: null,
      seller: "Best Buy",
      item_id: String(item.sku || ""),
    }];
  }).sort((left, right) => left.price - right.price);
}

async function searchParts(db, env, query) {
  const trimmed = query.trim();
  const result = { query: trimmed, offers: [], errors: [], sources_used: [], shop_searches: [] };
  if (!trimmed) {
    result.errors.push("Enter a PC part to search.");
    return result;
  }
  result.shop_searches = shopSearches(trimmed, env);
  const config = await allSettings(db);
  config.ebay_marketplace = MARKETPLACES[config.ebay_marketplace] ? config.ebay_marketplace : "EBAY_GB";
  if (config.ebay_client_id && config.ebay_client_secret) {
    try {
      const offers = await searchEbay(config, trimmed);
      result.offers.push(...offers);
      if (offers.length) result.sources_used.push("eBay Browse API");
    } catch (cause) {
      result.errors.push(cause instanceof Error ? cause.message : "eBay search failed.");
    }
  } else {
    result.errors.push("Connect eBay in Settings to search live listings. eBay’s official Browse API is the main legal source.");
  }
  if (config.bestbuy_api_key) {
    try {
      const offers = await searchBestBuy(config.bestbuy_api_key, trimmed);
      result.offers.push(...offers);
      if (offers.length) result.sources_used.push("Best Buy Products API");
    } catch (cause) {
      result.errors.push(cause instanceof Error ? cause.message : "Best Buy search failed.");
    }
  }
  result.offers.sort((left, right) => left.currency.localeCompare(right.currency) || left.price - right.price);
  result.cheapest = result.offers.filter((offer) => offer.price > 0).sort((left, right) => left.price - right.price)[0] || null;
  return result;
}

async function addAlert(db, watchId, kind, message) {
  await db.prepare("INSERT INTO alerts (watch_id, kind, message, created_at, read) VALUES (?, ?, ?, ?, 0)")
    .bind(watchId, kind, message, now()).run();
}

async function getWatch(db, watchId) {
  return db.prepare("SELECT * FROM watches WHERE id = ?").bind(watchId).first();
}

async function listSnapshots(db, watchId, limit = 120) {
  return rows(db, "SELECT * FROM snapshots WHERE watch_id = ? ORDER BY recorded_at ASC LIMIT ?", watchId, limit);
}

function insightFromSnapshots(snapshots, current) {
  const prices = snapshots.map((snapshot) => Number(snapshot.price)).filter(Number.isFinite);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = snapshots.filter((snapshot) => Date.parse(snapshot.recorded_at) >= cutoff)
    .map((snapshot) => Number(snapshot.price)).filter(Number.isFinite);
  const lowest = prices.length ? Math.min(...prices) : current;
  const average30 = recent.length ? recent.reduce((sum, price) => sum + price, 0) / recent.length : current;
  const currentPrice = current ?? (prices.length ? prices[prices.length - 1] : null);
  let status = "building";
  let deltaPct = null;
  if (currentPrice !== null && average30) {
    deltaPct = ((currentPrice - average30) / average30) * 100;
    if (recent.length < 3) status = "building";
    else if (currentPrice <= (lowest ?? currentPrice) && prices.length >= 2) status = "lowest";
    else if (deltaPct <= -5) status = "good";
    else if (deltaPct >= 8) status = "high";
    else status = "fair";
  }
  return {
    current: currentPrice,
    lowest,
    average_30: average30,
    delta_pct: deltaPct,
    status,
    sample_count: prices.length,
    labels: snapshots.slice(-60).map((snapshot) => snapshot.recorded_at.slice(5, 16).replace("T", " ")),
    series: snapshots.slice(-60).map((snapshot) => Number(snapshot.price)),
  };
}

function currencySymbol(watch) {
  return { GBP: "£", USD: "$", EUR: "€", AUD: "A$" }[watch.currency || "GBP"] || "£";
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function refreshWatch(db, env, watchId) {
  const watch = await getWatch(db, watchId);
  if (!watch) throw new Error("Watch not found");
  const before = await listSnapshots(db, watchId);
  const previousLow = before.length ? Math.min(...before.map((snapshot) => Number(snapshot.price))) : null;
  const result = await searchParts(db, env, watch.query);
  const cheapest = result.cheapest;
  if (!cheapest) {
    await addAlert(db, watchId, "error", `No live offers found for ${watch.title}.`);
    return { ok: false, errors: result.errors };
  }
  const timestamp = now();
  await db.batch([
    db.prepare(`UPDATE watches SET last_checked = ?, last_price = ?, last_source = ?, last_listing_url = ?,
      last_listing_title = ?, image_url = COALESCE(?, image_url) WHERE id = ?`)
      .bind(timestamp, cheapest.price, cheapest.source, cheapest.url, cheapest.title, cheapest.image_url, watchId),
    db.prepare(`INSERT INTO snapshots (watch_id, price, source, listing_url, listing_title, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(watchId, cheapest.price, cheapest.source, cheapest.url, cheapest.title, timestamp),
  ]);
  const updatedWatch = await getWatch(db, watchId);
  const snapshots = await listSnapshots(db, watchId);
  const insight = insightFromSnapshots(snapshots, cheapest.price);
  const symbol = currencySymbol(watch);
  if (watch.target_price !== null && cheapest.price <= Number(watch.target_price)) {
    await addAlert(db, watchId, "target", `${watch.title} is ${symbol}${cheapest.price.toFixed(2)} — at or below your target of ${symbol}${Number(watch.target_price).toFixed(2)}.`);
  }
  if (watch.alert_on_lowest && previousLow !== null && cheapest.price < previousLow - 0.01) {
    await addAlert(db, watchId, "lowest", `${watch.title} just hit a new lowest: ${symbol}${cheapest.price.toFixed(2)}.`);
  } else if (watch.alert_on_lowest && watch.last_price === null) {
    await addAlert(db, watchId, "info", `Started watching ${watch.title} at ${symbol}${cheapest.price.toFixed(2)}.`);
  }
  if (insight.status === "good" && watch.last_price && cheapest.price < Number(watch.last_price)) {
    await addAlert(db, watchId, "good", `${watch.title} is a good price (${insight.delta_pct.toFixed(1)}% below the 30-day average).`);
  }
  return { ok: true, watch: updatedWatch, insight, errors: result.errors };
}

async function requireAuth(request, env) {
  const expectedUser = env.APP_USERNAME || "admin";
  const expectedPassword = env.APP_PASSWORD || "";
  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded || !expectedPassword) return false;
  let supplied;
  try {
    supplied = atob(encoded);
  } catch {
    return false;
  }
  const split = supplied.indexOf(":");
  if (split < 0) return false;
  return await constantTimeEqual(supplied.slice(0, split), expectedUser)
    && await constantTimeEqual(supplied.slice(split + 1), expectedPassword);
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/auth" && request.method === "POST") {
    return await requireAuth(request, env) ? json({ ok: true }) : error("Invalid username or password", 401);
  }
  if (!await requireAuth(request, env)) return error("Sign in required", 401);
  if (path === "/api/health" && request.method === "GET") return json({ ok: true });

  if (path === "/api/state" && request.method === "GET") {
    const watches = await rows(env.DB, "SELECT * FROM watches ORDER BY created_at DESC LIMIT 4");
    const alerts = await rows(env.DB, `SELECT alerts.*, watches.title AS watch_title FROM alerts
      LEFT JOIN watches ON watches.id = alerts.watch_id ORDER BY alerts.created_at DESC LIMIT 5`);
    const unread = await env.DB.prepare("SELECT COUNT(*) AS n FROM alerts WHERE read = 0").first();
    const config = await allSettings(env.DB);
    return json({
      watches,
      alerts,
      unread: Number(unread?.n || 0),
      popular: POPULAR,
      marketplaces: MARKETPLACES,
      config: {
        ebay_ready: Boolean(config.ebay_client_id && config.ebay_client_secret),
        bestbuy_ready: Boolean(config.bestbuy_api_key),
        ebay_marketplace: MARKETPLACES[config.ebay_marketplace] ? config.ebay_marketplace : "EBAY_GB",
      },
    });
  }

  if (path === "/api/search" && request.method === "GET") {
    return json(await searchParts(env.DB, env, url.searchParams.get("q") || ""));
  }

  if (path === "/api/watches" && request.method === "GET") {
    const watches = await rows(env.DB, "SELECT * FROM watches ORDER BY created_at DESC");
    const cards = await Promise.all(watches.map(async (watch) => {
      const snapshots = await listSnapshots(env.DB, watch.id);
      const insight = insightFromSnapshots(snapshots, watch.last_price);
      return { watch, insight, status_label: STATUS_COPY[insight.status][0] };
    }));
    return json({ cards });
  }

  if (path === "/api/watches" && request.method === "POST") {
    const body = await request.json();
    if (!String(body.query || "").trim()) return error("Enter a part to watch.");
    const inserted = await env.DB.prepare(`INSERT INTO watches
      (query, title, category, image_url, currency, marketplace, target_price, alert_on_lowest, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(String(body.query).trim(), String(body.title || body.query).trim(), String(body.category || "PC Parts").trim(),
        body.image_url || null, body.currency || "GBP", body.marketplace || "EBAY_GB",
        body.target_price === "" || body.target_price === null ? null : Number(body.target_price),
        body.alert_on_lowest ? 1 : 0, now()).run();
    const watchId = Number(inserted.meta?.last_row_id);
    if (!watchId) return error("Could not save this watch.", 500);
    ctx.waitUntil(refreshWatch(env.DB, env, watchId).catch((cause) => addAlert(env.DB, watchId, "error", `Refresh failed: ${cause.message}`)));
    return json({ id: watchId }, 201);
  }

  const watchMatch = path.match(/^\/api\/watches\/(\d+)(?:\/(refresh))?$/);
  if (watchMatch) {
    const watchId = Number(watchMatch[1]);
    if (request.method === "GET" && !watchMatch[2]) {
      const watch = await getWatch(env.DB, watchId);
      if (!watch) return error("Watch not found", 404);
      const snapshots = await listSnapshots(env.DB, watchId);
      const insight = insightFromSnapshots(snapshots, watch.last_price);
      return json({ watch, snapshots, insight, status_label: STATUS_COPY[insight.status][0], status_blurb: STATUS_COPY[insight.status][1] });
    }
    if (request.method === "POST" && watchMatch[2]) {
      return json(await refreshWatch(env.DB, env, watchId));
    }
    if (request.method === "DELETE" && !watchMatch[2]) {
      await env.DB.prepare("DELETE FROM watches WHERE id = ?").bind(watchId).run();
      return json({ ok: true });
    }
  }

  if (path === "/api/alerts" && request.method === "GET") {
    const alerts = await rows(env.DB, `SELECT alerts.*, watches.title AS watch_title FROM alerts
      LEFT JOIN watches ON watches.id = alerts.watch_id ORDER BY alerts.created_at DESC LIMIT 50`);
    await env.DB.prepare("UPDATE alerts SET read = 1").run();
    return json({ alerts });
  }

  if (path === "/api/settings" && request.method === "GET") {
    const config = await allSettings(env.DB);
    return json({
      ebay_client_id: config.ebay_client_id || "",
      ebay_marketplace: MARKETPLACES[config.ebay_marketplace] ? config.ebay_marketplace : "EBAY_GB",
      ebay_ready: Boolean(config.ebay_client_id && config.ebay_client_secret),
      bestbuy_ready: Boolean(config.bestbuy_api_key),
    });
  }

  if (path === "/api/settings" && request.method === "POST") {
    const body = await request.json();
    const values = { ebay_marketplace: MARKETPLACES[body.ebay_marketplace] ? body.ebay_marketplace : "EBAY_GB" };
    for (const key of ["ebay_client_id", "ebay_client_secret", "bestbuy_api_key"]) {
      if (typeof body[key] === "string" && body[key].trim()) values[key] = body[key].trim();
    }
    await saveSettings(env.DB, values);
    return json({ ok: true });
  }

  return error("Not found", 404);
}

async function refreshAll(db, env) {
  const watches = await rows(db, "SELECT id FROM watches ORDER BY id");
  for (const watch of watches) {
    try {
      await refreshWatch(db, env, Number(watch.id));
    } catch (cause) {
      await addAlert(db, watch.id, "error", `Refresh failed: ${cause instanceof Error ? cause.message : "Unknown error"}`);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, ctx);
      } catch (cause) {
        console.error("API request failed", cause);
        return error("The request could not be completed. Check the Worker logs for details.", 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshAll(env.DB, env));
  },
};