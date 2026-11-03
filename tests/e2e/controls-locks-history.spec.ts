import { expect, test } from '@playwright/test'

test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Requires a Realtime test project')

test('three clients observe an exclusive token lock, final move and DM undo/redo', async ({ browser }) => {
  const dm = await browser.newContext(), firstPlayer = await browser.newContext(), secondPlayer = await browser.newContext()
  try {
    const dmPage = await dm.newPage(), firstPage = await firstPlayer.newPage(), secondPage = await secondPlayer.newPage()
    await dmPage.goto('/')
    await dmPage.getByRole('button', { name: 'Crear sala' }).click()
    await expect(dmPage.getByText('En vivo')).toBeVisible()
    await firstPage.goto(dmPage.url())
    await firstPage.getByLabel('Nombre').fill('Juan')
    await firstPage.getByRole('button', { name: 'Entrar' }).click()
    await expect(dmPage.locator('[data-token-id]').filter({ hasText: 'Juan' })).toBeVisible()
    await secondPage.goto(dmPage.url())
    await secondPage.getByLabel('Nombre').fill('Lucía')
    await secondPage.getByRole('button', { name: 'Entrar' }).click()
    await expect(dmPage.locator('[data-token-id]').filter({ hasText: 'Lucía' })).toBeVisible()

    const token = firstPage.locator('[data-token-id]').filter({ hasText: 'Juan' })
    const tokenId = await token.getAttribute('data-token-id')
    if (!tokenId) throw new Error('Player token missing')
    const original = await token.getAttribute('style')
    const bounds = await token.boundingBox()
    if (!bounds) throw new Error('Player token has no bounds')
    await firstPage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await firstPage.mouse.down()
    await firstPage.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2 + 25, { steps: 4 })
    const dmToken = dmPage.locator(`[data-token-id="${tokenId}"]`)
    const otherPlayerToken = secondPage.locator(`[data-token-id="${tokenId}"]`)
    await expect(dmToken).toHaveClass(/token-locked/)
    await expect(otherPlayerToken).toHaveClass(/token-locked/)

    const deniedStart = await otherPlayerToken.boundingBox()
    if (!deniedStart) throw new Error('Locked token has no bounds')
    await secondPage.mouse.move(deniedStart.x + deniedStart.width / 2, deniedStart.y + deniedStart.height / 2)
    await secondPage.mouse.down()
    await secondPage.mouse.move(deniedStart.x + deniedStart.width / 2 + 60, deniedStart.y + deniedStart.height / 2 + 30, { steps: 3 })
    await secondPage.mouse.up()
    await expect(otherPlayerToken).toHaveClass(/token-locked/)

    await firstPage.mouse.up()
    await expect(dmToken).not.toHaveAttribute('style', original ?? '')
    await expect(otherPlayerToken).toHaveAttribute('style', await dmToken.getAttribute('style') ?? '')
    await expect(dmToken).not.toHaveClass(/token-locked/)
    await dmPage.getByRole('button', { name: 'Deshacer' }).click()
    await expect(dmToken).toHaveAttribute('style', original ?? '')
    await dmPage.getByRole('button', { name: 'Rehacer' }).click()
    await expect(dmToken).not.toHaveAttribute('style', original ?? '')
  } finally {
    await Promise.all([dm.close(), firstPlayer.close(), secondPlayer.close()])
  }
})
