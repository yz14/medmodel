import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const root = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_ZIP = path.join(root, 'fixtures', 'chest-mini.zip')
const FIXTURE_PID = path.join(root, 'fixtures', 'chest-mini.patient_id')
const API = process.env.VOXFLOW_API_BASE ?? 'http://127.0.0.1:8000'

function fixturePatientId(): string {
  return fs.readFileSync(FIXTURE_PID, 'utf8').trim()
}

async function selectModel(page: Page, label: RegExp) {
  await page.getByTestId('model-select').click()
  await page.getByRole('option', { name: label }).click()
}

async function runLungSegAndAssertOverlay(page: Page) {
  await expect(page.getByTestId('ai-panel')).toBeVisible()
  await expect(page.getByTestId('stack-viewport')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('model-select')).toBeVisible({ timeout: 20_000 })

  await selectModel(page, /肺实质分割/)
  await page.getByTestId('run-inference').click()

  // Cache-hit / fast workers may skip the progress panel and jump to 检出.
  await expect(page.getByTestId('findings-list')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('finding-mask').first()).toBeVisible()

  await page.getByRole('tab', { name: '图层' }).click()
  const masks = page.getByTestId('show-masks')
  await expect(masks).toBeVisible()
  await expect(masks).toHaveAttribute('data-state', 'checked')
  await expect(page.getByTestId('stack-viewport')).toBeVisible()
}

test.describe('VoxFlow smoke', () => {
  test('upload ZIP → viewer → lung_seg → findings overlay', async ({ page }) => {
    await page.goto('/data')
    await page.getByTestId('upload-open').click()
    await expect(page.getByRole('heading', { name: '上传 DICOM / ZIP' })).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles(FIXTURE_ZIP)
    await expect(page.getByText(/chest-mini\.zip/i)).toBeVisible()
    await page.getByRole('button', { name: '开始上传' }).click()

    // Dialog closes on success; table shows the ingested study.
    await expect(page.getByTestId('upload-open')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('data-table')).toBeVisible()
    const patientId = fixturePatientId()
    await expect(page.getByText(patientId).first()).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('open-viewer-row').first().click()
    await expect(page).toHaveURL(/\/viewer\//)
    await runLungSegAndAssertOverlay(page)
  })

  test('seed-demo API → viewer → lung_seg → findings overlay', async ({ page, request }) => {
    const seed = await request.post(`${API}/api/v1/studies/seed-demo`)
    expect(seed.ok()).toBeTruthy()
    const study = await seed.json()
    expect(study.study_uid).toBeTruthy()

    await page.goto(`/viewer/${encodeURIComponent(study.study_uid)}`)
    await runLungSegAndAssertOverlay(page)
  })
})
