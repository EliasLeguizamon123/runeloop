import type { Metadata } from 'next'
import { MotionProvider } from '@/components/ui/motion-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'RuneLoop',
  description: 'Una mesa de rol compartida para jugar en vivo',
  icons: {
    icon: [
      { url: '/favicon_io/favicon.ico' },
      { url: '/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/favicon_io/apple-touch-icon.png',
  },
  manifest: '/favicon_io/site.webmanifest',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><MotionProvider>{children}</MotionProvider></body></html>
}
