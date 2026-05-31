#!/usr/bin/env python3
"""
slice-grid.py — режет grid-картинку (например, сетку 4x2 от ChatGPT image-gen)
на отдельные cells, опционально срезая чёрные header-полосы с подписями.

Usage:
  scripts/slice-grid.py <input.png> <output-dir> --cols 4 --rows 2 \
      --names openhand4,halfcrimp,fullcrimp,front3,back3,mono,pinch,sloper \
      [--strip-header] [--no-webp] [--no-png]

Зачем: ChatGPT/Midjourney генерят серии в виде одной картинки-сетки. Этот скрипт
автоматизирует разрезку: детектит чёрные полосы заголовков по строкам сетки и
вырезает только содержательную часть каждого cell'а.

Requirements: Pillow (pip3 install Pillow).
"""
import argparse
import os
import sys
from PIL import Image


def detect_header_height(im, cell_x0, cell_y0, cell_w, cell_h, dark_threshold=40):
    """Сканирует cell сверху вниз и возвращает y-координату конца чёрного header'а
    (относительно cell_y0). 0 если header'а нет."""
    for y in range(cell_y0, cell_y0 + min(cell_h // 2, 100)):
        row_samples = [im.getpixel((x, y)) for x in range(cell_x0 + 4, cell_x0 + cell_w - 4, 8)]
        avg = sum(sum(p[:3]) / 3 for p in row_samples) / len(row_samples)
        if avg > dark_threshold * 1.5:
            return y - cell_y0
    return 0


def slice_grid(input_path, output_dir, cols, rows, names, strip_header, save_webp, save_png, webp_quality):
    im = Image.open(input_path).convert('RGB')
    W, H = im.size
    cell_w = W // cols
    cell_h = H // rows

    if len(names) != cols * rows:
        sys.exit(f'ERROR: --names has {len(names)} entries but grid is {cols}×{rows}={cols*rows}')

    os.makedirs(output_dir, exist_ok=True)

    print(f'Input: {input_path} ({W}×{H}), grid {cols}×{rows}, cell {cell_w}×{cell_h}')

    for idx, name in enumerate(names):
        col = idx % cols
        row = idx // cols
        x0 = col * cell_w
        y0 = row * cell_h
        x1 = x0 + cell_w
        y1 = y0 + cell_h

        if strip_header:
            header_h = detect_header_height(im, x0, y0, cell_w, cell_h)
            if header_h > 0:
                y0 += header_h

        crop = im.crop((x0, y0, x1, y1))
        if save_png:
            crop.save(os.path.join(output_dir, f'{name}.png'), 'PNG')
        if save_webp:
            crop.save(os.path.join(output_dir, f'{name}.webp'), 'WEBP', quality=webp_quality)
        print(f'  {name}: {crop.size}  (y={y0}..{y1})')

    print(f'Done. Output: {output_dir}')


def main():
    ap = argparse.ArgumentParser(description='Slice a grid image into individual cells.')
    ap.add_argument('input', help='Path to grid image (PNG/JPG)')
    ap.add_argument('output_dir', help='Output directory')
    ap.add_argument('--cols', type=int, required=True)
    ap.add_argument('--rows', type=int, required=True)
    ap.add_argument('--names', required=True, help='Comma-separated cell names, row-major (left-to-right, top-to-bottom)')
    ap.add_argument('--strip-header', action='store_true', help='Detect and strip dark header strips from each cell')
    ap.add_argument('--no-webp', action='store_true')
    ap.add_argument('--no-png', action='store_true')
    ap.add_argument('--webp-quality', type=int, default=92)
    args = ap.parse_args()

    names = [n.strip() for n in args.names.split(',') if n.strip()]
    slice_grid(
        input_path=args.input,
        output_dir=args.output_dir,
        cols=args.cols,
        rows=args.rows,
        names=names,
        strip_header=args.strip_header,
        save_webp=not args.no_webp,
        save_png=not args.no_png,
        webp_quality=args.webp_quality,
    )


if __name__ == '__main__':
    main()
