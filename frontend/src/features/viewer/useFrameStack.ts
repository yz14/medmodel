import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { decodeDicomFrame, type DecodedFrame } from '@/features/viewer/dicom-decoder'

const MAX_CACHE = 24
const PREFETCH_RADIUS = 2

/**
 * Series-scoped frame cache + neighbor prefetch (fixes A-7).
 * Cache clears only when seriesUid changes, not on every slice scroll.
 */
export function useFrameStack(seriesUid: string, sliceIndex: number, sliceCount: number) {
  const cacheRef = useRef<Map<number, DecodedFrame>>(new Map())
  const inflightRef = useRef<Map<number, Promise<DecodedFrame>>>(new Map())
  const [frame, setFrame] = useState<DecodedFrame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const trimCache = useCallback((around: number) => {
    const cache = cacheRef.current
    if (cache.size <= MAX_CACHE) return
    const keys = [...cache.keys()].sort(
      (a, b) => Math.abs(a - around) - Math.abs(b - around),
    )
    for (let i = MAX_CACHE; i < keys.length; i++) {
      cache.delete(keys[i]!)
    }
  }, [])

  const loadOne = useCallback(
    async (idx: number): Promise<DecodedFrame> => {
      const cached = cacheRef.current.get(idx)
      if (cached) return cached
      const inflight = inflightRef.current.get(idx)
      if (inflight) return inflight

      const promise = decodeDicomFrame(api.frameUrl(seriesUid, idx))
        .then((decoded) => {
          cacheRef.current.set(idx, decoded)
          trimCache(idx)
          return decoded
        })
        .finally(() => {
          inflightRef.current.delete(idx)
        })
      inflightRef.current.set(idx, promise)
      return promise
    },
    [seriesUid, trimCache],
  )

  // Clear cache only when series changes
  useEffect(() => {
    cacheRef.current.clear()
    inflightRef.current.clear()
    setFrame(null)
    setError(null)
  }, [seriesUid])

  // Load current slice
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadOne(sliceIndex)
      .then((decoded) => {
        if (!cancelled) setFrame(decoded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '帧解码失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sliceIndex, loadOne])

  // Prefetch neighbors
  useEffect(() => {
    if (!sliceCount) return
    for (let d = 1; d <= PREFETCH_RADIUS; d++) {
      const hi = sliceIndex + d
      const lo = sliceIndex - d
      if (hi < sliceCount) void loadOne(hi).catch(() => undefined)
      if (lo >= 0) void loadOne(lo).catch(() => undefined)
    }
  }, [sliceIndex, sliceCount, loadOne])

  return { frame, error, loading }
}
