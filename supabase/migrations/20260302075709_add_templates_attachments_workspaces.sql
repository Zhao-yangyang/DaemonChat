-- ============================================================
-- Migration: add_templates_attachments_workspaces
-- Description: 新增 agent_templates, chat_attachments,
--              workspaces, workspace_members 表及相关 RLS 策略
-- ============================================================

-- 1. Agent templates (marketplace MVP)
create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null,
  name text not null,
  description text not null default '',
  config jsonb not null default '{}',
  is_public boolean not null default false,
  clone_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_templates_public_idx
  on public.agent_templates (is_public, created_at desc)
  where is_public = true;

create index if not exists agent_templates_author_idx
  on public.agent_templates (author_user_id);

-- 2. Chat attachments (multimodal MVP – images)
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_id text not null,
  file_name text not null,
  content_type text not null,
  storage_path text not null,
  byte_size integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists chat_attachments_session_idx
  on public.chat_attachments (agent_id, session_id, created_at desc);

-- 3. Workspaces (multi-tenant foundation)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_idx
  on public.workspaces (owner_user_id);

-- 4. Workspace members
do $$ begin
  create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'member',
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members (workspace_id);

-- 5. Optional workspace scope on agents (null = personal agent)
alter table public.agents add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists agents_workspace_idx on public.agents (workspace_id) where workspace_id is not null;

-- ============================================================
-- RLS policies for new tables
-- ============================================================

-- Agent templates RLS
alter table public.agent_templates enable row level security;

create policy "templates_public_read" on public.agent_templates
  for select
  using (is_public = true or author_user_id = auth.uid());

create policy "templates_author_insert" on public.agent_templates
  for insert
  with check (author_user_id = auth.uid());

create policy "templates_author_update" on public.agent_templates
  for update
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "templates_author_delete" on public.agent_templates
  for delete
  using (author_user_id = auth.uid());

-- Chat attachments RLS
alter table public.chat_attachments enable row level security;

create policy "attachments_owner_read" on public.chat_attachments
  for select
  using (user_id = auth.uid());

create policy "attachments_owner_insert" on public.chat_attachments
  for insert
  with check (user_id = auth.uid());

create policy "attachments_owner_delete" on public.chat_attachments
  for delete
  using (user_id = auth.uid());

-- Workspaces RLS
alter table public.workspaces enable row level security;

create policy "workspaces_member_read" on public.workspaces
  for select
  using (
    owner_user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = workspaces.id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "workspaces_owner_insert" on public.workspaces
  for insert
  with check (owner_user_id = auth.uid());

create policy "workspaces_owner_update" on public.workspaces
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "workspaces_owner_delete" on public.workspaces
  for delete
  using (owner_user_id = auth.uid());

-- Workspace members RLS
alter table public.workspace_members enable row level security;

create policy "ws_members_read" on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_members.workspace_id
        and wm2.user_id = auth.uid()
    )
  );

create policy "ws_members_admin_insert" on public.workspace_members
  for insert
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_members.workspace_id
        and wm2.user_id = auth.uid()
        and wm2.role in ('owner', 'admin')
    )
  );

create policy "ws_members_admin_delete" on public.workspace_members
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = auth.uid()
    )
  );
