import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// SVG 是唯一设计源，各尺寸直接从矢量渲染，避免重复缩放造成模糊。
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { Resvg } = require('@resvg/resvg-js')
const source = await readFile(path.join(root, 'assets/brand/logo.svg'), 'utf8')
const iconset = path.join(root, 'build/appicon.iconset')
const publicDir = path.join(root, 'frontend/public')
await mkdir(iconset, { recursive: true })
await mkdir(publicDir, { recursive: true })

const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
await writeFile(path.join(root, 'build/appicon.png'), render(source, 1024))
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const suffix = scale === 2 ? '@2x' : ''
    await writeFile(path.join(iconset, `icon_${size}x${size}${suffix}.png`), render(source, size * scale))
  }
}
// 使用项目固定版本的 Wails 编码 ICNS，避免系统 iconutil 在沙盒下误报 Invalid Iconset。
execFileSync(path.join(root, '.tools/wails3'), [
  'generate', 'icons', '-input', path.join(root, 'build/appicon.png'),
  '-macfilename', path.join(root, 'build/appicon.icns'), '-windowsfilename', '',
])

// 应用内标识复用同一组笔画，去掉 Dock 图标的透明留白。
const mark = source.match(/<g id="mark"[\s\S]*?<\/g>/)?.[0]
if (!mark) throw new Error('logo.svg 中缺少 mark 图形')
const symbol = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="240 260 544 504" fill="none">${mark}</svg>\n`
await writeFile(path.join(publicDir, 'logo-mark.svg'), symbol)
await writeFile(path.join(publicDir, 'favicon.svg'), source)
await writeFile(path.join(publicDir, 'favicon-32.png'), render(source, 32))
await writeFile(path.join(publicDir, 'apple-touch-icon.png'), render(source, 180))
console.log('已生成 Dock PNG、10 个 iconset 尺寸、ICNS 和前端标识')
