import { useEffect } from 'react'

export interface ToastItem {
  id: number
  message: string
}

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: number) => void
}

export function Toast({ toasts, onRemove }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastPill key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastPill({ toast, onRemove }: { toast: ToastItem; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 2000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  return (
    <div className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-[fade-in_150ms_ease-out]">
      {toast.message}
    </div>
  )
}
