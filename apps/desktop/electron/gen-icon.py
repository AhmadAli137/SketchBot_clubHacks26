"""
Generates apps/desktop/electron/icon.ico — Spark's face logo.
Run via build-prod.sh before electron-builder.
Requires Pillow (already in the local-runtime venv).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).parent / 'icon.ico'


def lerp(a, b, t):
    return int(a + (b - a) * t)


def lerp_color(c1, c2, t):
    return tuple(lerp(a, b, t) for a, b in zip(c1, c2))


def create_frame(size: int) -> Image.Image:
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ── Rounded square background ───────────────────────────────────────────
    radius = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius,
                        fill=(5, 10, 28, 255))

    # ── Head — light blue ellipse with radial gradient ──────────────────────
    cx, cy = s / 2, s * 0.46
    hw = s * 0.36   # half-width
    hh = s * 0.40   # half-height (slightly taller than wide)
    # Fake radial gradient: draw concentric ellipses outer→inner
    steps = int(min(hw, hh))
    for i in range(steps, 0, -1):
        t = i / steps
        # outer (#b0c8f0) → inner (#ffffff)
        r = lerp(176, 255, 1 - t)
        g = lerp(200, 255, 1 - t)
        b = lerp(240, 255, 1 - t)
        rx = hw * (i / steps)
        ry = hh * (i / steps)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(r, g, b, 255))
    # thin border
    d.ellipse([cx - hw, cy - hh, cx + hw, cy + hh],
              outline=(144, 184, 232, 200), width=max(1, round(s * 0.015)))

    # ── Ear pads (small rects on each side) ────────────────────────────────
    ep_w  = max(2, round(s * 0.045))
    ep_h  = max(3, round(s * 0.13))
    ep_y  = cy - ep_h / 2
    ep_rx = max(1, round(ep_w * 0.5))
    # left
    d.rounded_rectangle([cx - hw - ep_w * 0.6, ep_y,
                          cx - hw + ep_w * 0.4, ep_y + ep_h],
                         radius=ep_rx, fill=(220, 234, 255, 255),
                         outline=(144, 184, 232, 160))
    # right
    d.rounded_rectangle([cx + hw - ep_w * 0.4, ep_y,
                          cx + hw + ep_w * 0.6, ep_y + ep_h],
                         radius=ep_rx, fill=(220, 234, 255, 255),
                         outline=(144, 184, 232, 160))

    # ── Visor / face plate (dark band) ─────────────────────────────────────
    vx = cx - hw * 0.78
    vy = cy - hh * 0.12
    vw = hw * 1.56
    vh = hh * 0.50
    vr = max(2, round(s * 0.052))
    d.rounded_rectangle([vx, vy, vx + vw, vy + vh],
                         radius=vr, fill=(8, 18, 38, 255))
    # subtle sheen inside visor top
    d.rounded_rectangle([vx + 1, vy + 1, vx + vw - 1, vy + vh * 0.28],
                         radius=vr, fill=(255, 255, 255, 12))

    # ── Eyes — glowing cyan circles ────────────────────────────────────────
    er = max(2, round(s * 0.08))
    eye_y = vy + vh * 0.52
    for ex in (cx - hw * 0.36, cx + hw * 0.36):
        # outer glow halo
        halo = max(3, er + round(s * 0.04))
        d.ellipse([ex - halo, eye_y - halo, ex + halo, eye_y + halo],
                  fill=(93, 228, 255, 55))
        # eye fill
        d.ellipse([ex - er, eye_y - er, ex + er, eye_y + er],
                  fill=(93, 228, 255, 255))
        # iris (slightly darker center)
        ir = max(1, round(er * 0.55))
        d.ellipse([ex - ir, eye_y - ir, ex + ir, eye_y + ir],
                  fill=(20, 80, 180, 255))
        # specular highlight
        hw2 = max(1, round(er * 0.32))
        ox, oy = ex - er * 0.32, eye_y - er * 0.35
        d.ellipse([ox - hw2, oy - hw2, ox + hw2, oy + hw2],
                  fill=(255, 255, 255, 220))

    # ── Smile (subtle arc on chin area) ────────────────────────────────────
    sm_cx = cx
    sm_cy = cy + hh * 0.52
    sm_w  = hw * 0.45
    sm_h  = hh * 0.14
    sm_lw = max(1, round(s * 0.025))
    smile_box = [sm_cx - sm_w, sm_cy - sm_h,
                 sm_cx + sm_w, sm_cy + sm_h]
    d.arc(smile_box, start=14, end=166,
          fill=(8, 18, 38, 160), width=sm_lw)

    # ── Antenna nub on top ─────────────────────────────────────────────────
    ant_x  = cx
    ant_y0 = cy - hh
    ant_y1 = ant_y0 - s * 0.09
    ant_w  = max(1, round(s * 0.025))
    d.line([ant_x, ant_y0, ant_x, ant_y1],
           fill=(144, 184, 232, 200), width=ant_w)
    # tip ball
    tb = max(2, round(s * 0.055))
    d.ellipse([ant_x - tb, ant_y1 - tb, ant_x + tb, ant_y1 + tb],
              fill=(93, 228, 255, 255))
    d.ellipse([ant_x - tb + 1, ant_y1 - tb + 1,
               ant_x - tb + round(tb * 0.55), ant_y1 - tb + round(tb * 0.55)],
              fill=(255, 255, 255, 180))

    return img


def main():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = {s: create_frame(s) for s in sizes}
    big = frames[256]
    big.save(OUT, format='ICO', sizes=[(s, s) for s in sizes])
    kb = OUT.stat().st_size / 1024
    print(f'Spark icon written -> {OUT}  ({kb:.1f} KB)')


if __name__ == '__main__':
    main()
