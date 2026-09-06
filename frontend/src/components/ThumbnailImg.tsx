import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Thumbnail with graceful fallback when the image fails to load. */
export function ThumbnailImg({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn('flex items-center justify-center bg-surface-2 text-xs text-muted', className)}
        role="img"
        aria-label={alt || '缩略图不可用'}
      >
        无预览
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
