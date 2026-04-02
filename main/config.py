from pathlib import Path

SEARCH_DELAY = 0.15
DATA_DIR     = Path(__file__).parent.parent / "data"
ARTISTS_DIR  = DATA_DIR / "artists"
INDEX_PATH   = DATA_DIR / "index.json"
BASE_URL     = "https://osu.ppy.sh"

ARTIST_SEARCH_ALIASES = { # used for artists with compound names on the fa listing such as "Loki / Thaehan"
    # id: ["name1", "name2"]
    187: ["3R2", "DJ Mashiro"],
    24: ["antiPLUR", "Internet Death Machine"],
    295: ["DJ Genki", "Gram"],
    522: ["gmtn.", "witch's slave"],
    33: ["HyuN", "INFX"],
    56: ["Klayton", "Celldweller"],
    116: ["Lime", "Kankitsu"],
    201: ["litmus*", "Ester"],
    7: ["Loki", "Thaehan"],
    120: ["MuryokuP", "Powerless"],
    118: ["orangentle", "Yu_Asahina"],
    14: ["Rin", "Function Phantom"],
    148: ["NEWRYUJIN", "GYZE"],
    169: ["Sewerslvt", "Cynthoni"],
    66: ["Station Earth", "Blue Marble"],
    8: ["Sylvir", "sakuraburst"],
    132: ["Yuyoyuppe", "DJ'TEKINA//SOMETHING"],
}

VERSION_MARKERS = [ # ignore markers, parenthesis excluded
    # only unofficial markers since official edits should be treated as separate songs
    "cut ver.",
    "sped up ver.",
    "sped up & cut ver.",
    "nightcore ver",
    "nightcore & cut ver",
]