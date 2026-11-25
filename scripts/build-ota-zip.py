from pathlib import Path
import zipfile
import sys
import re

if len(sys.argv) != 2:
    raise SystemExit(
        "Usage: build-ota-zip.py VERSION"
    )

version = sys.argv[1]

if not re.fullmatch(
    r"[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}",
    version
):
    raise SystemExit("Invalid bundle version")

root = Path("dist-android")

if not root.is_dir():
    raise SystemExit("Android frontend build missing")

if not (root / "index.html").is_file():
    raise SystemExit("Root index.html missing")

output = (
    Path.home()
    / "Documents"
    / "JapanFlow-OTA-Builds"
    / version
)

output.mkdir(
    parents=True,
    exist_ok=True
)

target = output / "frontend.zip"

if target.exists():
    raise SystemExit("Bundle already exists")

files = sorted(root.rglob("*"))

try:
    with zipfile.ZipFile(
        target,
        "x",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6
    ) as archive:

        for file in files:
            if file.is_symlink():
                raise RuntimeError(
                    "Symbolic link detected"
                )

            if not file.is_file():
                continue

            relative = file.relative_to(root)

            archive.write(
                file,
                relative.as_posix()
            )

except Exception:
    target.unlink(missing_ok=True)
    raise

print("OTA ZIP CREATED")
print(target)
