"""Audit the Git index for runtime data, private files and likely credentials."""

from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = (
    "data/",
    "upstream/",
    "archive/",
    ".dev-deps/",
    "node_modules/",
    "reader/data/",
    "reader/snapshots/",
    "reader/assets/figures/",
    "docs/screenshots/",
)
SECRETS = re.compile(
    r"AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
)


def main():
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8").split("\0")
    files = [name for name in names if name]
    failures = []
    total = 0
    for name in files:
        path = ROOT / name
        if (
            name.startswith(FORBIDDEN)
            or name.endswith(".local.json")
            or name in ("reader/assets/figure-index.json", "release-latest.json")
            or Path(name).name.startswith(".env")
        ):
            failures.append(name + " (private or generated file)")
        payload = subprocess.check_output(["git", "show", ":" + name], cwd=ROOT)
        total += len(payload)
        if path.suffix not in (".ttf", ".png", ".jpg"):
            text = payload.decode("utf-8-sig", errors="replace")
            if SECRETS.search(text):
                failures.append(name + " (possible credential)")
    source = json.loads((ROOT / "reader/assets/fonts/source.json").read_text(encoding="utf-8"))
    font = ROOT / "reader/assets/fonts/LXGWWenKaiLite-Regular.ttf"
    if hashlib.sha256(font.read_bytes()).hexdigest() != source["sha256"]:
        failures.append("Font SHA-256 mismatch")
    if failures:
        raise SystemExit("Release audit failed:\n" + "\n".join(failures))
    print(
        json.dumps(
            {
                "trackedFiles": len(files),
                "sourceBytes": total,
                "fontVerified": True,
                "audit": "passed",
            }
        )
    )


if __name__ == "__main__":
    main()
