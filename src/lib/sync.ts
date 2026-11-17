import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { desktop, DESKTOP_AUTH_CALLBACK } from './desktop'
import { mergeData, stableStringify } from './merge'
import { clearLocalProgress, getData, normalize, replaceData, subscribeData } from './store'
import { getSupabase } from './supabase'

/**
 * 登录与云同步。
 * 云端表 progress 每个用户一行，data 列存整份学习进度（AppData）。
 * 每次同步：拉取云端 -> 与本机合并（mergeData）-> 有变化则写回本机/云端。
 * 触发时机：登录后、本机数据变化 3 秒后、回到页面时、网络恢复时。
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncState {
  auth: AuthStatus
  /** GitHub 用户名 */
  name: string | null
  avatar: string | null
  sync: SyncStatus
  lastSync: number | null
  error: string | null
}

let state: SyncState = { auth: 'loading', name: null, avatar: null, sync: 'idle', lastSync: null, error: null }
const listeners = new Set<() => void>()

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

const getState = () => state

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, getState, getState)
}

const PUSH_DELAY = 3000

let started = false
let userId: string | null = null
let running: Promise<void> | null = null
let again = false
/** 正在把合并结果写回本机，此时的数据变化不需要再触发同步 */
let applying = false
let lastSyncedJson: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined

/** 跳转 GitHub 授权前记下当前页面，回来后恢复 */
const RETURN_KEY = 'cet-words:return'

function describeOAuthError(params: URLSearchParams): string | null {
  const desc = params.get('error_description')
  const code = params.get('error_code') ?? params.get('error')
  if (!desc && !code) return null
  if (/signups? not allowed/i.test(desc ?? '') || code === 'signup_disabled') return '这个 GitHub 账号没有使用权限'
  if (code === 'access_denied') return '已取消 GitHub 授权'
  return desc || code
}

/** GitHub 授权失败时，Supabase 会带着 ?error=... 跳回来；读出错误并清理地址栏 */
function takeOAuthError(): string | null {
  const url = new URL(window.location.href)
  const err = describeOAuthError(url.searchParams)
  if (!err) return null
  for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k)
  window.history.replaceState(window.history.state, '', url.toString())
  return err
}

/**
 * 桌面版：GitHub 授权在系统浏览器里完成，Supabase 回调 cet-words://auth-callback?code=…，
 * 主进程把链接转过来，这里用 code 换取登录状态（PKCE 校验码在发起登录时已存在本机）。
 */
async function handleDesktopCallback(link: string) {
  let params: URLSearchParams
  try {
    const u = new URL(link)
    params = new URLSearchParams(u.search || u.hash.replace(/^#/, ''))
  } catch {
    return
  }
  const err = describeOAuthError(params)
  if (err) {
    set({ error: err })
    return
  }
  const code = params.get('code')
  if (!code) return
  try {
    const sb = await getSupabase()
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) throw error
  } catch (e) {
    set({ error: describeError(e) })
  }
}

function restoreReturnRoute() {
  let target: string | null = null
  try {
    target = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // 隐私模式下 sessionStorage 可能不可用
  }
  if (target && (!window.location.hash || window.location.hash === '#/')) window.location.replace(target)
}

export function initSync() {
  if (started) return
  started = true
  const oauthError = takeOAuthError()
  void (async () => {
    try {
      const sb = await getSupabase()
      const { data } = await sb.auth.getSession()
      onSession(data.session)
      if (oauthError) set({ error: oauthError })
      restoreReturnRoute()
      sb.auth.onAuthStateChange((_event, session) => {
        // 官方建议不要在回调里直接调用 Supabase 方法，放到下一个任务执行
        setTimeout(() => onSession(session), 0)
      })
    } catch (e) {
      set({ auth: 'signedOut', error: describeError(e) })
    }
  })()
  subscribeData(onLocalChange)
  desktop?.onAuthCallback((link) => void handleDesktopCallback(link))
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
    else flushPending()
  })
}

function onSession(session: Session | null) {
  const uid = session?.user.id ?? null
  if (uid === userId && state.auth !== 'loading') return
  userId = uid
  if (session) {
    const meta = session.user.user_metadata as { user_name?: string; preferred_username?: string; avatar_url?: string }
    set({
      auth: 'signedIn',
      name: meta.user_name ?? meta.preferred_username ?? session.user.email ?? null,
      avatar: meta.avatar_url ?? null,
      error: null,
    })
    void syncNow()
  } else {
    lastSyncedJson = null
    set({ auth: 'signedOut', name: null, avatar: null, sync: 'idle', lastSync: null })
  }
}

