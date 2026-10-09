"""Hostels come from the node names in the campus GLB. B24, B25 and B26 (the block marked B-28 on
the campus map) are intentionally left out, as are academic blocks, messes and faculty quarters.
Rename or drop entries here; the frontend reads this list from /api/hostels."""

HOSTEL_CODES = ["B8", "B9", "B10", "B11", "B12", "B13", "B14", "B15", "B16", "B17",
                "B18", "B19", "B20", "B21", "B22", "B23"]

# Optional friendly names, e.g. {"B10": "B10 · Gauri Kund"}
DISPLAY_NAMES: dict[str, str] = {}

HOSTELS = {c.lower(): {"slug": c.lower(), "code": c, "name": DISPLAY_NAMES.get(c, f"{c} Hostel")}
           for c in HOSTEL_CODES}


def hostel_name(slug: str) -> str:
    return HOSTELS.get(slug, {}).get("name", slug.upper())
