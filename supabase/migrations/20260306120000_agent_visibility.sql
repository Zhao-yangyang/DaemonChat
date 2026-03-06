-- Agent 可见性控制：private | workspace | public
-- private: 仅 owner 可见
-- workspace: 同 workspace 成员可见
-- public: 所有人可见

alter table public.agents
  add column if not exists visibility text not null default 'private';

alter table public.agents
  drop constraint if exists agents_visibility_check;

alter table public.agents
  add constraint agents_visibility_check
  check (visibility in ('private', 'workspace', 'public'));

create index if not exists agents_visibility_idx
  on public.agents (visibility)
  where visibility != 'private';
