-- langLearn：云端学习进度
-- 在 Supabase 后台 SQL Editor 中执行（可以重复执行）

-- 每个用户一行，data 存整份学习进度（前端的 AppData）
create table if not exists public.progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 行级安全：每个人只能读写自己的那一行
alter table public.progress enable row level security;

revoke all on table public.progress from anon;
grant select, insert, update on table public.progress to authenticated;

drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own" on public.progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "progress_insert_own" on public.progress;
create policy "progress_insert_own" on public.progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "progress_update_own" on public.progress;
create policy "progress_update_own" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 保活：GitHub Actions 定期调用，避免免费项目因 7 天无活动被暂停
create or replace function public.ping()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
