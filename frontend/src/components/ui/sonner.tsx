import type { ComponentProps } from 'react'
import { Toaster as Sonner, toast } from 'sonner'
import { useUiStore } from '@/stores/ui-store'

type ToasterProps = ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  const theme = useUiStore((s) => s.theme)

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface-1 group-[.toaster]:text-fg group-[.toaster]:border-border group-[.toaster]:shadow-xl',
          description: 'group-[.toast]:text-muted',
          actionButton: 'group-[.toast]:bg-brand group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-surface-2 group-[.toast]:text-muted',
        },
      }}
      {...props}
    />
  )
}

export { toast }
