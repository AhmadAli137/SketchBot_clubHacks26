/**
 * Scene-snapshot singleton — bridges the R3F canvas (which lives deep
 * inside Scene3D) and the dashboard's autosave path (which needs to
 * grab a thumbnail of the current sandbox view).
 *
 * Why a module-level handle rather than React context: the canvas
 * lives in a `dynamic({ ssr: false })` chunk and the dashboard auto-
 * save runs from a debounced timer + window unload listener. A ref
 * threaded through props would have to climb three layers and would
 * fight the dynamic-import boundary; one global mutable handle is
 * simpler and there's only ever one active sandbox canvas anyway.
 */

let registeredCanvas: HTMLCanvasElement | null = null;

/** Called by Scene3D once its WebGL renderer is ready. */
export function registerSceneCanvas(canvas: HTMLCanvasElement | null): void {
  registeredCanvas = canvas;
}

/**
 * Capture the current sandbox as a JPEG data URL. Returns null if no
 * canvas is registered (e.g., the user is in a non-simulator tab) or
 * the capture failed (canvas tainted, browser denied readback, etc).
 *
 * Sizing: the home screen renders this thumbnail at roughly 460–520 px
 * wide, often on HiDPI displays — so a 320×240 capture upscaled ~2×
 * looked visibly blurry. We now target 960 px wide at quality 0.85,
 * which keeps the file ~120–200 KB (IDB-fine — we used to be on
 * localStorage's 5 MB budget; that constraint is gone) and still
 * looks crisp at 2x DPR.
 *
 * Smoothing: the 2D drawImage downscale uses 'high' image-smoothing-
 * quality so the source's gradient transitions don't alias into the
 * thumbnail.
 *
 * preserveDrawingBuffer: R3F's <Canvas> wraps three.js with
 * `gl.autoClear = true`, which means the renderer clears the framebuffer
 * after each frame. To capture, we have to render once more right
 * before reading. The dashboard calls this after a frame is known to
 * have rendered (the autosave debounce ensures the scene is settled),
 * so a fresh paint isn't strictly necessary — toDataURL reads from the
 * current backbuffer. If you ever see black thumbnails, the fix is
 * `gl.preserveDrawingBuffer = true` in the R3F Canvas config.
 */
export function captureSceneSnapshot(options?: {
  maxWidth?: number;
  quality?: number;
}): string | null {
  const canvas = registeredCanvas;
  if (!canvas) return null;
  const maxWidth = options?.maxWidth ?? 960;
  const quality  = options?.quality  ?? 0.85;

  try {
    // Downscale (or pass through 1:1) to an offscreen canvas. The
    // ratio cap at 1 means we never UPSCALE — if the source is
    // already smaller than maxWidth we just keep its native size.
    const ratio = Math.min(1, maxWidth / canvas.width);
    const w = Math.max(1, Math.round(canvas.width  * ratio));
    const h = Math.max(1, Math.round(canvas.height * ratio));
    const off = document.createElement('canvas');
    off.width  = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    // High-quality smoothing on the downsample so antialiased edges
    // in the source stay clean. Defaults vary by browser; explicit.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL('image/jpeg', quality);
  } catch {
    // SecurityError (tainted canvas) or runtime issue — fall back to
    // letting the older SVG thumbnail show. Better no update than a
    // crash mid-autosave.
    return null;
  }
}
