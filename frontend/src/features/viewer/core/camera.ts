/**
 * Explicit 2D camera for stack viewport (N-F3 / N-F13 / FE-2).
 * image → screen: p' = p * scale + t
 * Zoom about a screen point: t' = mouse - (mouse - t) * (s'/s)
 */

export interface Camera2D {
  scale: number
  tx: number
  ty: number
}

export interface Point2D {
  x: number
  y: number
}

export const CAMERA_SCALE_MIN = 0.05
export const CAMERA_SCALE_MAX = 32

/** Default letterbox padding (px). Keep small so fitted image fills ≥90% of short side. */
export const FIT_PADDING_PX = 2

/** Relative zoom within this ε of 1.0 is treated as "at fit" (re-fit on resize). */
export const FIT_RELATIVE_EPS = 0.03

export function identityCamera(): Camera2D {
  return { scale: 1, tx: 0, ty: 0 }
}

/** Fit image into viewport (letterbox), centered. */
export function fitCamera(
  viewportW: number,
  viewportH: number,
  imageW: number,
  imageH: number,
  padding = FIT_PADDING_PX,
): Camera2D {
  const availW = Math.max(1, viewportW - padding * 2)
  const availH = Math.max(1, viewportH - padding * 2)
  const scale = Math.min(availW / Math.max(1, imageW), availH / Math.max(1, imageH))
  return {
    scale,
    tx: (viewportW - imageW * scale) / 2,
    ty: (viewportH - imageH * scale) / 2,
  }
}

/** True 1:1 (1 screen px = 1 image px), centered. */
export function oneToOneCamera(
  viewportW: number,
  viewportH: number,
  imageW: number,
  imageH: number,
): Camera2D {
  return {
    scale: 1,
    tx: (viewportW - imageW) / 2,
    ty: (viewportH - imageH) / 2,
  }
}

export function toScreen(cam: Camera2D, ix: number, iy: number): Point2D {
  return { x: ix * cam.scale + cam.tx, y: iy * cam.scale + cam.ty }
}

/** Image → screen accounting for H/V flip (matches cameraCssTransform). */
export function imageToScreen(
  cam: Camera2D,
  ix: number,
  iy: number,
  imageW: number,
  imageH: number,
  flipH = false,
  flipV = false,
): Point2D {
  const x = flipH ? imageW - ix : ix
  const y = flipV ? imageH - iy : iy
  return toScreen(cam, x, y)
}

export function toImage(cam: Camera2D, sx: number, sy: number): Point2D {
  return { x: (sx - cam.tx) / cam.scale, y: (sy - cam.ty) / cam.scale }
}

/** Map screen → image accounting for H/V flip about image bounds. */
export function screenToImage(
  cam: Camera2D,
  sx: number,
  sy: number,
  imageW: number,
  imageH: number,
  flipH = false,
  flipV = false,
): Point2D {
  let { x, y } = toImage(cam, sx, sy)
  if (flipH) x = imageW - x
  if (flipV) y = imageH - y
  return { x, y }
}

export function clampImagePoint(p: Point2D, imageW: number, imageH: number): Point2D {
  return {
    x: Math.max(0, Math.min(Math.max(0, imageW - 1e-6), p.x)),
    y: Math.max(0, Math.min(Math.max(0, imageH - 1e-6), p.y)),
  }
}

export function zoomAt(
  cam: Camera2D,
  screenX: number,
  screenY: number,
  factor: number,
  minScale = CAMERA_SCALE_MIN,
  maxScale = CAMERA_SCALE_MAX,
): Camera2D {
  const nextScale = Math.min(maxScale, Math.max(minScale, cam.scale * factor))
  if (nextScale === cam.scale) return cam
  const ratio = nextScale / cam.scale
  return {
    scale: nextScale,
    tx: screenX - (screenX - cam.tx) * ratio,
    ty: screenY - (screenY - cam.ty) * ratio,
  }
}

export function panBy(cam: Camera2D, dxScreen: number, dyScreen: number): Camera2D {
  return { scale: cam.scale, tx: cam.tx + dxScreen, ty: cam.ty + dyScreen }
}

/**
 * CSS matrix for an element sized in image pixels (transform-origin 0 0).
 * Flip is baked so overlays stay aligned with toImage/screenToImage.
 */
export function cameraCssTransform(
  cam: Camera2D,
  imageW: number,
  imageH: number,
  flipH = false,
  flipV = false,
): string {
  const sx = flipH ? -cam.scale : cam.scale
  const sy = flipV ? -cam.scale : cam.scale
  const tx = cam.tx + (flipH ? cam.scale * imageW : 0)
  const ty = cam.ty + (flipV ? cam.scale * imageH : 0)
  return `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`
}

/** Zoom relative to last fit scale (1 = fit-to-window). */
export function relativeZoom(cam: Camera2D, fitScale: number): number {
  if (!fitScale || fitScale <= 0) return cam.scale
  return cam.scale / fitScale
}

/** True when camera is still at (or very near) last fit — safe to re-fit on panel resize. */
export function isNearFit(
  cam: Camera2D,
  fitScale: number,
  eps = FIT_RELATIVE_EPS,
): boolean {
  if (!fitScale || fitScale <= 0) return true
  return Math.abs(relativeZoom(cam, fitScale) - 1) <= eps
}

/**
 * Fraction of the viewport short side covered by the fitted image short axis.
 * Used for FE-2 acceptance (≥0.9 after fit).
 */
export function shortSideFillRatio(
  viewportW: number,
  viewportH: number,
  imageW: number,
  imageH: number,
  cam: Camera2D,
): number {
  const viewShort = Math.min(viewportW, viewportH)
  if (viewShort <= 0) return 0
  const drawnW = imageW * cam.scale
  const drawnH = imageH * cam.scale
  if (viewportW <= viewportH) {
    return Math.min(1, drawnW / viewShort)
  }
  return Math.min(1, drawnH / viewShort)
}
