-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- 当 supabase db push 因网络/TLS 无法连接时使用

-- 1. agents_public_read 策略（若已存在会报错，可忽略）
drop policy if exists "agents_public_read" on public.agents;
create policy "agents_public_read" on public.agents
  for select
  using (visibility = 'public');

-- 2. 对话分叉：sessions 表新增 parent_session_id、fork_from_event_id
alter table public.sessions add column if not exists parent_session_id uuid references public.sessions(id) on delete set null;
alter table public.sessions add column if not exists fork_from_event_id uuid references public.transcript_events(id) on delete set null;
create index if not exists sessions_parent_session_id_idx on public.sessions(parent_session_id) where parent_session_id is not null;
