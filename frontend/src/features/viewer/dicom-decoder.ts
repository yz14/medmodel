/**
 * Frame display helpers. Pixel decode happens on the backend
 * (`GET /series/.../frames/{idx}/pixel`) so MONOCHROME1 / BitsStored /
 * multi-valued DS / transfer-syntax errors stay consistent with AI volume load.
 */

export interface DecodedFrame {
  width: number
  height: number
  pixels: Float32Array
  slope: number
  intercept: number
  windowCenter?: number
  windowWidth?: number
  photometric?: string
}

function headerFloat(res: Response, name: string): number | undefined {
  const raw = res.headers.get(name)
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/** Load a backend-decoded float32 frame (little-endian body + X-VoxFlow-* headers). */
export async function fetchDecodedFrame(url: string): Promise<DecodedFrame> {
  const res = await fetch(url)
  if (!res.ok) {
    let message = `加载帧失败: ${res.status}`
    try {
      const body = (await res.json()) as { message?: string; code?: string }
      if (body?.message) message = body.message
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message)
  }

  const width = Number(res.headers.get('X-VoxFlow-Width') || 0)
  const height = Number(res.headers.get('X-VoxFlow-Height') || 0)
  if (!width || !height) {
    throw new Error('帧元数据缺失（Width/Height）')
  }

  const dtype = (res.headers.get('X-VoxFlow-Dtype') || 'float32').toLowerCase()
  if (dtype !== 'float32') {
    throw new Error(`不支持的像素类型: ${dtype}`)
  }

  const buffer = await res.arrayBuffer()
  const expected = width * height * 4
  if (buffer.byteLength < expected) {
    throw new Error(`像素字节不足: got ${buffer.byteLength}, expected ${expected}`)
  }

  const pixels = new Float32Array(buffer, 0, width * height)
  const slope = headerFloat(res, 'X-VoxFlow-Slope') ?? 1
  const intercept = headerFloat(res, 'X-VoxFlow-Intercept') ?? 0
  const windowCenter = headerFloat(res, 'X-VoxFlow-Window-Center')
  const ww = headerFloat(res, 'X-VoxFlow-Window-Width')
  const windowWidth = ww != null && ww > 0 ? ww : undefined
  const photometric = res.headers.get('X-VoxFlow-Photometric') || undefined

  return {
    width,
    height,
    pixels,
    slope,
    intercept,
    windowCenter,
    windowWidth,
    photometric,
  }
}

/** @deprecated Use fetchDecodedFrame — kept name for call-site clarity during transition. */
export const decodeDicomFrame = fetchDecodedFrame

export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  frame: DecodedFrame,
  windowWidth: number,
  windowCenter: number,
  invert = false,
) {
  const { width, height, pixels } = frame
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const low = windowCenter - windowWidth / 2
  const high = windowCenter + windowWidth / 2
  const range = Math.max(high - low, 1e-6)

  for (let i = 0; i < pixels.length; i++) {
    let v = ((pixels[i]! - low) / range) * 255
    v = Math.max(0, Math.min(255, v))
    if (invert) v = 255 - v
    const o = i * 4
    data[o] = v
    data[o + 1] = v
    data[o + 2] = v
    data[o + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
}
