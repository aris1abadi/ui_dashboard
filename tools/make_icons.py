#!/usr/bin/env python3
"""Buat set ikon PWA/favicon ui_dashboard dari logo sumber.

Sumber: karjoAgroGHUIapp.png (983x983, palet 16 warna, latar putih).
Hasil  : berkas PNG/ICO di folder ui_dashboard/ (root), siap disalin vite ke dist/.

Jalankan:  python3 tools/make_icons.py
Butuh Pillow:  python3 -m venv /tmp/imgenv && /tmp/imgenv/bin/pip install pillow
               /tmp/imgenv/bin/python tools/make_icons.py

Catatan desain
  * Ikon "any"        : logo dibesarkan sampai 88% sisi kanvas (margin 6%).
  * Ikon "maskable"   : logo hanya 70% sisi kanvas — Android memotongnya jadi
                        lingkaran/squircle, jadi konten WAJIB di dalam safe zone 80%.
  * Latar putih (bukan transparan): logo memang berlatar putih; ikon transparan
    akan terlihat "berlubang" di tema gelap.
  * Kuantisasi palet 64 warna tanpa dither: logo ini memang grafis datar, jadi
    ukuran berkas jauh lebih kecil tanpa artefak yang terlihat.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "karjoAgroGHUIapp.png"
WHITE = (253, 254, 253)
PALETTE_COLORS = 64


def content_crop(im: Image.Image, threshold: int = 24, margin_px: int = 8) -> Image.Image:
    """Potong tepi latar putih, sisakan sedikit margin."""
    rgba = im.convert("RGBA")
    bg = rgba.getpixel((0, 0))[:3]
    w, h = rgba.size
    px = rgba.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > threshold:
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
    if max_x < 0:                      # tidak ada konten → pakai gambar apa adanya
        return im.convert("RGB")
    box = (max(0, min_x - margin_px), max(0, min_y - margin_px),
           min(w, max_x + 1 + margin_px), min(h, max_y + 1 + margin_px))
    return im.convert("RGB").crop(box)


def fit_square(src: Image.Image, size: int, content_ratio: float) -> Image.Image:
    """Tempatkan potongan logo di tengah kanvas persegi berlatar putih."""
    canvas = Image.new("RGB", (size, size), WHITE)
    w, h = src.size
    scale = (size * content_ratio) / max(w, h)
    new = (max(1, round(w * scale)), max(1, round(h * scale)))
    resized = src.resize(new, Image.LANCZOS)
    canvas.paste(resized, ((size - new[0]) // 2, (size - new[1]) // 2))
    return canvas


def save_png(im: Image.Image, path: Path) -> None:
    im.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT,
                dither=Image.Dither.NONE).save(path, optimize=True)


def save_svg_vector(crop: Image.Image, path: Path) -> None:
    """Lacak logo jadi SVG VEKTOR (butuh modul `vtracer`, opsional).

    Logo ini RASTER, jadi satu-satunya cara "menjadi SVG" adalah melacaknya.
    Hasilnya setia pada logo, TAPI berkasnya LEBIH BESAR daripada PNG
    (± 79 KB vs ± 34 KB untuk 512 px, ± 20 KB setelah gzip) — jadi SVG di sini
    berguna untuk tampilan bebas-skala (favicon/ikon), bukan untuk menghemat
    kuota. Kalau `vtracer` tidak terpasang, tahap ini dilewati dan icon.svg
    yang lama dibiarkan apa adanya.
    """
    try:
        import vtracer
    except ImportError:
        print("  icon.svg  : dilewati (pasang `vtracer` untuk melacak ulang)")
        return

    kanvas = fit_square(crop, 512, 0.88)      # kanvas SAMA dengan icon-512.png
    sumber = path.parent / "icon-trace.png"
    kanvas.save(sumber)
    vtracer.convert_image_to_svg_py(
        str(sumber), str(path),
        colormode="color", hierarchical="stacked", mode="spline",
        filter_speckle=12, color_precision=6, layer_difference=24,
        corner_threshold=60, length_threshold=4.0,
        max_iterations=10, splice_threshold=45, path_precision=3,
    )
    sumber.unlink()

    # Beri keterangan asal-usul supaya berkas hasil lacakan tidak disalahpahami
    # sebagai vektor tangan yang bisa diedit rapi.
    isi = path.read_text(encoding="utf-8")
    kepala = ('<?xml version="1.0" encoding="UTF-8"?>')
    if isi.startswith(kepala):
        isi = isi.replace(
            kepala,
            kepala + '\n<!-- KarjoAgro — hasil LACAK VEKTOR (tools/make_icons.py) '
                     'dari karjoAgroGHUIapp.png. Berkas ini otomatis; jangan '
                     'diedit manual. -->',
            1,
        )
        path.write_text(isi, encoding="utf-8")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Logo sumber tidak ditemukan: {SRC}")

    logo = Image.open(SRC)
    crop = content_crop(logo)
    print(f"sumber   : {SRC.name} {logo.size} {logo.mode}")
    print(f"potongan : {crop.size}")

    # Ikon "any" — 512/192 wajib untuk PWA, 180 untuk apple-touch-icon.
    any_sizes = {512: "icon-512.png", 192: "icon-192.png", 180: "apple-touch-icon.png"}
    for size, name in any_sizes.items():
        save_png(fit_square(crop, size, 0.88), ROOT / name)

    # Ikon "maskable" — konten lebih kecil supaya tidak terpotong safe zone.
    save_png(fit_square(crop, 512, 0.70), ROOT / "icon-maskable-512.png")

    # Favicon raster (fallback browser lama) + ICO multi-ukuran.
    save_png(fit_square(crop, 32, 0.94), ROOT / "favicon-32.png")
    save_png(fit_square(crop, 16, 0.96), ROOT / "favicon-16.png")
    ico = fit_square(crop, 48, 0.94)
    ico.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Ikon SVG (vektor) untuk browser yang mendukung <link rel="icon" type="image/svg+xml">.
    save_svg_vector(crop, ROOT / "icon.svg")

    for name in [*any_sizes.values(), "icon-maskable-512.png",
                 "favicon-32.png", "favicon-16.png", "favicon.ico", "icon.svg"]:
        f = ROOT / name
        print(f"  {name:<26} {f.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
