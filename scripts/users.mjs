#!/usr/bin/env node
/**
 * 查看/删除登录账号（需要 Supabase secret key，只在自己电脑上运行，不要提交到仓库）。
 * 账号通过 GitHub 登录产生：临时打开 Supabase 的注册开关，让对方用 GitHub 登录一次，再关掉即可。
 *
 * 把 secret key 写进项目根目录的 .env.local（已被 .gitignore 忽略）：
 *   SUPABASE_SECRET_KEY=sb_secret_xxx
 *
 * 用法：
 *   npm run users -- list
 *   npm run users -- del <GitHub 用户名或邮箱>
 */
import fs from 'node:fs'

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const URL = process.env.SUPABASE_URL || 'https://whyjnneqttffqjaydhen.supabase.co'
const KEY = process.env.SUPABASE_SECRET_KEY
if (!KEY) {
  console.error('缺少 SUPABASE_SECRET_KEY：请写入 .env.local 或设置环境变量')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(`${URL}/auth/v1/admin${path}`, {
    method,
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || `HTTP ${res.status}`)
  return data
}

const nameOf = (u) => u.user_metadata?.user_name ?? u.email ?? u.id

async function findUser(who) {
  const { users } = await api('GET', '/users?per_page=1000')
  const q = who.toLowerCase()
  const user = users.find((u) => u.email?.toLowerCase() === q || u.user_metadata?.user_name?.toLowerCase() === q)
  if (!user) throw new Error(`找不到用户 ${who}`)
  return user
}

const [cmd, who] = process.argv.slice(2)
try {
  if (cmd === 'list') {
    const { users } = await api('GET', '/users?per_page=1000')
    if (users.length === 0) console.log('还没有用户')
    for (const u of users) {
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('zh-CN') : '从未登录'
      console.log(`${nameOf(u)}\t${u.app_metadata?.provider ?? ''}\t最近登录：${last}`)
    }
  } else if (cmd === 'del' && who) {
    const user = await findUser(who)
    await api('DELETE', `/users/${user.id}`)
    console.log(`已删除：${nameOf(user)}（云端进度一并删除）`)
  } else {
    console.log('用法：npm run users -- list | del <GitHub 用户名或邮箱>')
    process.exit(1)
  }
} catch (e) {
  console.error(`失败：${e.message}`)
  process.exit(1)
}
