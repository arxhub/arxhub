import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame } from './fixtures'

export async function openBlockSettings(page: Page, block: Locator, name: string) {
  const mobile = await isMobileFrame(page)
  await block.scrollIntoViewIfNeeded()
  if (mobile) await block.click({ position: { x: 8, y: 8 } })
  else await block.hover({ position: { x: 8, y: 8 } })
  await page.getByRole('button', { name: `${name} settings`, exact: true }).click()
  return page.getByRole(mobile ? 'dialog' : 'complementary', { name, exact: true })
}
export async function openProperties(page: Page) {
  const mobile = await isMobileFrame(page)
  await page.getByRole('button', { name: 'Document tools', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click()
  const panel = page.getByRole(mobile ? 'dialog' : 'complementary', { name: 'Properties', exact: true })
  await expect(panel).toBeVisible()
  return panel
}
export async function closeSettings(page: Page) {
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
}
