"""
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

import time
from datetime import datetime, timezone
from ossapi import Ossapi

from parser import HtmlClient
from config import SEARCH_DELAY, ARTIST_SEARCH_ALIASES
from api_beatmapset_search import find_ranked_beatmapsets


def build_artist_record(
    html_client: HtmlClient,
    api: Ossapi,
    raw_artist: dict,
) -> dict:
    artist_id   = raw_artist["id"]
    artist_name = raw_artist["name"]

    print(f"  → {artist_name} (id={artist_id})", flush=True)

    search_names = ARTIST_SEARCH_ALIASES.get(artist_id, [artist_name])
    track_titles = html_client.get_artist_tracks(artist_id)
    tracks: list[dict] = []

    for title in track_titles:
        all_ids: list[int] = []
        mode_to_ids: dict[str, list[int]] = {}

        for name in search_names:
            search_title = title
            prefix = f"{name} - "
            if search_title.lower().startswith(prefix.lower()):
                search_title = search_title[len(prefix):]
            ids, modes = find_ranked_beatmapsets(api, name, search_title)
            all_ids.extend(ids)
            for mode, beatmapset_ids in modes.items():
                mode_to_ids.setdefault(mode, []).extend(beatmapset_ids)
            time.sleep(SEARCH_DELAY)

        # deduplicate
        all_ids = sorted(set(all_ids))
        for mode in mode_to_ids:
            mode_to_ids[mode] = sorted(set(mode_to_ids[mode]))

        ranked_modes = sorted(mode_to_ids.keys())

        tracks.append({
            "title": title,
            "ranked_modes": ranked_modes,
            "beatmapset_ids_by_mode": mode_to_ids,
        })

    # sorted by ranked then title
    tracks.sort(key=lambda t: (0 if t["ranked_modes"] else 1, t["title"].lower()))

    return {
        "id": artist_id,
        "name": artist_name,
        "tracks": tracks,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }