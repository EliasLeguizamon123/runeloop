import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '@/components/ui/button'

it('shadcn Button can render an accessible link without nested buttons', () => {
  const html = renderToStaticMarkup(<Button asChild><a href="https://example.com/room/example">Abrir sala</a></Button>)
  expect(html).toContain('<a ')
  expect(html).toContain('href="https://example.com/room/example"')
  expect(html).not.toContain('<button')
})
