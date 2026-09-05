/**
 * Cornerstone3D global init — module-level Promise singleton (R7 spike).
 * Dynamic import keeps the spike page shell loadable if CS3D fails.
 */
let initPromise: Promise<void> | null = null

export function ensureCornerstoneInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const [{ init: coreInit }, { init: dicomImageLoaderInit }] = await Promise.all([
        import('@cornerstonejs/core'),
        import('@cornerstonejs/dicom-image-loader'),
      ])
      await coreInit()
      await dicomImageLoaderInit({ maxWebWorkers: 1 })
    })().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

export function buildWadoUriImageIds(seriesUid: string, sliceCount: number): string[] {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = `${origin}/api/v1/series/${encodeURIComponent(seriesUid)}/frames`
  return Array.from({ length: sliceCount }, (_, i) => `wadouri:${base}/${i}`)
}
