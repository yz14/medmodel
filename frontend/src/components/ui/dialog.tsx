import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  )
}

export function DialogContent({
  className,
  children,
  onClose,
  title,
}: {
  className?: string
  children: ReactNode
  onClose?: () => void
  title?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-1 shadow-xl focus:outline-none',
          className,
        )}
        aria-describedby={undefined}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            {title ? (
              <DialogPrimitive.Title className="text-sm font-semibold text-fg-strong">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <span />
            )}
            {onClose && (
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
