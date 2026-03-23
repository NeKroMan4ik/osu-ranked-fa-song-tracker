"""
osu! Featured Artist ranked tracker — scraper
Usage:
    python update.py

Requires env vars:
    OSU_CLIENT_ID      — osu! OAuth application client id
    OSU_CLIENT_SECRET  — osu! OAuth application client secret

Output:
    data/artists.json
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from ossapi import Ossapi
from ossapi.enums import BeatmapsetSearchCategory  # RANKED = only ranked maps

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

SEARCH_DELAY = 1.5
OUT_PATH     = Path(__file__).parent / "data" / "artists.json"
BASE_URL     = "https://osu.ppy.sh"

# ── HTML client (scraping only, no auth needed) ───────────────────────────────

class _HtmlClient:
    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update({"Accept": "text/html,application/json"})

    def _get_html(self, path: str) -> BeautifulSoup:
        resp = self._session.get(f"{BASE_URL}{path}", timeout=15)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")

    def get_featured_artists(self) -> list[dict]:
        """
        Scrape /beatmaps/artists → list of {id, name}.
        id comes from href="/beatmaps/artists/534".
        """
        soup = self._get_html("/beatmaps/artists")
        artists = []
        for a in soup.select("a.artist__name"):
            name = a.get_text(strip=True)
            href = a.get("href", "")
            artist_id = int(href.rstrip("/").split("/")[-1])
            artists.append({"id": artist_id, "name": name})

        if not artists:
            raise RuntimeError("Parsed 0 artists — HTML structure may have changed.")
        return artists

    def get_artist_tracks(self, artist_id: int) -> list[str]:
        """
        Scrape /beatmaps/artists/{id} → list of track titles.
        Titles come from <script id="album-json-*" type="application/json">.
        Each script tag contains a JSON array with one or more track objects.
        """
        soup = self._get_html(f"/beatmaps/artists/{artist_id}")
        titles = []
        for script in soup.find_all("script", {"type": "application/json"}):
            script_id = script.get("id", "")
            if not (script_id.startswith("album-json-") or script_id.startswith("singles-json-")):
                continue
            try:
                tracks = json.loads(script.string)
                for track in tracks:
                    title = track.get("title", "")
                    if title:
                        titles.append(title)
            except (json.JSONDecodeError, AttributeError):
                continue  # malformed script tag, skip

        return titles


# ── Search via ossapi ─────────────────────────────────────────────────────────

def _find_ranked_beatmapset(
    api: Ossapi,
    artist: str,
    title: str,
) -> Optional[int]:
    """
    Search for a ranked beatmapset matching (artist, title).

    Uses search_beatmapsets with category=RANKED which returns only ranked maps.
    Every result is already ranked by definition, so no status check is needed.

    Compares BeatmapsetCompact.title (case-insensitive) to confirm the match,
    because the search query is fuzzy and may return unrelated results.

    Returns beatmapset_id if found, None otherwise.
    """
    result = api.search_beatmapsets(
        query=f'artist="{artist}" title="{title}"',
        category=BeatmapsetSearchCategory.RANKED,
    )

    for bms in result.beatmapsets:
        if bms.title.lower() == title.lower():
            return bms.id

    return None


# ── Core ──────────────────────────────────────────────────────────────────────

def build_artist_record(
    html_client: _HtmlClient,
    api: Ossapi,
    raw_artist: dict,
) -> dict:
    artist_id   = raw_artist["id"]
    artist_name = raw_artist["name"]

    print(f"  → {artist_name} (id={artist_id})", flush=True)

    track_titles = html_client.get_artist_tracks(artist_id)
    tracks: list[dict] = []

    for title in track_titles:
        beatmapset_id = _find_ranked_beatmapset(api, artist_name, title)
        tracks.append({
            "title":         title,
            "ranked":        beatmapset_id is not None,
            "beatmapset_id": beatmapset_id,
        })
        time.sleep(SEARCH_DELAY)  # throttle search calls only

    tracks.sort(key=lambda t: (0 if t["ranked"] else 1, t["title"].lower()))

    return {
        "id":         artist_id,
        "name":       artist_name,
        "tracks":     tracks,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def run() -> None:
    client_id     = os.environ["OSU_CLIENT_ID"]
    client_secret = os.environ["OSU_CLIENT_SECRET"]

    html_client = _HtmlClient()
    api         = Ossapi(int(client_id), client_secret)

    print("Fetching Featured Artist list…", flush=True)
    raw_artists = html_client.get_featured_artists()
    print(f"Found {len(raw_artists)} Featured Artists.\n", flush=True)

    results: list[dict] = []

    for i, raw_artist in enumerate(raw_artists, 1):
        print(f"[{i}/{len(raw_artists)}] Processing artist…", flush=True)
        try:
            results.append(build_artist_record(html_client, api, raw_artist))
        except Exception as exc:
            print(f"  ✗ Error: {exc}", file=sys.stderr)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict] = []
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    merged = {a["id"]: a for a in existing}
    for a in results:
        merged[a["id"]] = a
    OUT_PATH.write_text(
        json.dumps(list(merged.values()), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_tracks   = sum(len(a["tracks"]) for a in results)
    total_ranked   = sum(t["ranked"] for a in results for t in a["tracks"])
    total_unranked = total_tracks - total_ranked

    print(f"\n✓ Wrote {OUT_PATH}")
    print(f"  {len(results)} artists · {total_tracks} tracks · {total_ranked} ranked · {total_unranked} unranked")


if __name__ == "__main__":
    run()