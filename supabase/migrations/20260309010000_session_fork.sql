-- 对话分叉：从任意消息创建分支会话
alter table public.sessions add column if not exists parent_session_id uuid references public.sessions(id) on delete set null;
alter table public.sessions add column if not exists fork_from_event_id uuid references public.transcript_events(id) on delete set null;
create index if not exists sessions_parent_session_id_idx on public.sessions(parent_session_id) where parent_session_id is not null;
