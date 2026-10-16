#!/usr/bin/env python3
"""Read-only public website checks for rental source coverage; only rental_* audit tables are written.

This is a baseline collector, not a claim of exhaustive listing extraction.
Secrets via CI environment only; never put a service key in a public client.
"""
import datetime as dt
import html
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
UA = "SMBG-rental-source-check/1.0 (public rental listings audit)"
LIMIT = int(os.getenv("SOURCE_LIMIT", "0"))
RUN = "collector-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
PAGES_PER_SOURCE = 4
TERMS = ("location", "louer", "appartement", "annonce", "immobilier", "rental")
EXCLUDE = ("contact", "login", "connexion", "sign-in", "inscription", "favoris", "acheter")
PARIS = ("paris", "75005", "75006", "75007", "75014", "75015")
RENT = re.compile(r"(?:1[ .]?\d{3}|[7-9]\d{2})\s*(?:€|euros)", re.I)
AREA = re.compile(r"\b(?:3[7-9]|[4-9]\d|1\d\d)(?:[.,]\d{1,2})?\s*(?:m²|m2)\b", re.I)

def api(path, method="GET", data=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=minimal"
    req = urllib.request.Request(URL + "/rest/v1/" + path,
        data=json.dumps(data).encode() if data is not None else None, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read()
        return json.loads(body) if body else None

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for name, value in attrs:
                if name == "href" and value: self.links.append(value)

def fetch_page(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=12) as res:
        if "text/html" not in res.headers.get("content-type", ""): raise ValueError("not html")
        data = res.read(600_000).decode("utf-8", "replace")
        return data

def check_source(source):
    origin = source["url"]
    p = urllib.parse.urlparse(origin)
    if p.scheme not in ("http", "https") or not p.hostname:
        return "inaccessible", "Invalid URL", 0
    if source.get("access_mode") in ("login_required", "may_require_login"):
        # Still attempt a public page: don't automatically report login-required.
        pass
    seen = set()
    todo = [origin]
    visited = 0
    candidates = 0
    blocked = 0
    while todo and visited < PAGES_PER_SOURCE:
        url = todo.pop(0)
        if url in seen: continue
        seen.add(url)
        try:
            markup = fetch_page(url)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            code = getattr(exc, "code", "")
            if code in (401, 403): blocked += 1
            if visited == 0 and not todo:
                if code in (401, 403): return "login_required", "HTTP " + str(code) + " on entry", 0
                return "inaccessible", type(exc).__name__ + " on entry", 0
            continue
        visited += 1
        text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
        if RENT.search(text) and AREA.search(text) and any(s in text.lower() for s in PARIS):
            candidates += 1
        links = Links()
        links.feed(markup)
        for href in links.links:
            full = urllib.parse.urljoin(url, href)
            parsed = urllib.parse.urlparse(full)
            if parsed.hostname != p.hostname or parsed.scheme not in ("http", "https"): continue
            clean = full.split("#")[0]
            low = clean.lower()
            if clean not in seen and clean not in todo and any(t in low for t in TERMS) and not any(t in low for t in EXCLUDE):
                todo.append(clean)
    if visited == 0:
        return ("login_required" if blocked else "inaccessible"), "No accessible HTML pages", 0
    if visited == 1 and origin == next(iter(seen)) and not todo:
        return "not_checked_technical_limit", "Only entry page inspected; no relevant searchable listing links found", 0
    # A machine-detected candidate is not a verified qualifying listing; human verification required.
    return "not_checked_technical_limit", f"Read {visited} pages, found {candidates} candidate page(s); listing inventory and qualification still require review", 0

def visited_if_unavailable(outcome, note):\n    return outcome in ("inaccessible", "login_required")\n\ndef main():
    settings = api("rental_search_settings?id=eq.default&select=preferred_polygon,near_zone_buffer_m")
    if not settings: raise RuntimeError("Missing rental search settings")
    sources = api("rental_search_sources?active=eq.true&select=source_key,name,category,url,priority,access_mode&order=priority.asc,category.asc,name.asc")
    if LIMIT: sources = sources[:LIMIT]
    actions = api("rental_listing_user_actions?select=listing_id,action")
    listings = api("rental_listings?select=id,source_url,available_status")
    print(json.dumps({"run": RUN, "source_count": len(sources), "listings": len(listings), "user_actions": len(actions), "buffer_m": settings[0]["near_zone_buffer_m"]}))
    totals = {}
    for source in sources:
        outcome, note, count = check_source(source)
        totals[outcome] = totals.get(outcome, 0) + 1
        api("rental_source_checks", "POST", [{"run_key": RUN, "source_key": source["source_key"], "outcome": outcome, "discovered_count": count, "note": note[:600]}])
        # A genuine network attempt counts as attempted even if detailed verification is incomplete.\n        if not note.startswith("Only entry page inspected") or visited_if_unavailable(outcome, note):
            key = urllib.parse.quote(source["source_key"], safe="")
            api("rental_search_sources?source_key=eq." + key, "PATCH", {"last_attempted_at": dt.datetime.now(dt.timezone.utc).isoformat(), "last_outcome": outcome})
        print(json.dumps({"source": source["name"], "outcome": outcome, "note": note}))
        time.sleep(.2)
    print("SUMMARY " + json.dumps(totals))

if __name__ == "__main__":
    main()
