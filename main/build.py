from __future__ import annotations

from datetime import datetime, timezone
from ossapi import Ossapi

from parser import HtmlClient
from api_beatmapset_search import fetch_all_ranked_for_artist


def build_artist_record(
    html_client: HtmlClient,
    api: Ossapi,
    raw_artist: dict,
) -> dict:
    artist_id   = raw_artist["id"]
    artist_name = raw_artist["name"]

    print(f"  → {artist_name} (id={artist_id})", flush=True)

    track_items, track_previews = html_client.get_artist_data(artist_id)
    ranked_data = fetch_all_ranked_for_artist(api, artist_id)
    tracks: list[dict] = []

    for track in track_items:
        title = track["title"]
        title_lower = title.lower()
        if title_lower in ranked_data:
            mode_to_ids = ranked_data[title_lower]
        elif " - " in title:
            mode_to_ids = ranked_data.get(title.split(" - ", 1)[1].lower(), {})
        else:
            mode_to_ids = {}
        ranked_modes = sorted(mode_to_ids.keys())

        tracks.append({
            "title": title,
            "preview": track_previews.get(title, ""),
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