"""
Generates apps/desktop/electron/icon.ico — the SaySpark spark mark.

Mirrors apps/admin-web/src/app/icon.svg (the favicon used in the admin
site's browser tab) so the desktop app, installer, and admin web tab
all wear the same brand glyph. Run via build-prod.sh before
electron-builder; also writes a copy to renderer/src/app/favicon.ico
so the in-app window/tab icon matches in dev too.

Requires Pillow (already in the local-runtime venv).
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ICO_OUT     = Path(__file__).parent / 'icon.ico'
FAVICON_OUT = Path(__file__).parents[1] / 'renderer' / 'src' / 'app' / 'favicon.ico'

# Brand palette (matches apps/admin-web/src/app/icon.svg gradients).
BG_OUTER    = (10,  13,  24)   # #0a0d18
BG_INNER    = (26,  32,  64)   # #1a2040
HALO_CYAN   = (93,  228, 255)  # #5de4ff
HALO_VIOLET = (168, 85,  247)  # #a855f7
SPARK_WARM  = (255, 244, 214)  # #fff4d6 — innermost glow tint


def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def star8_points(cx, cy, outer, inner, rot_deg=0.0):
    """Eight-pointed star, alternating outer/inner radii. rot_deg
    rotates the whole shape; default places a point at the top."""
    pts = []
    base = -90.0 + rot_deg
    for i in range(16):
        angle = math.radians(base + i * (360.0 / 16))
        r = outer if (i % 2 == 0) else inner
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def create_frame(size: int) -> Image.Image:
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = s / 2.0

    # ── Rounded-square backdrop ────────────────────────────────────────────
    # Flat near-black so the cyan/violet spark has something to glow on.
    # Pillow's ImageDraw doesn't alpha-blend over RGBA — semi-transparent
    # overlays would punch holes through the backdrop — so we keep this
    # opaque and rely on the halo layer (composited below) for the inner
    # brightening.
    corner_r = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner_r,
                        fill=(*BG_INNER, 255))

    # ── Halo behind the spark ──────────────────────────────────────────────
    # Soft cyan core fading through violet to transparent. Drawn as
    # stacked rings on a separate layer that we then alpha-composite, so
    # the falloff is smooth without banding.
    halo = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    halo_d = ImageDraw.Draw(halo)
    halo_r = s * 0.46
    rings = max(20, int(halo_r))
    for i in range(rings, 0, -1):
        t = i / rings   # 1 at edge, 0 at center
        # Color: violet at edges (t≈1) → cyan at center (t≈0)
        col = lerp_color(HALO_VIOLET, HALO_CYAN, 1 - t)
        # Quadratic falloff — softer than linear, no harsh outer ring
        alpha = int(80 * (1 - t) ** 2)
        if alpha <= 0:
            continue
        rr = halo_r * (i / rings)
        halo_d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                       fill=(*col, alpha))
    # Single light blur smooths the residual banding from the ring stack.
    halo = halo.filter(ImageFilter.GaussianBlur(radius=max(1, s / 96)))
    img = Image.alpha_composite(img, halo)
    d = ImageDraw.Draw(img)  # rebind draw to composited image

    # ── Spark layer — built on its own RGBA canvas so semi-transparent ────
    # overlays (the white sub-star, sparkle highlights) blend with the
    # color stack beneath them via alpha_composite rather than punching
    # holes by overwriting alpha values.
    spark = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spark)

    scale = s / 32.0          # admin SVG viewBox = 32
    # Three stacked 8-pointed stars approximate the SVG's
    # #fff4d6 → #5de4ff → #a855f7 radial: violet outer, cyan middle,
    # warm-white inner. At icon sizes this reads as the same glow.
    sd.polygon(star8_points(cx, cy, 11.5 * scale, 3.0 * scale),
               fill=(*HALO_VIOLET, 255))
    sd.polygon(star8_points(cx, cy,  9.0 * scale, 2.4 * scale),
               fill=(*HALO_CYAN,   255))
    sd.polygon(star8_points(cx, cy,  6.0 * scale, 1.6 * scale),
               fill=(*SPARK_WARM,  255))

    # Rotated white sub-star — drawn on its OWN layer so the alpha
    # blends with the colored spark instead of replacing it.
    sub = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(sub).polygon(
        star8_points(cx, cy, 5.0 * scale, 1.4 * scale, rot_deg=45.0),
        fill=(255, 255, 255, 140),
    )
    spark = Image.alpha_composite(spark, sub)
    sd = ImageDraw.Draw(spark)

    # Bright white centre disc — fully opaque, can be drawn directly.
    cr = max(1.0, 2.0 * scale)
    sd.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
               fill=(255, 255, 255, 255))

    img = Image.alpha_composite(img, spark)

    # ── Sparkle highlights (skip the smallest sizes, would just be noise) ─
    # Composited on yet another layer so the alpha blends correctly with
    # the violet halo bleed at the edges of the icon.
    if s >= 48:
        sparkles = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        spd = ImageDraw.Draw(sparkles)
        for (sx_off, sy_off, sr_f, alpha) in [
            ( 6.0, -5.0, 0.75, 220),
            (-6.5,  5.5, 0.65, 180),
            (-5.0, -4.5, 0.45, 150),
        ]:
            sx = cx + sx_off * scale
            sy = cy + sy_off * scale
            sr = max(1.0, sr_f * scale)
            spd.ellipse([sx - sr, sy - sr, sx + sr, sy + sr],
                        fill=(255, 255, 255, alpha))
        img = Image.alpha_composite(img, sparkles)

    return img


def main():
    sizes  = [16, 24, 32, 48, 64, 128, 256]
    frames = {s: create_frame(s) for s in sizes}

    # icon.ico — multi-resolution; Windows/Electron pick the best fit.
    big = frames[256]
    big.save(ICO_OUT, format='ICO', sizes=[(s, s) for s in sizes])
    print(f'Spark icon written -> {ICO_OUT}  ({ICO_OUT.stat().st_size / 1024:.1f} KB)')

    # favicon.ico — Next.js convention; same multi-res payload so the
    # dev-mode window icon and any browser-tab fallback match.
    FAVICON_OUT.parent.mkdir(parents=True, exist_ok=True)
    big.save(FAVICON_OUT, format='ICO', sizes=[(s, s) for s in sizes])
    print(f'Favicon written  -> {FAVICON_OUT}  ({FAVICON_OUT.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
