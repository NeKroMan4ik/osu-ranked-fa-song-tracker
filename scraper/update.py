"""
osu! Featured Artist ranked tracker — scraper (compact modes variant)
Usage:
    python update.py

Output format per track:
{
  "title": "...",
  "ranked_modes": ["mania", "osu"],
  "beatmapset_ids_by_mode": {
    "mania": [2449706],
    "osu": [1987654]
  }
}
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from ossapi import Ossapi
from ossapi.enums import BeatmapsetSearchCategory  # RANKED = only ranked maps

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

SEARCH_DELAY = 1.25
OUT_PATH     = Path(__file__).parent.parent / "data" / "artists.json"
BASE_URL     = "https://osu.ppy.sh"

# ── HTML client ───────────────────────────────────────────────────────────────

class _HtmlClient:
    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update({"Accept": "text/html,application/json"})

    def _get_html(self, path: str) -> BeautifulSoup:
        resp = self._session.get(f"{BASE_URL}{path}", timeout=15)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")

    def get_featured_artists(self) -> list[dict]:
        soup = self._get_html("/beatmaps/artists")
        artists = []

        for a in soup.select("a.artist__name"):
            name = a.get_text(strip=True)
            href = a.get("href", "")
            try:
                artist_id = int(href.rstrip("/").split("/")[-1])
                artists.append({"id": artist_id, "name": name})
            except (ValueError, IndexError):
                continue

        if not artists:
            raise RuntimeError("Parsed 0 artists — HTML structure changed?")
        return artists

    def get_artist_tracks(self, artist_id: int) -> list[str]:
        soup = self._get_html(f"/beatmaps/artists/{artist_id}")
        titles = set()  # using set to avoid the dupes
        for script in soup.find_all("script", {"type": "application/json"}):
            sid = script.get("id", "")
            if not (sid.startswith("album-json-") or sid.startswith("singles-json-")):
                continue
            try:
                data = json.loads(script.string or "")

                tracks = data if isinstance(data, list) else data.get("tracks", [])
                for t in tracks:
                    title = (t or {}).get("title", "").strip()
                    if title:
                        titles.add(title)
            except (json.JSONDecodeError, AttributeError, TypeError):
                continue
        return sorted(titles)


# ── API search ────────────────────────────────────────────────────────────────

def find_ranked_beatmapsets(
    api: Ossapi,
    artist: str,
    title: str,
) -> Tuple[List[int], Dict[str, List[int]]]:
    query = f'artist="{artist}" title="{title}"'
    try:
        result = api.search_beatmapsets(
            query=query,
            category=BeatmapsetSearchCategory.RANKED,
        )
    except Exception as e:
        print(f"  Search failed for '{title}': {e}", file=sys.stderr)
        return [], {}

    found_ids = []
    mode_to_ids: Dict[str, List[int]] = {}

    for bms in result.beatmapsets:
        if title == bms.title:
            found_ids.append(bms.id)

            modes_here = set()
            if hasattr(bms, "beatmaps") and bms.beatmaps:
                for bm in bms.beatmaps:
                    mode_str = bm.mode.value.lower()
                    modes_here.add(mode_str)
            elif hasattr(bms, "mode") and bms.mode:
                modes_here.add(bms.mode.value.lower())

            for m in modes_here:
                mode_to_ids.setdefault(m, []).append(bms.id)

    for m in mode_to_ids:
        mode_to_ids[m] = sorted(set(mode_to_ids[m]))

    return sorted(set(found_ids)), mode_to_ids


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
        all_ids, mode_to_ids = find_ranked_beatmapsets(api, artist_name, title)

        ranked_modes = sorted(mode_to_ids.keys())

        track_entry = {
            "title": title,
            "ranked_modes": ranked_modes,                # always list
            "beatmapset_ids_by_mode": mode_to_ids        # always dict
        }

        tracks.append(track_entry)

        time.sleep(SEARCH_DELAY)

    # sorted by ranked then title
    tracks.sort(key=lambda t: (0 if "ranked_modes" in t else 1, t["title"].lower()))

    return {
        "id": artist_id,
        "name": artist_name,
        "tracks": tracks,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def run() -> None:
    client_id     = os.environ.get("OSU_CLIENT_ID")
    client_secret = os.environ.get("OSU_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("Error: OSU_CLIENT_ID and OSU_CLIENT_SECRET required", file=sys.stderr)
        sys.exit(1)

    html_client = _HtmlClient()
    api         = Ossapi(int(client_id), client_secret)

    print("Fetching Featured Artist list…", flush=True)
    raw_artists = html_client.get_featured_artists()
    print(f"Found {len(raw_artists)} Featured Artists.\n", flush=True)

    results: list[dict] = []

    for i, raw in enumerate(raw_artists, 1):
        print(f"[{i}/{len(raw_artists)}] ", end="", flush=True)
        try:
            results.append(build_artist_record(html_client, api, raw))
        except Exception as exc:
            print(f"✗ {raw['name']} → {exc}", file=sys.stderr)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # merge with the existing file by id
    existing = {}
    if OUT_PATH.exists():
        try:
            data = json.loads(OUT_PATH.read_text(encoding="utf-8"))
            existing = {a["id"]: a for a in data if isinstance(a, dict) and "id" in a}
        except Exception:
            pass

    for new in results:
        existing[new["id"]] = new

    final_list = list(existing.values())

    OUT_PATH.write_text(
        json.dumps(final_list, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


    print(f"\n✓ Wrote {OUT_PATH}")


if __name__ == "__main__":
    run()