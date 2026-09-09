import type { MaskArtifact } from '@/types/api'

function parseCssColor(color: string): [number, number, number] {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    if (color.length === 4) {
      const r = parseInt(color[1]! + color[1]!, 16)
      const g = parseInt(color[2]! + color[2]!, 16)
      const b = parseInt(color[3]! + color[3]!, 16)
      return [r, g, b]
    }
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ]
  }
  return [56, 189, 248]
}

type CacheEntry = {
  image: ImageBitmap | HTMLImageElement
  objectUrl?: string
}

const MAX_MASK_CACHE = 48
/** Insertion-order Map = LRU (re-insert on hit). */
const maskImageCache = new Map<string, CacheEntry>()

function disposeEntry(entry: CacheEntry) {
  if (typeof ImageBitmap !== 'undefined' && entry.image instanceof ImageBitmap) {
    try {
      entry.image.close()
    } catch {
      /* ignore */
    }
  }
  if (entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl)
  }
}

function touch(url: string, entry: CacheEntry) {
  maskImageCache.delete(url)
  maskImageCache.set(url, entry)
  while (maskImageCache.size > MAX_MASK_CACHE) {
    const oldest = maskImageCache.keys().next().value
    if (oldest == null) break
    const evicted = maskImageCache.get(oldest)
    if (evicted) disposeEntry(evicted)
    maskImageCache.delete(oldest)
  }
}

async function loadMaskImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const cached = maskImageCache.get(url)
  if (cached) {
    touch(url, cached)
    return cached.image
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`掩膜加载失败: ${res.status}`)
  const blob = await res.blob()
  try {
    const bmp = await createImageBitmap(blob)
    touch(url, { image: bmp })
    return bmp
  } catch {
    const objectUrl = URL.createObjectURL(blob)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('掩膜 PNG 解码失败'))
      }
      el.src = objectUrl
    })
    touch(url, { image: img, objectUrl })
    return img
  }
}

/** Dispose all cached bitmaps / object URLs (N-F4). */
export function clearMaskImageCache() {
  for (const entry of maskImageCache.values()) {
    disposeEntry(entry)
  }
  maskImageCache.clear()
}

/**
 * Draw labelmap PNG: fill at capped opacity + same-color contour for all enabled labels (#16).
 * Emphasize / hover thicken the outline only — never boost fill to near-opaque.
 */
export async function paintMaskOverlay(
  canvas: HTMLCanvasElement,
  opts: {
    url: string
    width: number
    height: number
    masks: MaskArtifact[]
    enabledIds: number[]
    opacity: number
    emphasizeLabelId?: number | null
    hoverLabelId?: number | null
    /** Called after async load; return false to skip putImageData (stale request). */
    shouldCommit?: () => boolean
  },
): Promise<boolean> {
  const {
    url,
    width,
    height,
    masks,
    enabledIds,
    opacity,
    emphasizeLabelId = null,
    hoverLabelId = null,
    shouldCommit,
  } = opts
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.clearRect(0, 0, width, height)
  if (!enabledIds.length || opacity <= 0) return false

  let image: ImageBitmap | HTMLImageElement
  try {
    image = await loadMaskImage(url)
  } catch {
    ctx.clearRect(0, 0, width, height)
    return false
  }
  if (shouldCommit && !shouldCommit()) return false

  const off = document.createElement('canvas')
  off.width = width
  off.height = height
  const offCtx = off.getContext('2d')
  if (!offCtx) return false
  offCtx.drawImage(image, 0, 0, width, height)
  const src = offCtx.getImageData(0, 0, width, height)
  const out = ctx.createImageData(width, height)

  const colorById = new Map<number, [number, number, number]>()
  for (const m of masks) {
    if (enabledIds.includes(m.label_id)) {
      colorById.set(m.label_id, parseCssColor(m.color))
    }
  }
  if (!colorById.size) return false

  // Fill stays in ~25–35% range even if UI opacity is higher
  const fillOpacity = Math.min(0.35, Math.max(0, opacity) * 0.85)
  const baseAlpha = Math.round(fillOpacity * 255)
  const ids = [...colorById.keys()]
  const isBinaryFriendly = ids.length === 1

  const labelAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    const v = src.data[(y * width + x) * 4]!
    if (v === 0) return 0
    if (colorById.has(v)) return v
    if (isBinaryFriendly && v > 0) return ids[0]!
    return 0
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = labelAt(x, y)
      if (!id) continue
      const color = colorById.get(id)
      if (!color) continue
      let a = baseAlpha
      // Dim non-emphasized when something is selected — still keep readable fill
      if (emphasizeLabelId != null && id !== emphasizeLabelId) a = Math.round(a * 0.4)
      else if (hoverLabelId != null && id === hoverLabelId && id !== emphasizeLabelId) {
        a = Math.min(255, Math.round(a * 1.1))
      }

      const o = (y * width + x) * 4
      out.data[o] = color[0]
      out.data[o + 1] = color[1]
      out.data[o + 2] = color[2]
      out.data[o + 3] = a
    }
  }

  // Same-color contour for every enabled label (radiology convention)
  for (const oid of ids) {
    const color = colorById.get(oid)!
    const selected = oid === emphasizeLabelId
    const hovered = oid === hoverLabelId
    const edgeAlpha = selected ? 240 : hovered ? 210 : 200
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labelAt(x, y) !== oid) continue
        const edgePixel =
          labelAt(x - 1, y) !== oid ||
          labelAt(x + 1, y) !== oid ||
          labelAt(x, y - 1) !== oid ||
          labelAt(x, y + 1) !== oid
        if (!edgePixel) continue
        // Thicker outline for selected: also paint 4-neighborhood as edge tint
        const o = (y * width + x) * 4
        out.data[o] = color[0]
        out.data[o + 1] = color[1]
        out.data[o + 2] = color[2]
        out.data[o + 3] = edgeAlpha
        if (selected || hovered) {
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ] as const) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            if (labelAt(nx, ny) === oid) continue
            const no = (ny * width + nx) * 4
            out.data[no] = color[0]
            out.data[no + 1] = color[1]
            out.data[no + 2] = color[2]
            out.data[no + 3] = Math.round(edgeAlpha * 0.85)
          }
        }
      }
    }
  }

  if (shouldCommit && !shouldCommit()) return false
  ctx.putImageData(out, 0, 0)
  return true
}
