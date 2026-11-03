import { test, expect, devices } from '@playwright/test'

test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Requires a Realtime test project')

test('mobile player can join, move own token, ping, and roll dice', async ({ browser }) => {
  const dm = await browser.newContext()
  const mobile = await browser.newContext({ ...devices['iPhone 13'] })
  try {
    const dmPage = await dm.newPage()
    const mobilePage = await mobile.newPage()
    await dmPage.goto('/')
    await dmPage.getByRole('button', { name: 'Crear sala' }).click()
    await expect(dmPage.getByText('En vivo')).toBeVisible()
    await mobilePage.goto(dmPage.url())
    await mobilePage.getByLabel('Nombre').fill('Lucía')
    await mobilePage.getByRole('button', { name: 'Entrar' }).click()
    const token = mobilePage.locator('[data-token-id]').first()
    await expect(token).toBeVisible()
    const rect = await token.boundingBox()
    if (!rect) throw new Error('Token missing')
    const originalStyle = await token.getAttribute('style')
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
    const cdp = await mobile.newCDPSession(mobilePage)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 80, y: y + 40 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(token).not.toHaveAttribute('style', originalStyle ?? '')
    const tokenId = await token.getAttribute('data-token-id')
    await expect(dmPage.locator(`[data-token-id="${tokenId}"]`)).toHaveAttribute('style', await token.getAttribute('style') ?? '')
    await mobilePage.getByRole('button', { name: 'Ping' }).click()
    await mobilePage.touchscreen.tap(rect.x + rect.width / 2 + 80, rect.y + rect.height / 2 + 40)
    await expect(dmPage.locator('.board-ping')).toBeVisible()
    await mobilePage.getByRole('button', { name: 'Tirar' }).click()
    await expect(dmPage.locator('.dice-history li').first()).toContainText('Lucía')
  } finally { await dm.close(); await mobile.close() }
})
