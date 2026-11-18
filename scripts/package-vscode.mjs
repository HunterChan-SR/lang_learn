// 打包 VS Code 插件：把网页构建产物 dist/ 复制到 vscode/web/，再用 vsce 打成 .vsix
// 用法：npm run vscode:package（会先构建网页）
// 产物：release/langLearn-<版本>-vscode.vsix
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ext = path.join(root, 'vscode')
const dist = path.join(root, 'dist')

const rootVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
const extVersion = JSON.parse(readFileSync(path.join(ext, 'package.json'), 'utf8')).version
if (rootVersion !== extVersion) {
  console.error(`版本不一致：package.json 为 ${rootVersion}，vscode/package.json 为 ${extVersion}（npm version 会自动同步）`)
  process.exit(1)
}
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('没有找到 dist/index.html，请先运行 npm run build')
  process.exit(1)
}

rmSync(path.join(ext, 'web'), { recursive: true, force: true })
cpSync(dist, path.join(ext, 'web'), { recursive: true })
cpSync(path.join(root, 'LICENSE'), path.join(ext, 'LICENSE'))

mkdirSync(path.join(root, 'release'), { recursive: true })
const out = path.join(root, 'release', `langLearn-${rootVersion}-vscode.vsix`)
const vsce = path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce')
execFileSync(process.execPath, [vsce, 'package', '--no-dependencies', '--allow-missing-repository', '--out', out], { cwd: ext, stdio: 'inherit' })
console.log(`已生成 ${path.relative(root, out)}`)
