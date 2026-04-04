#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import urlretrieve

from PIL import Image, ImageDraw, ImageFont, ImageOps

REPO_ROOT = Path('/home/ahmad/projects/sketchbot')
APRILTAG_ROOT = REPO_ROOT / 'assets' / 'apriltags'
PNG_DIR = APRILTAG_ROOT / 'png'
SVG_DIR = APRILTAG_ROOT / 'svg'
MANIFEST_PATH = APRILTAG_ROOT / 'manifest.json'
LAYOUT_PATH = APRILTAG_ROOT / 'layout.canvas.json'
README_PATH = APRILTAG_ROOT / 'README.md'
PRINT_PDF_PATH = APRILTAG_ROOT / 'apriltags-print-a4.pdf'
DEFAULT_EMAIL_TO = 'ahmad100307@gmail.com'

FAMILY = 'tag36h11'
DEFAULT_CANVAS_TAG_SIZE_MM = 150
DEFAULT_ROBOT_TAG_SIZE_MM = DEFAULT_CANVAS_TAG_SIZE_MM
DEFAULT_PRINT_DPI = 300
A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297
PAGE_MARGIN_MM = 10
TAG_PADDING_INCH = 1.0
LABEL_FONT_SIZE = 72
LABEL_LINE_SPACING = 10
LABEL_GAP_MM = 5
TAG_SOURCE_BASE = 'https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tag36h11'
TAG_TO_SVG_URL = 'https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tag_to_svg.py'

TAGS = [
    (0, 'canvas_top_left', DEFAULT_CANVAS_TAG_SIZE_MM),
    (1, 'canvas_top_right', DEFAULT_CANVAS_TAG_SIZE_MM),
    (2, 'canvas_bottom_right', DEFAULT_CANVAS_TAG_SIZE_MM),
    (3, 'canvas_bottom_left', DEFAULT_CANVAS_TAG_SIZE_MM),
    (4, 'robot_body', DEFAULT_ROBOT_TAG_SIZE_MM),
]


def ensure_dirs() -> None:
    APRILTAG_ROOT.mkdir(parents=True, exist_ok=True)
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    SVG_DIR.mkdir(parents=True, exist_ok=True)


