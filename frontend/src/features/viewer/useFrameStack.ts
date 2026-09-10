import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { fetchDecodedFrame, type DecodedFrame } from '@/features/viewer/dicom-decoder'

const MAX_CACHE = 24
const PREFETCH_RADIUS = 2

/**
 * Series-scoped frame cache + neighbor prefetch.
 * N-F1: generation stamp + Map replacement so stale promises never write into the new series cache.
 */
export function useFrameStack(seriesUid: string, sliceIndex: number, sliceCount: number) {
  const genRef = useRef(0)
  const cacheRef = useRef<Map<number, DecodedFrame>>(new Map())
  const inflightRef = useRef<Map<number, Promise<DecodedFrame>>>(new Map())
  const [frame, setFrame] = useState<DecodedFrame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const trimCache = useCallback((around: number, cache: Map<number, DecodedFrame>) => {
    if (cache.size <= MAX_CACHE) return
    const keys = [...cache.keys()].sort(
      (a, b) => Math.abs(a - around) - Math.abs(b - around),
    )
    for (let i = MAX_CACHE; i < keys.length; i++) {
      cache.delete(keys[i]!)
    }
  }, [])

  // Replace Maps on series change (do not clear-in-place — old promises may still resolve)
  useEffect(() => {
    genRef.current += 1
    cacheRef.current = new Map()
    inflightRef.current = new Map()
    setFrame(null)
    setError(null)
  }, [seriesUid])

  const loadOne = useCallback(
    async (idx: number): Promise<DecodedFrame> => {
      if (idx < 0 || (sliceCount > 0 && idx >= sliceCount)) {
        throw new Error(`切片越界: ${idx}`)
      }
      const gen = genRef.current
      const cache = cacheRef.current
      const inflight = inflightRef.current

      const cached = cache.get(idx)
      if (cached) return cached
      const pending = inflight.get(idx)
      if (pending) return pending

      const promise = fetchDecodedFrame(api.pixelFrameUrl(seriesUid, idx))
        .then((decoded) => {
          if (gen !== genRef.current) return decoded
          cache.set(idx, decoded)
          trimCache(idx, cache)
          return decoded
        })
        .finally(() => {
          if (gen === genRef.current) {
            inflight.delete(idx)
          }
        })
      inflight.set(idx, promise)
      return promise
    },
    [seriesUid, sliceCount, trimCache],
  )

  // Load current slice — clear stale frame when target is not cached (TODO-1 #24 related)
  useEffect(() => {
    if (!seriesUid || sliceCount <= 0) return
    if (sliceIndex < 0 || sliceIndex >= sliceCount) return

    let cancelled = false
    const gen = genRef.current
    const cached = cacheRef.current.get(sliceIndex)
    if (!cached) {
      setFrame(null)
    }
    setLoading(true)
    setError(null)
    void loadOne(sliceIndex)
      .then((decoded) => {
        if (!cancelled && gen === genRef.current) setFrame(decoded)
      })
      .catch((err: unknown) => {
        if (!cancelled && gen === genRef.current) {
          setError(err instanceof Error ? err.message : '帧解码失败')
        }
      })
      .finally(() => {
        if (!cancelled && gen === genRef.current) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sliceIndex, sliceCount, seriesUid, loadOne])

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
