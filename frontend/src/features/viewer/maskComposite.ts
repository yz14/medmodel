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

const maskImageCache = new Map<string, ImageBitmap | HTMLImageElement>()

async function loadMaskImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const cached = maskImageCache.get(url)
  if (cached) return cached
  const res = await fetch(url)
  if (!res.ok) throw new Error(`掩膜加载失败: ${res.status}`)
  const blob = await res.blob()
  try {
    const bmp = await createImageBitmap(blob)
    maskImageCache.set(url, bmp)
    return bmp
  } catch {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('掩膜 PNG 解码失败'))
      el.src = URL.createObjectURL(blob)
    })
    maskImageCache.set(url, img)
    return img
  }
}

export function clearMaskImageCache() {
  maskImageCache.clear()
}

/**
 * Draw labelmap PNG onto overlay canvas: pixels matching enabled labels get that label's color.
 * Supports multi-label stacks (pixel value == label_id) and binary (any non-zero → first enabled).
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
  },
): Promise<boolean> {
  const { url, width, height, masks, enabledIds, opacity } = opts
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

  // Read label values via offscreen
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

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
  const ids = [...colorById.keys()]
  const isBinaryFriendly = ids.length === 1

  for (let i = 0; i < width * height; i++) {
    const v = src.data[i * 4]! // R channel of grayscale label PNG
    if (v === 0) continue
    let color = colorById.get(v)
    if (!color && isBinaryFriendly && v > 0) {
      color = colorById.get(ids[0]!)
    }
    if (!color) continue
    const o = i * 4
    out.data[o] = color[0]
    out.data[o + 1] = color[1]
    out.data[o + 2] = color[2]
    out.data[o + 3] = alpha
  }

  ctx.putImageData(out, 0, 0)
  return true
}
