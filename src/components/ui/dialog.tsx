'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogTitle = DialogPrimitive.Title
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ children, className = '', ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay asChild><motion.div className="dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .14 }} /></DialogPrimitive.Overlay>
    <DialogPrimitive.Content asChild {...props}><motion.div className={`dialog-content ${className}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>{children}</motion.div></DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}
