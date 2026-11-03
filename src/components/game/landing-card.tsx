'use client'

import { motion } from 'motion/react'
import Image from 'next/image'
import { CreateRoom } from './create-room'

export function LandingCard() {
  return <motion.div className="landing-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24, ease: 'easeOut' }}>
    <span className="eyebrow">Mesa en vivo</span>
    <h1 className="visually-hidden">RuneLoop</h1>
    <Image className="landing-logo" src="/logo.png" alt="" width={360} height={240} priority />
    <p>Un mapa, unos dados y tu grupo. Creá la sala y compartí el link.</p>
    <CreateRoom />
  </motion.div>
}
