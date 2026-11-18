import { isKind } from '../lib/practice'
import type { FileKind } from './Code'

/** 代码皮肤里，每个页面伪装成一个“文件” */
export interface CodeFile {
  /** 路由 */
  path: string
  /** 文件名 */
  name: string
  kind: FileKind
  /** 标签页标题（预览类页面带 Preview 前缀，设置页为 Settings） */
  title: string
  /** 面包屑中的目录 */
  dir: string[]
  /** 是否显示为代码（有行号、面包屑）；预览和设置页不是 */
  code: boolean
  /** 常驻的“已打开文件” */
  pinned?: boolean
}

const file = (path: string, name: string, kind: FileKind, dir: string[], extra: Partial<CodeFile> = {}): CodeFile => ({
  path,
  name,
  kind,
  title: name,
  dir,
  code: true,
  ...extra,
})

export const PINNED: CodeFile[] = [
  file('/', 'today.ts', 'ts', ['src'], { pinned: true }),
  file('/words', 'words.json', 'json', ['data'], { pinned: true }),
  file('/quiz', 'quiz.config.ts', 'ts', [], { pinned: true }),
  file('/practice', 'practice.md', 'md', ['docs'], { pinned: true, title: 'Preview practice.md', code: false }),
  file('/me', 'settings.json', 'gear', ['.vscode'], { pinned: true, title: 'Settings', code: false }),
]

/** 当前路由对应的文件 */
export function fileFor(path: string, query: URLSearchParams): CodeFile {
  if (path === '/study') return file('/study', 'session.ts', 'ts', ['src'])
  if (path === '/quiz' && query.get('run') === '1') return file('/quiz', 'quiz.test.ts', 'ts', ['test'])
  if (path === '/practice/run') {
    const kind = query.get('kind')
    const name = `${isKind(kind) ? kind : 'exercise'}.md`
    return file('/practice/run', name, 'md', ['docs'], { title: `Preview ${name}`, code: false })
  }
  if (path === '/practice/mock') return file('/practice/mock', 'mock.md', 'md', ['docs'], { title: 'Preview mock.md', code: false })
  const pinned = PINNED.find((f) => (f.path === '/' ? path === '/' : path.startsWith(f.path)))
  return pinned ?? PINNED[0]
}
