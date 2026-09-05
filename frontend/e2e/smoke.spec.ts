import { expect, test } from '@playwright/test'

test.describe('VoxFlow smoke', () => {
  test('seed demo → viewer → run inference → findings overlay', async ({ page, request }) => {
    // Prefer API seed for determinism; UI still exercises the viewer/AI path.
    const seed = await request.post('http://127.0.0.1:8000/api/v1/studies/seed-demo')
    expect(seed.ok()).toBeTruthy()
    const study = await seed.json()
    expect(study.study_uid).toBeTruthy()

    await page.goto(`/viewer/${encodeURIComponent(study.study_uid)}`)
    await expect(page.getByText('AI 分析')).toBeVisible()
    await expect(page.getByTestId('stack-viewport')).toBeVisible({ timeout: 20_000 })

    // Wait for models + frames to settle
    await expect(page.getByTestId('model-select')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('model-select').selectOption('lung_seg')

    await page.getByTestId('run-inference').click()
    await expect(page.getByTestId('task-progress')).toBeVisible({ timeout: 10_000 })

    await expect(page.getByTestId('findings-list')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('finding-mask').first()).toBeVisible()

    // Overlay controls present after success
    await expect(page.getByText('显示分割掩膜')).toBeVisible()
  })
})
