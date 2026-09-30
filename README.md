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

## Deploy on Render

The included `render.yaml` configures a Render web service, a persistent disk for the SQLite database, and HTTP Basic Authentication. The persistent disk requires a paid Render instance.

1. Push this repository to GitHub.
2. In Render, choose **New** > **Blueprint**, then connect this repository.
3. Deploy the Blueprint. Render generates the `APP_PASSWORD` value; `APP_USERNAME` defaults to `admin`.
4. Find the service URL in Render, open it, and sign in with those credentials.
5. Add your eBay API keys in the app's **Settings** page.

Keep the generated password private. Do not commit API keys or passwords to the repository. The local `.env` file and SQLite database are excluded by `.gitignore`.
