import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 项目配置。
 * publishable key 本来就是给浏览器用的，可以公开；数据安全由数据库的 RLS 策略保证
 * （见 supabase/schema.sql）。千万不要把 secret key 写到前端代码里。
 *
 * fork 本项目时，可以用环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_KEY 换成自己的项目。
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://whyjnneqttffqjaydhen.supabase.co'
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_h_LTzpGqOm3fE9VepzbZjg_hruMn_pL'

let client: Promise<SupabaseClient> | null = null

/** 按需加载 SDK，不影响首屏速度 */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        // PKCE：GitHub 授权后以 ?code= 回到页面，不会和 #/ 开头的 hash 路由冲突
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cet-words:auth',
      },
    }),
  )
  return client
}
