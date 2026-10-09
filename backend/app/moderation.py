import re
import unicodedata

# Keep this list short and extend it for your campus. Matching is whole-word, case-insensitive.
BLOCKLIST = {
    "fuck", "fucking", "fucker", "shit", "bitch", "bastard", "asshole", "dick", "cunt", "slut",
    "whore", "retard", "chutiya", "chutiye", "madarchod", "behenchod", "bhenchod", "bhosdike",
    "bsdk", "gandu", "randi", "harami", "lund", "lodu", "mc", "bc", "mkc", "bkl",
}
_word = re.compile(r"[A-Za-z]+")
_email = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_phone = re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}")
_ctrl = re.compile(r"[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e]")


def clean(text: str, anonymous: bool = False) -> tuple[str, bool]:
    """Returns (cleaned_text, was_flagged). Masks slurs; in anon chat also masks emails/phones (anti-doxxing)."""
    text = unicodedata.normalize("NFKC", text)
    text = _ctrl.sub("", text).strip()
    flagged = False

    def mask(m: re.Match) -> str:
        nonlocal flagged
        w = m.group(0)
        if w.lower() in BLOCKLIST:
            flagged = True
            return w[0] + "*" * (len(w) - 1)
        return w

    text = _word.sub(mask, text)
    if anonymous:
        text, n1 = _email.subn("[email hidden]", text)
        text, n2 = _phone.subn("[number hidden]", text)
        flagged = flagged or bool(n1 or n2)
    return text, flagged
