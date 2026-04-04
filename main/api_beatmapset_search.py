from __future__ import annotations

import sys
import time

from ossapi import Ossapi
from ossapi.enums import BeatmapsetSearchCategory

from config import SEARCH_DELAY


def fetch_all_ranked_for_artist(
    api: Ossapi,
    artist_id: int,
) -> dict[str, dict[str, list[int]]]:
    result_map: dict[str, dict[str, list[int]]] = {}
    cursor = None

    while True:
        try:
            result = api.search_beatmapsets(
                query=f"featured_artist={artist_id}",
                category=BeatmapsetSearchCategory.RANKED,
                cursor=cursor,
            )
        except Exception as e:
            print(f"  Search failed for artist_id={artist_id}: {e}", file=sys.stderr)
            break

        for bms in result.beatmapsets:
            key = bms.title.lower()
            modes = result_map.setdefault(key, {})
            if hasattr(bms, "beatmaps") and bms.beatmaps:
                for bm in bms.beatmaps:
                    modes.setdefault(bm.mode.value.lower(), []).append(bms.id)
            elif hasattr(bms, "mode") and bms.mode:
                modes.setdefault(bms.mode.value.lower(), []).append(bms.id)

        time.sleep(SEARCH_DELAY)
        cursor = result.cursor
        if cursor is None:
            break

    return {
        key: {m: sorted(set(mids)) for m, mids in modes.items()}
        for key, modes in result_map.items()
    }