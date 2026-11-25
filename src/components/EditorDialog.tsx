import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react'

export function EditorDialog({ children, busy, labelledBy, onDismiss }: {
  children: ReactNode
  busy: boolean
  labelledBy: string
  onDismiss: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [])

  function dismiss(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && !busy) onDismiss()
  }

  return <dialog ref={dialogRef} className="editor-dialog" aria-labelledby={labelledBy}
    onClick={dismiss}
    onCancel={(event) => {
      event.preventDefault()
      if (!busy) onDismiss()
    }}>
    {children}
  </dialog>
}
