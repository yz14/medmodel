import { expect, test } from '@playwright/test'

test.describe('CS3D spike', () => {
  test('seed demo → /viewer-cs3d loads experimental viewport shell', async ({ page, request }) => {
    const seed = await request.post('http://127.0.0.1:8000/api/v1/studies/seed-demo')
    expect(seed.ok()).toBeTruthy()
    const study = await seed.json()

    await page.goto(`/viewer-cs3d/${encodeURIComponent(study.study_uid)}`)
    await expect(page.getByTestId('viewer-cs3d-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Cornerstone3D Spike')).toBeVisible()
    await expect(page.getByTestId('cs3d-viewport')).toBeVisible({ timeout: 30_000 })
    // Status reaches ready or at least leaves pure loading with overlay text
    await expect(page.getByTestId('cs3d-viewport')).toContainText(/CS3D spike/, { timeout: 60_000 })
  })
})
