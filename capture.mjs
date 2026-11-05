import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(fileURLToPath(import.meta.url))
const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
const runtime = join(process.env.HOME || '', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))

function timed(label, operation) {
  const started = performance.now()
  return Promise.resolve().then(operation).finally(() => {
    console.log(`TIME ${label}: ${((performance.now() - started) / 1000).toFixed(2)}s`)
  })
}

function fail(message, exitCode = 1) {
  const error = new Error(message)
  error.exitCode = exitCode
  throw error
}

if (!url || !output) fail('Set CAPTURE_URL and CAPTURE_DIR.')
let target
try {
  target = new URL(url)
  if (!['http:', 'https:'].includes(target.protocol)) fail('CAPTURE_URL must use HTTP or HTTPS.')
} catch (error) {
  if (error.exitCode) throw error
  fail(`Invalid CAPTURE_URL: ${url}`)
}
if (!isAbsolute(output)) fail('CAPTURE_DIR must be an absolute path.')
const outputDir = resolve(output)
const fromProject = relative(projectDir, outputDir)
if (fromProject === '' || (!fromProject.startsWith(`..${sep}`) && fromProject !== '..')) {
  fail('CAPTURE_DIR must be outside the project directory.')
}

let chromium
let browser
let exitCode = 1
try {
  let config
  try {
    config = JSON.parse(readFileSync(
      join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
    chromium = require('playwright').chromium
    if (process.platform === 'linux') {
      process.env.DISPLAY ||= `:${readFileSync(join(runtime, 'display'), 'utf8').trim().replace(/^:/, '')}`
    }
  } catch (error) {
    error.exitCode = 75
    throw error
  }
  await timed('create capture directory', () => mkdirSync(outputDir, { recursive: true }))
  browser = await timed('launch browser', () => chromium.launch({
    ...config.browser.launchOptions,
    timeout: 30000,
  }).catch(error => { error.exitCode = 75; throw error }))

  const origin = target.origin
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await timed(`${name} page setup`, () => browser.newPage({ viewport: { width, height } })
      .catch(error => { error.exitCode = 75; throw error }))
    const pageErrors = []
    const failedResponses = []
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 400) {
        failedResponses.push(`HTTP ${response.status()} ${response.url()}`)
      }
    })

    let response
    try {
      response = await timed(`${name} navigation`, () => page.goto(url, {
        waitUntil: 'load',
        timeout: 45000,
      }))
    } catch (error) {
      error.exitCode = 75
      throw error
    }
    if (!response) fail(`${name}: navigation returned no HTTP response.`, 75)
    if (!response.ok()) {
      fail(`${name}: preview returned HTTP ${response.status()}.`,
        [408, 429, 500, 502, 503, 504].includes(response.status()) ? 75 : 1)
    }

    await timed(`${name} rendered-content wait`, async () => {
      await page.locator(process.env.CAPTURE_READY_SELECTOR || 'body').waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.fonts.status === 'loaded')
      await page.waitForFunction(() => (document.body?.innerText || '').trim().length > 0)
    }).catch(error => {
      error.exitCode = error.name === 'TimeoutError' ? 1 : error.exitCode || 1
      throw error
    })
    if (pageErrors.length) fail(`${name}: browser rendering error: ${pageErrors.join('; ')}`)
    if (failedResponses.length) fail(`${name}: failed page resources: ${failedResponses.join('; ')}`)

    await timed(`${name} screenshot`, () => page.screenshot({
      path: join(outputDir, `final-${name}.png`),
      fullPage: false,
      timeout: 30000,
    }).catch(error => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) error.exitCode = 75
      throw error
    }))
    await timed(`${name} page close`, () => page.close())
    console.log(`Captured ${name}: ${width}x${height} from ${url}`)
  }
  exitCode = 0
} catch (error) {
  console.error(error)
  exitCode = error.exitCode || 1
} finally {
  if (browser) {
    await timed('close browser', () => browser.close()).catch(error => {
      console.error(error)
      exitCode ||= 75
    })
  }
}
process.exitCode = exitCode
