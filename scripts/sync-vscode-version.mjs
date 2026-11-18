// npm version 之后把版本号同步到 vscode/package.json（由 package.json 的 "version" 脚本调用）
import { readFileSync, writeFileSync } from 'node:fs'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const file = 'vscode/package.json'
const text = readFileSync(file, 'utf8')
writeFileSync(file, text.replace(/"version": "[^"]+"/, `"version": "${version}"`))
console.log(`vscode/package.json -> ${version}`)
