import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(root, '../../backend')
const fixtureZip = path.resolve(root, 'fixtures/chest-mini.zip')

/**
 * Build a tiny synthetic CT ZIP for the upload→inference smoke path.
 * Keeps binary fixtures out of git.
 */
export default function globalSetup() {
  fs.mkdirSync(path.dirname(fixtureZip), { recursive: true })
  execFileSync('python', ['scripts/write_e2e_upload_fixture.py'], {
    cwd: backend,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONPATH: backend,
    },
  })
  if (!fs.existsSync(fixtureZip)) {
    throw new Error(`E2E fixture missing after generation: ${fixtureZip}`)
  }
}
