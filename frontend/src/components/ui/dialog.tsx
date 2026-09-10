import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
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

export function DialogDescription({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-xs leading-relaxed text-muted', className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Description>
  )
}

export function DialogContent({
  className,
  children,
  onClose,
  title,
  description,
}: {
  className?: string
  children: ReactNode
  onClose?: () => void
  title?: string
  description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-1 shadow-xl focus:outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
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
        <div className="space-y-3 p-4">
          {description ? <DialogDescription>{description}</DialogDescription> : null}
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
