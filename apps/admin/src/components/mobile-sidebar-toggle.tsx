'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'

/**
 * Toggle that flips the `sidebar-open` class on document.body.
 * The CSS in globals.css picks it up to show/hide the aside on mobile.
 */
export function MobileSidebarToggle() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', open)
  }, [open])

  // Close when clicking outside the sidebar (mobile)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('aside')) return  // inside sidebar
      if (target.closest('[data-sidebar-toggle]')) return  // the button itself
      setOpen(false)
    }
    setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  return (
    <button
      data-sidebar-toggle
      onClick={() => setOpen(!open)}
      className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-md bg-white border border-border shadow flex items-center justify-center"
      aria-label="Menú"
    >
      {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  )
}
