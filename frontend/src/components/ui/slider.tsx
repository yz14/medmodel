import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Slider({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="range"
      className={cn(
        'h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--brand)]',
        className,
      )}
      {...props}
    />
  )
}
