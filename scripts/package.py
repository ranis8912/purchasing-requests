"""Build the App Service zip from backend/ (expects frontend already built into backend/static).

Why Python and not Compress-Archive: PowerShell writes backslash paths into zips, which breaks
App Service's Linux extraction ("failed to stat backend\\main.py"). This also forces LF line
endings on startup.sh (CRLF gives "startup.sh: not found", exit 127, site returns 503).
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
INCLUDE = ["app", "static", "sample_data", "requirements.txt", "startup.sh"]  # sample_data: lists for DEMO_MODE
SKIP_PARTS = {"__pycache__", ".pytest_cache"}


def main(out: Path) -> None:
    if not (BACKEND / "static" / "index.html").is_file():
        sys.exit("backend/static/index.html missing: run `npm run build` in frontend/ first")
    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            src = BACKEND / item
            files = [src] if src.is_file() else sorted(p for p in src.rglob("*") if p.is_file())
            for f in files:
                if SKIP_PARTS & set(f.parts):
                    continue
                arc = f.relative_to(BACKEND).as_posix()
                data = f.read_bytes()
                if f.suffix == ".sh":
                    data = data.replace(b"\r\n", b"\n")
                info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
                info.external_attr = (0o755 if f.suffix == ".sh" else 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
                count += 1
    print(f"Packaged {count} files into {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "purreq.zip")
