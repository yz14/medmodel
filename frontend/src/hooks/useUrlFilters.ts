import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

type Filters = Record<string, string>

/**
 * Sync a flat string filter bag with the URL search params (FE-4).
 * Empty values are omitted from the URL. `page` defaults to "1".
 */
export function useUrlFilters<T extends Filters>(defaults: T) {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const next = { ...defaults }
    for (const key of Object.keys(defaults) as Array<keyof T & string>) {
      const raw = params.get(key)
      if (raw != null && raw !== '') {
        ;(next as Filters)[key] = raw
      }
    }
    return next
  }, [params, defaults])

  const setFilters = useCallback(
    (patch: Partial<T> | ((prev: T) => Partial<T>)) => {
      setParams(
        (prev) => {
          const current: Filters = { ...defaults }
          for (const key of Object.keys(defaults) as Array<keyof T & string>) {
            const raw = prev.get(key)
            if (raw != null && raw !== '') current[key] = raw
          }
          const delta = typeof patch === 'function' ? patch(current as T) : patch
          const merged = { ...current, ...delta } as Filters

          const next = new URLSearchParams()
          for (const [key, value] of Object.entries(merged)) {
            if (value == null || value === '') continue
            if (key === 'page' && value === '1') continue
            next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [defaults, setParams],
  )

  const clearFilter = useCallback(
    (key: keyof T & string) => {
      setFilters({ [key]: defaults[key] ?? '' } as Partial<T>)
    },
    [defaults, setFilters],
  )

  const clearAll = useCallback(() => {
    setFilters(defaults)
  }, [defaults, setFilters])

  return { filters, setFilters, clearFilter, clearAll, searchParams: params }
}
