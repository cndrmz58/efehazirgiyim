import { Bell } from 'lucide-react'
import { useState } from 'react'

export function NotificationMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="notification-menu">
      <button type="button" className="notification-trigger" aria-label="Bildirimler" aria-expanded={open} aria-controls="notification-panel" onClick={() => setOpen(!open)}>
        <Bell size={21} strokeWidth={2} aria-hidden="true" />
      </button>
      <div id="notification-panel" className="notification-popover" role="region" aria-label="Bildirimler" hidden={!open}>
        <p className="notification-menu-label">Bildirimler</p>
      </div>
    </div>
  )
}
