from pathlib import Path

SEARCH_DELAY  = 0.15
SCRAPE_DELAY  = 1.0
DATA_DIR     = Path(__file__).parent.parent / "data"
ARTISTS_DIR  = DATA_DIR / "artists"
INDEX_PATH   = DATA_DIR / "index.json"
BASE_URL     = "https://osu.ppy.sh"


VERSION_MARKERS = [ # ignore markers, parenthesis excluded
    # only unofficial markers since official edits should be treated as separate songs
    "cut ver.",
    "sped up ver.",
    "sped up & cut ver.",
    "nightcore ver.",
    "nightcore & cut ver.",
]