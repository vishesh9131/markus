#!/usr/bin/env python3
"""Regenerate explorer icons from mkc_fi_logo_transparent.png (crop + scale)."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "icons"

LOGO_CANDIDATES = (
    ROOT / "mkc_fi_logo_transparent1.png",
    ROOT / "mkc_fi_logo_transparent.png",
)


def _logo_source() -> Path:
    for p in LOGO_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError(f"No logo found. Expected one of: {LOGO_CANDIDATES}")


def letter_crop(img: Image.Image) -> Image.Image:
    a = np.array(img)[:, :, 3]
    ys, xs = np.where(a > 32)
    if len(xs) == 0:
        return img
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def thicken(im: Image.Image, radius: int = 5) -> Image.Image:
    r, g, b, al = im.split()
    al = al.filter(ImageFilter.MaxFilter(radius))
    return Image.merge("RGBA", (r, g, b, al))


def to_square(im: Image.Image, size: int, margin: float = 0.02) -> Image.Image:
    inner = max(1, int(size * (1 - 2 * margin)))
    w, h = im.size
    scale = min(inner / w, inner / h)
    nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(scaled, ((size - nw) // 2, (size - nh) // 2), scaled)
    return canvas


def recolor(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            _, _, _, al = px[x, y]
            if al > 32:
                px[x, y] = (*rgb, al)
    return out


def main() -> None:
    src = _logo_source()
    OUT.mkdir(parents=True, exist_ok=True)
    print("source:", src)
    base = thicken(letter_crop(Image.open(src).convert("RGBA")))
    for size, name in [(16, "mkc-icon-16.png"), (32, "mkc-icon.png"), (64, "mkc-icon@2x.png")]:
        to_square(base, size).save(OUT / name, optimize=True)
        print("wrote", OUT / name)
    light = recolor(base, (45, 40, 35))
    for size, name in [(32, "mkc-icon-light.png"), (64, "mkc-icon-light@2x.png")]:
        to_square(light, size).save(OUT / name, optimize=True)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
