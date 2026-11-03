import { expect, test } from '@playwright/test'

test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Requires a Realtime test project')

test('dialog animates normally and avoids transform motion when reduced motion is requested', async ({ browser }) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion })
    try {
      const page = await context.newPage()
      await page.addInitScript(() => {
        const target = window as Window & { __motionTransformAnimations?: number }
        target.__motionTransformAnimations = 0
        const animate = Element.prototype.animate
        Element.prototype.animate = function (keyframes, options) {
          const frames = Array.isArray(keyframes) ? keyframes : [keyframes]
          if (frames.some(frame => frame && typeof frame === 'object' && 'transform' in frame)) target.__motionTransformAnimations!++
          return animate.call(this, keyframes, options)
        }
      })
      await page.goto('/')
      await page.getByRole('button', { name: 'Crear sala' }).click()
      await expect(page.getByText('En vivo')).toBeVisible()
      await page.getByRole('button', { name: 'Crear monstruo' }).click()
      const dialog = page.locator('.dialog-content')
      await expect(dialog).toBeVisible()
      const hasTransformAnimation = await page.evaluate(() =>
        Boolean((window as Window & { __motionTransformAnimations?: number }).__motionTransformAnimations),
      )
      expect(hasTransformAnimation).toBe(reducedMotion === 'no-preference')
    } finally {
      await context.close()
    }
  }
})
