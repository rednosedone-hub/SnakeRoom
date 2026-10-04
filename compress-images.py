# compress-images.py
# Creates web-sized copies of every photo in Images/ while moving the
# originals into ImagesOriginals/ (same subfolder structure, nothing deleted).
#
# Result: Images/ keeps the exact same relative paths the app references,
# but each file is small enough for GitHub hosting.
#
# Run:  python compress-images.py

import os
import shutil

from PIL import Image, ImageOps

SOURCE_DIR = "Images"
ORIGINALS_DIR = "ImagesOriginals"
MAX_DIMENSION = 1400          # longest edge, plenty for cards and phones
JPEG_QUALITY = 82
ORIGINAL_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")

moved_count = 0
compressed_count = 0
failed = []


def process_file(source_path, relative_path):
    global moved_count, compressed_count

    original_path = os.path.join(ORIGINALS_DIR, relative_path)
    os.makedirs(os.path.dirname(original_path), exist_ok=True)
    shutil.move(source_path, original_path)
    moved_count += 1

    lower_name = relative_path.lower()

    if not lower_name.endswith((".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")):
        # Non-image file (e.g. desktop.ini): keep a copy in Images so
        # nothing the app might reference disappears.
        shutil.copy2(original_path, source_path)
        return

    try:
        with Image.open(original_path) as image:
            image = ImageOps.exif_transpose(image)

            if image.width > MAX_DIMENSION or image.height > MAX_DIMENSION:
                image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

            if lower_name.endswith(".png") and ("A" in image.getbands()):
                image.save(source_path, "PNG", optimize=True)
            else:
                image.convert("RGB").save(
                    source_path,
                    "JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True
                )

            compressed_count += 1
    except Exception as error:  # noqa: BLE001 - report and keep going
        failed.append((relative_path, str(error)))
        # Put the original back so no image is ever lost.
        shutil.copy2(original_path, source_path)


def main():
    for root, _dirs, files in os.walk(SOURCE_DIR):
        for file_name in files:
            source_path = os.path.join(root, file_name)
            relative_path = os.path.relpath(source_path, SOURCE_DIR)

            if relative_path.lower().endswith(ORIGINAL_EXTENSIONS):
                process_file(source_path, relative_path)

    total_size = 0
    for root, _dirs, files in os.walk(SOURCE_DIR):
        for file_name in files:
            total_size += os.path.getsize(os.path.join(root, file_name))

    print(f"Originals moved to {ORIGINALS_DIR}/: {moved_count}")
    print(f"Web images written to {SOURCE_DIR}/: {compressed_count}")
    print(f"New {SOURCE_DIR} size: {total_size / (1024 * 1024):.1f} MB")

    if failed:
        print("\nSome files could not be compressed (originals kept):")
        for name, error in failed:
            print(f"  {name}: {error}")


if __name__ == "__main__":
    main()