function onLocalChange() {
  if (applying || !userId) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    if (stableStringify(getData()) !== lastSyncedJson) void syncNow()
  }, PUSH_DELAY)
}

/** 页面切到后台时，立即同步还没上传的修改 */
function flushPending() {
  if (!pushTimer) return
  clearTimeout(pushTimer)
  pushTimer = undefined
  void syncNow()
}

/** 立即同步；同步进行中再次调用会在本轮结束后补一轮 */
export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again && userId)
  })().finally(() => {
    running = null
  })
  return running
}

async function syncOnce() {
  const uid = userId
  if (!uid) return
  if (!navigator.onLine) {
    set({ sync: 'offline' })
    return
  }
  set({ sync: 'syncing' })
  try {
    const sb = await getSupabase()
    const { data, error } = await sb.from('progress').select('data').eq('user_id', uid).maybeSingle()
    if (error) throw error
    if (uid !== userId) return // 同步期间切换了账号

    const local = getData()
    const remote = data ? normalize(data.data) : null
    const merged = remote ? mergeData(local, remote) : local
    const mergedJson = stableStringify(merged)

    if (mergedJson !== stableStringify(local)) {
      applying = true
      try {
        replaceData(merged)
      } finally {
        applying = false
      }
    }
    if (!remote || mergedJson !== stableStringify(remote)) {
      const { error: upErr } = await sb
        .from('progress')
        .upsert({ user_id: uid, data: merged, updated_at: new Date().toISOString() })
      if (upErr) throw upErr
    }
    lastSyncedJson = mergedJson
    set({ sync: 'idle', lastSync: Date.now(), error: null })
  } catch (e) {
    set({ sync: navigator.onLine ? 'error' : 'offline', error: describeError(e) })
  }
}

/** 跳转到 GitHub 授权页；成功时页面会离开（桌面版为打开系统浏览器），失败返回错误信息 */
export async function signInWithGitHub(): Promise<string | null> {
  try {
    const sb = await getSupabase()
    if (desktop) {
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: DESKTOP_AUTH_CALLBACK, skipBrowserRedirect: true },
      })
      if (error) return describeError(error)
      if (!data.url) return '无法获取登录地址'
      set({ error: null })
      await desktop.openExternal(data.url)
      return null
    }
    try {
      sessionStorage.setItem(RETURN_KEY, window.location.hash || '#/me')
    } catch {
      // ignore
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
    return error ? describeError(error) : null
  } catch (e) {
    return describeError(e)
  }
}

/**
 * 退出登录：先把本机进度同步到云端，再清空本机进度。
 * 同步失败时返回错误信息，除非 force=true（会丢失未同步的进度）。
 */
export async function signOut(force = false): Promise<string | null> {
  await syncNow()
  if (!force && (state.sync === 'error' || state.sync === 'offline')) {
    return state.error ?? '当前无法连接云端'
  }
  clearTimeout(pushTimer)
  pushTimer = undefined
  // 先清空本机再通知 Supabase：signOut 会触发 SIGNED_OUT 回调，
  // 必须保证界面切回“未登录”时本机进度已经清掉
  userId = null
  lastSyncedJson = null
  clearLocalProgress()
  set({ auth: 'signedOut', name: null, avatar: null, sync: 'idle', lastSync: null, error: null })
  try {
    const sb = await getSupabase()
    await sb.auth.signOut({ scope: 'local' })
  } catch {
    // 网络失败也没关系，本机进度已清空；下次登录会重新从云端拉取
  }
  return null
}

function describeError(e: unknown): string {
  const err = e as { code?: string; message?: string; status?: number; name?: string } | null
  const code = err?.code ?? ''
  const msg = err?.message ?? ''
  if (code === 'user_banned') return '该账号已被停用'
  if (code === 'provider_disabled' || /provider is not enabled/i.test(msg)) return 'GitHub 登录尚未在 Supabase 中启用'
  if (code === 'over_request_rate_limit') return '尝试次数过多，请稍后再试'
  if (code === 'PGRST205') return '云端数据表还没有创建（需要执行 supabase/schema.sql）'
  if (code === '42501') return '没有权限访问云端数据'
  if (err?.name === 'AuthRetryableFetchError' || /fetch|network|load failed/i.test(msg)) return '网络连接失败'
  return msg || '未知错误'
}
