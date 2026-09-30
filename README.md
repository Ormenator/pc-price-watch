# PC Hardware Watch

Search any PC part, keep a price history, and get a reminder when it is cheap.

## Legal sources

This app does **not** scrape Amazon, Currys, Scan, Newegg, or similar storefronts (that usually breaks their terms). It only uses official APIs you connect:

- **eBay Browse API** (main source, free developer account) — UK by default
- **Best Buy Products API** (optional, US)

Search results also include links to retailer-owned search pages for well-known US, UK, and EU shops. These links pass the query to each shop; the app does not collect or copy their listings.

## Optional affiliate links

You can add tracking parameters from programs you are approved for by setting environment variables such as `AFFILIATE_AMAZON_UK=tag=yourtag-21` or `AFFILIATE_NEWEGG=...`. The value is appended only to that shop's link and is labeled as an affiliate link in the interface. Do not add tracking parameters unless the retailer or affiliate network has approved your account and format.

Your own watchlist history is stored locally in SQLite. “Good price” / “cheapest recorded” is computed from those checks.

## Run on Windows

Double-click `run.bat`, or:

```powershell
cd C:\Users\hohar\pc-price-watch
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787).

## Go live

1. Create an eBay developer app: https://developer.ebay.com/my/keys
2. Copy the **production** Client ID and Client Secret
3. Paste them in **Settings**
4. Search a part (for example `RTX 4070 Super`) and click **Watch this product**
5. Optionally set a target price and/or “alert on new cheapest”

Background checks run about every 30 minutes. Add SMTP settings if you want email as well as in-app alerts.

## Deploy on Cloudflare

The Cloudflare version uses a Worker for the app, D1 for persistent watch data, and a Cron Trigger for scheduled checks. It is configured for Cloudflare's free tier; usage is subject to Cloudflare's free-plan limits. Email alerts are not included in the Worker version; in-app alerts are.

1. Create a free Cloudflare account and a D1 database named `pc-price-watch-db`.
2. Copy the D1 database ID into `cloudflare/wrangler.jsonc`, replacing the all-zero placeholder.
3. In GitHub, add secret `CLOUDFLARE_API_TOKEN` and variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_DEPLOY_ENABLED=true`. The API token needs permission to deploy Workers and manage D1.
4. Push the updated repository to `main`. The GitHub Actions workflow applies the D1 migration and deploys the Worker.
5. In the Cloudflare Worker settings, add `APP_PASSWORD` as a secret. The app username is `admin`. Homepage and search are public; saving watches and opening watchlists, alerts, or settings requires sign-in.
6. Open the Worker’s `workers.dev` URL and sign in to add your eBay keys in **Settings**. Once configured, anyone can search; visitors are prompted to sign in when they save a watch.

The homepage search and parts catalog are public; visitors can search the catalog and live offers before signing in. Sign-in is requested only when they choose to track a model, while watchlists and settings stay private. The starter catalog contains 17 graphics cards and 26 motherboards. D1 stores normalized part details plus flexible JSON specs, with an FTS5 index for model/spec searches; categories are data-driven so cases, keyboards, mice, monitors, and other parts can be added without changing the search schema. Exact-model retailer photos are cached when available, with hardware-type artwork as the fallback. This is a starter catalog, not yet a complete PC parts database.

Do not put API keys, passwords, or Cloudflare tokens in GitHub files. The local `.env`, Worker development secrets, and database files are excluded by `.gitignore`.

For local Worker development, install Node.js, then run `npm install` and `npm run dev` from `cloudflare/`. The existing Windows `run.bat` continues to run the original local Python app.
