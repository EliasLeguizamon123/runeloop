// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MotionProvider } from '@/components/ui/motion-provider'
import { useReducedMotion } from 'motion/react'

function MotionPreference() {
  const prefersReducedMotion = useReducedMotion()
  return <span>{prefersReducedMotion ? 'reduce' : 'no-preference'}</span>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('provides Motion with the system reduced-motion preference', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  render(<MotionProvider><MotionPreference /></MotionProvider>)
  await waitFor(() => expect(screen.getByText('reduce')).toBeTruthy())
})
