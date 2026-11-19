"""Build the App Service zip from backend/ (expects frontend already built into backend/static).

Python packages are installed here, as Linux (manylinux, CPython 3.12) wheels, into packages/ inside
the zip. Installing at boot into a venv on /home (an SMB share) took longer than App Service's
230-second startup limit, and the private network may not reach PyPI anyway.

Why Python and not Compress-Archive: PowerShell writes backslash paths into zips, which breaks
App Service's Linux extraction ("failed to stat backend\\main.py"). This also forces LF line
endings on startup.sh (CRLF gives "startup.sh: not found", exit 127, site returns 503).
"""
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
INCLUDE = ["app", "static", "sample_data", "requirements.txt", "startup.sh"]  # sample_data: lists for DEMO_MODE
SKIP_PARTS = {"__pycache__", ".pytest_cache"}
PLATFORMS = ["manylinux2014_x86_64", "manylinux_2_17_x86_64", "manylinux_2_28_x86_64", "manylinux_2_34_x86_64"]


def install_linux_packages(target: Path) -> None:
    cmd = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
           "-r", str(BACKEND / "requirements.txt"), "--target", str(target),
           "--python-version", "3.12", "--implementation", "cp", "--only-binary=:all:"]
    for p in PLATFORMS:
        cmd += ["--platform", p]
    subprocess.run(cmd, check=True)


def main(out: Path) -> None:
    if not (BACKEND / "static" / "index.html").is_file():
        sys.exit("backend/static/index.html missing: run `npm run build` in frontend/ first")
    count = 0
    tmp = tempfile.TemporaryDirectory()
    pkgs = Path(tmp.name) / "packages"
    print("Installing Linux Python packages...")
    install_linux_packages(pkgs)
    sources = [(BACKEND / item, BACKEND) for item in INCLUDE] + [(pkgs, Path(tmp.name))]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for src, base in sources:
            files = [src] if src.is_file() else sorted(p for p in src.rglob("*") if p.is_file())
            for f in files:
                if SKIP_PARTS & set(f.parts):
                    continue
                arc = f.relative_to(base).as_posix()
                data = f.read_bytes()
                if f.suffix == ".sh":
                    data = data.replace(b"\r\n", b"\n")
                info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
                info.external_attr = (0o755 if f.suffix == ".sh" else 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
                count += 1
    tmp.cleanup()
    print(f"Packaged {count} files into {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "purreq.zip")
