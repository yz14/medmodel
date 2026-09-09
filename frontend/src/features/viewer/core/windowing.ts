import type { DecodedFrame } from '@/features/viewer/dicom-decoder'
import { WINDOW_PRESETS, type WindowPreset } from '@/features/viewer/core/presets'

/** Modalities that use HU / CT window presets. */
export function isCtLike(modality?: string | null): boolean {
  const m = (modality || '').toUpperCase()
  return m === 'CT' || m === 'PT'
}

/** 2D projection (DX/CR/DR) — no slice thickness, no HU probe label. */
export function isProjectionModality(modality?: string | null): boolean {
  const m = (modality || '').toUpperCase()
  return m === 'DX' || m === 'CR' || m === 'DR' || m === 'MG'
}

export function isValidWindow(ww?: number | null, wc?: number | null): boolean {
  return (
    typeof ww === 'number' &&
    typeof wc === 'number' &&
    Number.isFinite(ww) &&
    Number.isFinite(wc) &&
    ww > 0
  )
}

/** 1%–99% percentile auto-window for MR / DX when DICOM has no VOI. */
export function autoWindowFromPixels(pixels: Float32Array): { ww: number; wc: number } {
  const n = pixels.length
  if (n === 0) return { ww: 400, wc: 40 }
  const step = Math.max(1, Math.floor(n / 40_000))
  const samples: number[] = []
  for (let i = 0; i < n; i += step) {
    const v = pixels[i]
    if (v != null && Number.isFinite(v)) samples.push(v)
  }
  if (samples.length < 2) return { ww: 400, wc: 40 }
  samples.sort((a, b) => a - b)
  const lo = samples[Math.floor((samples.length - 1) * 0.01)]!
  const hi = samples[Math.floor((samples.length - 1) * 0.99)]!
  const ww = Math.max(1, hi - lo)
  const wc = (hi + lo) / 2
  return { ww, wc }
}

export function windowFromDicom(frame: DecodedFrame): { ww: number; wc: number } | null {
  if (isValidWindow(frame.windowWidth, frame.windowCenter)) {
    return { ww: frame.windowWidth!, wc: frame.windowCenter! }
  }
  return null
}

/**
 * Seed order (#2): DICOM VOI → CT user preset → percentile auto.
 * User preference presets apply only for CT-like modalities.
 */
export function resolveInitialWindow(opts: {
  frame: DecodedFrame
  modality?: string | null
  preferredPresetId?: string | null
}): { ww: number; wc: number; source: 'dicom' | 'preset' | 'auto' } {
  const fromDicom = windowFromDicom(opts.frame)
  if (fromDicom) return { ...fromDicom, source: 'dicom' }

  if (isCtLike(opts.modality)) {
    const preset: WindowPreset | undefined =
      WINDOW_PRESETS.find((p) => p.id === opts.preferredPresetId) ?? WINDOW_PRESETS[0]
    if (preset) return { ww: preset.ww, wc: preset.wc, source: 'preset' }
  }

  const auto = autoWindowFromPixels(opts.frame.pixels)
  return { ...auto, source: 'auto' }
}
