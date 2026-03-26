from __future__ import annotations

import sys
from typing import Dict, List, Tuple

from ossapi import Ossapi
from ossapi.enums import BeatmapsetSearchCategory  # RANKED = only ranked maps

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
        if title.lower() == bms.title.lower():
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