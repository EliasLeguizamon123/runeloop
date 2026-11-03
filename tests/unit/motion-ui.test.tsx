import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import Home from '@/app/page'

it('renders the landing surface with its initial motion state', () => {
  const html = renderToStaticMarkup(<Home />)
  expect(html).toContain('opacity:0')
  expect(html).toContain('translateY(12px)')
})
