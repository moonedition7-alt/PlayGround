import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = resolve(process.env.STATIC_DIR || resolve(projectDir, 'frontend/out'))
const port = Number(process.env.PORT || 3000)
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`)
}
if (!root.startsWith(projectDir + sep)) {
  throw new Error(`Static directory must stay inside the project: ${root}`)
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }

  const file = resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  let target = file
  try {
    if (statSync(target).isDirectory()) target = resolve(target, 'index.html')
    if (!statSync(target).isFile()) throw new Error('Not a file')
  } catch {
    response.writeHead(404).end('Not found')
    return
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(target).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} on port ${port}`)
})
