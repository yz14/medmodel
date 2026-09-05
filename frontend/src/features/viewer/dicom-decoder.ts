import { parseDicom } from 'dicom-parser'

export interface DecodedFrame {
  width: number
  height: number
  pixels: Float32Array
  slope: number
  intercept: number
  windowCenter?: number
  windowWidth?: number
}

function getPixelData(dataSet: ReturnType<typeof parseDicom>, rows: number, cols: number, bitsAllocated: number, pixelRepresentation: number) {
  const element = dataSet.elements.x7fe00010
  if (!element) throw new Error('DICOM 缺少 PixelData')
  const byteArray = dataSet.byteArray
  const offset = element.dataOffset
  const length = element.length
  const count = rows * cols
  const out = new Float32Array(count)

  if (bitsAllocated === 8) {
    for (let i = 0; i < count; i++) out[i] = byteArray[offset + i]
  } else {
    const view = new DataView(byteArray.buffer, byteArray.byteOffset + offset, length)
    for (let i = 0; i < count; i++) {
      out[i] = pixelRepresentation === 1 ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true)
    }
  }
  return out
}

export async function decodeDicomFrame(url: string): Promise<DecodedFrame> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载帧失败: ${res.status}`)
  const buffer = new Uint8Array(await res.arrayBuffer())
  const dataSet = parseDicom(buffer)
  const rows = dataSet.uint16('x00280010') ?? 0
  const cols = dataSet.uint16('x00280011') ?? 0
  const bitsAllocated = dataSet.uint16('x00280100') ?? 16
  const pixelRepresentation = dataSet.uint16('x00280103') ?? 0
  const slope = Number(dataSet.string('x00281053') ?? '1')
  const intercept = Number(dataSet.string('x00281052') ?? '0')
  const wcRaw = dataSet.string('x00281050')
  const wwRaw = dataSet.string('x00281051')
  const windowCenter = wcRaw ? Number(wcRaw.split('\\')[0]) : undefined
  const windowWidth = wwRaw ? Number(wwRaw.split('\\')[0]) : undefined
  const raw = getPixelData(dataSet, rows, cols, bitsAllocated, pixelRepresentation)
  const pixels = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) pixels[i] = raw[i] * slope + intercept
  return { width: cols, height: rows, pixels, slope, intercept, windowCenter, windowWidth }
}

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
