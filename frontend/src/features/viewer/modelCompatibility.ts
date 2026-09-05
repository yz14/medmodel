import type { ModelSpec } from '@/types/api'

export type SeriesConstraintInput = {
  modality?: string | null
  bodyPart?: string | null
  numInstances?: number | null
}

/** Mirror backend check_input_constraints for UI disable (N-B6). */
export function modelCompatibility(
  model: ModelSpec,
  series: SeriesConstraintInput,
): { ok: boolean; reason?: string } {
  const constraints = (model.input_constraints ?? {}) as Record<string, unknown>
  const allowedMods = new Set(
    [
      ...(model.modalities ?? []),
      ...((constraints.modality as string[] | undefined) ?? []),
    ].map((m) => String(m).toUpperCase()),
  )
  const mod = (series.modality ?? '').toUpperCase()
  if (allowedMods.size && mod && !allowedMods.has(mod)) {
    return { ok: false, reason: `不支持模态 ${mod}` }
  }

  const minSlices = constraints.min_slices
  if (typeof minSlices === 'number' && (series.numInstances ?? 0) < minSlices) {
    return { ok: false, reason: `需要 ≥${minSlices} 层` }
  }

  const allowedParts = new Set(
    [
      ...(model.body_parts ?? []),
      ...((constraints.body_part as string[] | string | undefined)
        ? Array.isArray(constraints.body_part)
          ? (constraints.body_part as string[])
          : [String(constraints.body_part)]
        : []),
    ].map((p) => String(p).toUpperCase()),
  )
  const part = (series.bodyPart ?? '').toUpperCase()
  if (allowedParts.size && part && !allowedParts.has(part)) {
    return { ok: false, reason: `不适用于 ${part}` }
  }

  return { ok: true }
}
