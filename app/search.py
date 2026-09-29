from __future__ import annotations

import os
from urllib.parse import quote_plus

from app.config import AppConfig
from app.bestbuy_provider import BestBuyError, search_bestbuy
from app.ebay_provider import EbayError, search_ebay
from app.pricing import SearchResult


SHOP_SEARCHES = (
    ("Amazon UK", "amazon.co.uk", "https://www.amazon.co.uk/s?k={query}{affiliate}", "UK", "AFFILIATE_AMAZON_UK"),
    ("Amazon US", "amazon.com", "https://www.amazon.com/s?k={query}{affiliate}", "US", "AFFILIATE_AMAZON_US"),
    ("Best Buy", "bestbuy.com", "https://www.bestbuy.com/site/searchpage.jsp?st={query}{affiliate}", "US", "AFFILIATE_BESTBUY"),
    ("Newegg", "newegg.com", "https://www.newegg.com/p/pl?d={query}{affiliate}", "US", "AFFILIATE_NEWEGG"),
    ("B&H Photo", "bhphotovideo.com", "https://www.bhphotovideo.com/c/search?Ntt={query}{affiliate}", "US", "AFFILIATE_BH"),
    ("Micro Center", "microcenter.com", "https://www.microcenter.com/search/search_results.aspx?Ntt={query}{affiliate}", "US", "AFFILIATE_MICROCENTER"),
    ("Walmart", "walmart.com", "https://www.walmart.com/search?q={query}{affiliate}", "US", "AFFILIATE_WALMART"),
    ("Currys", "currys.co.uk", "https://www.currys.co.uk/search?q={query}{affiliate}", "UK", "AFFILIATE_CURRYS"),
    ("Scan", "scan.co.uk", "https://www.scan.co.uk/search?q={query}{affiliate}", "UK", "AFFILIATE_SCAN"),
    ("Overclockers UK", "overclockers.co.uk", "https://www.overclockers.co.uk/search.php?search={query}{affiliate}", "UK", "AFFILIATE_OVERCLK"),
    ("CCL Computers", "cclonline.com", "https://www.cclonline.com/search/?q={query}{affiliate}", "UK", "AFFILIATE_CCL"),
    ("Ebuyer", "ebuyer.com", "https://www.ebuyer.com/search?q={query}{affiliate}", "UK", "AFFILIATE_EBUYER"),
    ("AWD-IT", "awd-it.co.uk", "https://www.awd-it.co.uk/catalogsearch/result/?q={query}{affiliate}", "UK", "AFFILIATE_AWDIT"),
    ("Alternate", "alternate.co.uk", "https://www.alternate.co.uk/listing.xhtml?q={query}{affiliate}", "EU", "AFFILIATE_ALTERNATE"),
    ("LDLC", "ldlc.com", "https://www.ldlc.com/en/search/{query}/{affiliate}", "EU", "AFFILIATE_LDLC"),
    ("Caseking", "caseking.de", "https://www.caseking.de/en/search?sSearch={query}{affiliate}", "EU", "AFFILIATE_CASEKING"),
)


def shop_search_links(query: str) -> list[dict[str, str]]:
    encoded_query = quote_plus(query)
    return [
        {
            "name": name,
            "domain": domain,
            "region": region,
            "url": template.format(
                query=encoded_query,
                affiliate=(f"&{os.getenv(env_key).strip().lstrip('?&')}" if os.getenv(env_key, "").strip() else ""),
            ),
            "affiliate": "yes" if os.getenv(env_key, "").strip() else "",
        }
        for name, domain, template, region, env_key in SHOP_SEARCHES
    ]


def search_parts(config: AppConfig, query: str) -> SearchResult:
    result = SearchResult(query=query.strip())
    if not result.query:
        result.errors.append("Enter a PC part to search.")
        return result
    result.shop_searches = shop_search_links(result.query)

    if config.ebay_ready:
        try:
            ebay_offers = search_ebay(config, result.query)
            result.offers.extend(ebay_offers)
            if ebay_offers:
                result.sources_used.append("eBay Browse API")
        except EbayError as exc:
            result.errors.append(str(exc))
    else:
        result.errors.append(
            "Connect eBay in Settings to search live listings. eBay’s official Browse API is the main legal source."
        )

    if config.bestbuy_ready:
        try:
            bb_offers = search_bestbuy(config, result.query)
            result.offers.extend(bb_offers)
            if bb_offers:
                result.sources_used.append("Best Buy Products API")
        except BestBuyError as exc:
            result.errors.append(str(exc))

    result.offers.sort(key=lambda o: (o.currency, o.price))
    return result
