import { expect, test } from '@playwright/test'

/**
 * N-F9: CS3D is evaluation-only (R12). Not part of the hospital delivery path.
 * Keep this spec for manual/experimental runs; main smoke stays on /viewer.
 */
test.describe('CS3D spike (experimental)', () => {
  test.skip(
    !process.env.VOXFLOW_E2E_CS3D,
    'Set VOXFLOW_E2E_CS3D=1 to run CS3D spike checks',
  )

  test('seed demo → /viewer-cs3d loads experimental viewport shell', async ({ page, request }) => {
    const seed = await request.post('http://127.0.0.1:8000/api/v1/studies/seed-demo')
    expect(seed.ok()).toBeTruthy()
    const study = await seed.json()

    await page.goto(`/viewer-cs3d/${encodeURIComponent(study.study_uid)}`)
    await expect(page.getByTestId('viewer-cs3d-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Cornerstone3D Spike')).toBeVisible()
    await expect(page.getByTestId('cs3d-viewport')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('cs3d-viewport')).toContainText(/CS3D spike/, { timeout: 60_000 })
  })
})
