from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from ossapi import Ossapi
from tqdm import tqdm

from parser import HtmlClient
from config import ARTISTS_DIR, INDEX_PATH
from build import build_artist_record


load_dotenv()


def write_artist(artist: dict) -> None:
    ARTISTS_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTISTS_DIR / f"{artist['id']}.json"
    path.write_text(json.dumps(artist, ensure_ascii=False, indent=2), encoding="utf-8")


def write_index(artists: list[dict]) -> None:
    index = {
        "metadata": {
            "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "total_artists": len(artists),
            "total_songs": sum(len(a["tracks"]) for a in artists),
        },
        "artists": [
            {
                "id": a["id"],
                "name": a["name"],
                "song_count": len(a["tracks"]),
                "ranked_count": sum(1 for t in a["tracks"] if t.get("ranked_modes")),
                "updated_at": a["updated_at"],
            }
            for a in sorted(artists, key=lambda x: x["name"].lower())
        ],
    }
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def load_existing_artists() -> dict:
    if not ARTISTS_DIR.exists():
        return {}
    result = {}
    for path in ARTISTS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "id" in data:
                result[data["id"]] = data
        except Exception as e:
            print(f"Could not read {path}: {e}", file=sys.stderr)
    return result


def find_artist(raw_artists: list[dict], search: str) -> Optional[dict]:
    try:
        artist_id = int(search)
        for a in raw_artists:
            if a["id"] == artist_id:
                return a
    except ValueError:
        pass

    search_lower = search.lower().strip()
    candidates = [a for a in raw_artists if search_lower in a["name"].lower()]

    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    print(f"\nMultiple matches for '{search}':")
    for i, a in enumerate(candidates, 1):
        print(f"  {i}) {a['name']} (id={a['id']})")

    while True:
        try:
            choice = int(input("Choose number (0 to skip): "))
            if choice == 0:
                return None
            if 1 <= choice <= len(candidates):
                return candidates[choice - 1]
        except ValueError:
            pass
        print(f"Enter a number from 1 to {len(candidates)}")


def run() -> None:
    """
    python main.py                          — resume, skip existing
    python main.py --rebuild all            — rebuild all except BLACKLIST
    python main.py --rebuild "name" 123     — rebuild specific artists by name or id
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild", nargs="+", metavar="TARGET",
                        help="'all' or artist name(s)/id(s)")
    args = parser.parse_args()

    client_id     = os.environ.get("OSU_CLIENT_ID")
    client_secret = os.environ.get("OSU_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("Error: OSU_CLIENT_ID and OSU_CLIENT_SECRET required", file=sys.stderr)
        sys.exit(1)

    html_client = HtmlClient()
    api         = Ossapi(int(client_id), client_secret)

    print("Fetching Featured Artist list…", flush=True)
    raw_artists = html_client.get_featured_artists()
    print(f"Found {len(raw_artists)} Featured Artists.\n", flush=True)

    # ── --rebuild name/id mode ────────────────────────────────
    if args.rebuild and args.rebuild != ["all"]:
        existing = load_existing_artists()
        processed = 0

        for search in args.rebuild:
            raw = find_artist(raw_artists, search)
            if not raw:
                print(f"✗ Artist not found: {search!r}")
                continue

            print(f"→ Found: {raw['name']} (id={raw['id']})")
            try:
                artist = build_artist_record(html_client, api, raw)
                write_artist(artist)
                existing[artist["id"]] = artist
                processed += 1
                print(f"✓ Updated: {raw['name']}")
            except Exception as e:
                print(f"✗ {raw['name']} → {e}", file=sys.stderr)

        if processed > 0:
            write_index(list(existing.values()))
            print(f"\n✓ Updated {processed} artist(s) + {INDEX_PATH}")
        else:
            print("Nothing was updated.")
        return

    # ── full / resume mode ────────────────────────────────────
    rebuild_all = args.rebuild == ["all"]
    results: list[dict] = []

    for raw in tqdm(raw_artists, desc="Artists"):
        artist_path = ARTISTS_DIR / f"{raw['id']}.json"

        if not rebuild_all and artist_path.exists():
            results.append(json.loads(artist_path.read_text(encoding="utf-8")))
            continue

        try:
            artist = build_artist_record(html_client, api, raw)
            write_artist(artist)
            results.append(artist)
        except Exception as exc:
            tqdm.write(f"✗ {raw['name']} → {exc}", file=sys.stderr)

    write_index(results)
    print(f"\n✓ Wrote {len(results)} artist files + {INDEX_PATH}")


if __name__ == "__main__":
    run()