def write_metadata(tags: list[tuple[int, str, int]]) -> None:
    manifest = {
        'family': FAMILY,
        'version': 1,
        'tags': [
            {
                'id': tag_id,
                'name': name,
                'role': 'canvas_corner' if tag_id < 4 else 'robot_marker',
                **({'cornerIndex': tag_id} if tag_id < 4 else {}),
                'physicalSizeMm': size_mm,
            }
            for tag_id, name, size_mm in tags
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')

    layout = {
        'coordinateFrame': 'canvas',
        'units': 'mm',
        'corners': {
            'canvas_top_left': {'tagId': 0, 'x': 0, 'y': 0, 'z': 0},
            'canvas_top_right': {'tagId': 1, 'x': None, 'y': 0, 'z': 0},
            'canvas_bottom_right': {'tagId': 2, 'x': None, 'y': None, 'z': 0},
            'canvas_bottom_left': {'tagId': 3, 'x': 0, 'y': None, 'z': 0},
        },
        'robot': {
            'tagId': 4,
            'frame': 'robot',
        },
    }
    LAYOUT_PATH.write_text(json.dumps(layout, indent=2) + '\n')

    README_PATH.write_text(
        '# SketchBot AprilTags\n\n'
        f'- Family: `{FAMILY}`\n'
        '- Reserved IDs: 0..4\n'
        '- Corner order: top-left, top-right, bottom-right, bottom-left\n'
        '- Robot marker: id 4\n'
        f'- Canvas tag size: {tags[0][2]} mm\n'
        f'- Robot tag size: {next(size_mm for tag_id, _name, size_mm in tags if tag_id == 4)} mm\n'
        f'- Print PNG DPI: {DEFAULT_PRINT_DPI}\n'
        '- Regeneration is deterministic as long as family + IDs stay unchanged.\n'
    )


def download_source_tag_png(tag_id: int, name: str) -> Path:
    src_name = f'tag36_11_{tag_id:05d}.png'
    dst = PNG_DIR / f'{FAMILY}_id_{tag_id}_{name}.source.png'
    url = f'{TAG_SOURCE_BASE}/{src_name}'
    urlretrieve(url, dst)
    return dst


def render_print_png(source_png_path: Path, tag_id: int, name: str, size_mm: int, dpi: int) -> Path:
    output_path = PNG_DIR / f'{FAMILY}_id_{tag_id}_{name}.png'
    pixels = max(1, int(round((size_mm / 25.4) * dpi)))
    subprocess.run([
        'python3',
        '-c',
        (
            'from PIL import Image; '
            f"img=Image.open(r\'{source_png_path}\').convert(\'1\'); "
            f"img=img.resize(({pixels}, {pixels}), Image.NEAREST); "
            f"img.save(r\'{output_path}\', dpi=({dpi}, {dpi}))"
        ),
    ], check=True)
    return output_path


def generate_svg(png_path: Path, tag_id: int, name: str, size_mm: int) -> Path:
    svg_path = SVG_DIR / f'{FAMILY}_id_{tag_id}_{name}.svg'
    with tempfile.TemporaryDirectory() as td:
        script_path = Path(td) / 'tag_to_svg.py'
        urlretrieve(TAG_TO_SVG_URL, script_path)
        subprocess.run(
            [sys.executable, str(script_path), str(png_path), str(svg_path), f'--size={size_mm}mm'],
            check=True,
        )
    return svg_path


def package_files() -> list[Path]:
    files: list[Path] = [MANIFEST_PATH, LAYOUT_PATH, README_PATH]
    if PRINT_PDF_PATH.exists():
        files.append(PRINT_PDF_PATH)
    files.extend(sorted(PNG_DIR.glob('*.png')))
    files.extend(sorted(SVG_DIR.glob('*.svg')))
    return files


def mm_to_px(mm: float, dpi: int) -> int:
    return max(1, int(round((mm / 25.4) * dpi)))


def build_print_pdf(tags: list[tuple[int, str, int]], dpi: int) -> Path:
    page_width_px = mm_to_px(A4_WIDTH_MM, dpi)
    page_height_px = mm_to_px(A4_HEIGHT_MM, dpi)
    page_margin_px = mm_to_px(PAGE_MARGIN_MM, dpi)
    padding_px = mm_to_px(TAG_PADDING_INCH * 25.4, dpi)
    label_gap_px = mm_to_px(LABEL_GAP_MM, dpi)

    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', LABEL_FONT_SIZE)
    except Exception:
        font = ImageFont.load_default()

    pretty_names = {
        'canvas_top_left': 'Top Left',
        'canvas_top_right': 'Top Right',
        'canvas_bottom_right': 'Bottom Right',
        'canvas_bottom_left': 'Bottom Left',
        'robot_body': 'Robot',
    }

    pages: list[Image.Image] = []
    canvas_tags = [(tag_id, name, size_mm) for tag_id, name, size_mm in tags if tag_id in {0, 1, 2, 3}]
    robot_tags = [(tag_id, name, size_mm) for tag_id, name, size_mm in tags if tag_id == 4]

    if canvas_tags:
        page = Image.new('RGB', (page_width_px, page_height_px), 'white')
        draw = ImageDraw.Draw(page)
        available_width = page_width_px - (page_margin_px * 2)
        available_height = page_height_px - (page_margin_px * 2)
        cell_width = available_width // 2
        cell_height = available_height // 2

        for index, (tag_id, name, size_mm) in enumerate(canvas_tags):
            row = index // 2
            col = index % 2
            cell_x = page_margin_px + col * cell_width
            cell_y = page_margin_px + row * cell_height

            tag_img = Image.open(PNG_DIR / f'{FAMILY}_id_{tag_id}_{name}.png').convert('L')
            tag_rgb = ImageOps.colorize(tag_img, black='black', white='white').convert('RGB')
            label_lines = [f'Tag {tag_id}', pretty_names.get(name, name), f'{size_mm} mm']
            line_boxes = [draw.textbbox((0, 0), line, font=font) for line in label_lines]
            line_heights = [box[3] - box[1] for box in line_boxes]
            total_label_height = sum(line_heights) + LABEL_LINE_SPACING * (len(label_lines) - 1)
            content_height = padding_px + tag_img.height + label_gap_px + total_label_height + padding_px

            x = cell_x + (cell_width - tag_img.width) // 2
            y = cell_y + max(0, (cell_height - content_height) // 2) + padding_px
            page.paste(tag_rgb, (x, y))

            current_label_y = y + tag_img.height + label_gap_px
            for line, box, line_height in zip(label_lines, line_boxes, line_heights, strict=False):
                line_width = box[2] - box[0]
                line_x = cell_x + (cell_width - line_width) // 2
                draw.text((line_x, current_label_y), line, fill='black', font=font)
                current_label_y += line_height + LABEL_LINE_SPACING

        pages.append(page)

    if robot_tags:
        page = Image.new('RGB', (page_width_px, page_height_px), 'white')
        draw = ImageDraw.Draw(page)
        tag_id, name, size_mm = robot_tags[0]
        tag_img = Image.open(PNG_DIR / f'{FAMILY}_id_{tag_id}_{name}.png').convert('L')
        tag_rgb = ImageOps.colorize(tag_img, black='black', white='white').convert('RGB')
        label_lines = [f'Tag {tag_id}', pretty_names.get(name, name), f'{size_mm} mm']
        line_boxes = [draw.textbbox((0, 0), line, font=font) for line in label_lines]
        line_heights = [box[3] - box[1] for box in line_boxes]
        total_label_height = sum(line_heights) + LABEL_LINE_SPACING * (len(label_lines) - 1)
        total_height = padding_px + tag_img.height + label_gap_px + total_label_height + padding_px
        x = (page_width_px - tag_img.width) // 2
        y = max(page_margin_px, (page_height_px - total_height) // 2) + padding_px
        page.paste(tag_rgb, (x, y))

        current_label_y = y + tag_img.height + label_gap_px
        for line, box, line_height in zip(label_lines, line_boxes, line_heights, strict=False):
            line_width = box[2] - box[0]
            line_x = (page_width_px - line_width) // 2
            draw.text((line_x, current_label_y), line, fill='black', font=font)
            current_label_y += line_height + LABEL_LINE_SPACING

        pages.append(page)

    if not pages:
        raise RuntimeError('No pages generated for AprilTag print PDF')

    first_page, *rest_pages = pages
    first_page.save(PRINT_PDF_PATH, 'PDF', resolution=dpi, save_all=True, append_images=rest_pages)
    return PRINT_PDF_PATH


def send_email(to_email: str) -> None:
    command = [
        'gog',
        'gmail',
        'send',
        '--to', to_email,
        '--subject', 'SketchBot AprilTags',
        '--body', 'Attached are the current SketchBot AprilTag PNG and SVG assets.',
    ]

    for path in package_files():
        command.extend(['--attach', str(path)])

    subprocess.run(command, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='Generate and store the 5 reserved SketchBot AprilTags.')
    parser.add_argument('--canvas-size-mm', type=int, default=DEFAULT_CANVAS_TAG_SIZE_MM)
    parser.add_argument('--robot-size-mm', type=int, default=DEFAULT_ROBOT_TAG_SIZE_MM)
    parser.add_argument('--dpi', type=int, default=DEFAULT_PRINT_DPI)
    parser.add_argument('--email', type=str, default=os.environ.get('APRILTAG_EMAIL_TO', DEFAULT_EMAIL_TO), help='Email address to send generated assets to.')
    args = parser.parse_args()

    tags = [
        (0, 'canvas_top_left', args.canvas_size_mm),
        (1, 'canvas_top_right', args.canvas_size_mm),
        (2, 'canvas_bottom_right', args.canvas_size_mm),
        (3, 'canvas_bottom_left', args.canvas_size_mm),
        (4, 'robot_body', args.robot_size_mm),
    ]

    ensure_dirs()
    write_metadata(tags)

    generated = []
    for tag_id, name, size_mm in tags:
        source_png_path = download_source_tag_png(tag_id, name)
        png_path = render_print_png(source_png_path, tag_id, name, size_mm, args.dpi)
        svg_path = generate_svg(source_png_path, tag_id, name, size_mm)
        generated.append((png_path, svg_path))
        print(f'Generated {png_path.name} and {svg_path.name}')

    pdf_path = build_print_pdf(tags, args.dpi)
    print(f'Generated {pdf_path.name}')

    if args.email:
        send_email(args.email)
        print(f'Emailed assets to {args.email} via gog')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
