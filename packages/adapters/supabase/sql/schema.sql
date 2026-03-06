-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Agents
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Agent config (added post-MVP)
alter table public.agents add column if not exists config jsonb not null default '{}';

create index if not exists agents_owner_user_id_idx on public.agents (owner_user_id);

-- Sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_key text not null,
  display_name text,
  current boolean not null default true,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table public.sessions add column if not exists display_name text;
alter table public.sessions add column if not exists is_archived boolean not null default false;

create unique index if not exists sessions_agent_key_current_idx
  on public.sessions (agent_id, session_key)
  where current = true;

create index if not exists sessions_agent_id_idx on public.sessions (agent_id);

-- Transcript events (append-only)
create table if not exists public.transcript_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  request_id text,
  type text not null,
  content jsonb not null,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);

alter table public.transcript_events
  add column if not exists request_id text;

create index if not exists transcript_events_agent_session_created_idx
  on public.transcript_events (agent_id, session_id, created_at);

create index if not exists transcript_events_request_idx
  on public.transcript_events (agent_id, session_id, request_id);

create unique index if not exists transcript_events_request_dedupe_idx
  on public.transcript_events (agent_id, session_id, request_id, type)
  where request_id is not null
    and type in ('user_message', 'assistant_message');

-- Memory items
create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  scope_type text not null,
  scope_id uuid not null,
  type text not null,
  content text not null,
  tags text[] not null default '{}',
  sensitivity text not null,
  context_eligible boolean not null default true,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_items_agent_created_idx
  on public.memory_items (agent_id, created_at);

create index if not exists memory_items_embedding_idx
  on public.memory_items using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Usage events
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  event_type text not null,
  tokens_in integer,
  tokens_out integer,
  cost_estimate numeric,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists usage_events_agent_created_idx
  on public.usage_events (agent_id, created_at);

-- Audit events
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  agent_id uuid references public.agents(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_events_agent_created_idx
  on public.audit_events (agent_id, created_at);

-- Jobs (worker polling)
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued',
  attempts integer not null default 0,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_run_at_idx
  on public.jobs (status, run_at);

-- Chat rate limit counters (for cross-instance consistency)
create table if not exists public.chat_rate_limit_counters (
  rate_key text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (rate_key, window_seconds, window_start)
);

create index if not exists chat_rate_limit_counters_updated_idx
  on public.chat_rate_limit_counters (updated_at);

create or replace function public.consume_chat_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  retry_after_ms integer,
  current_hits integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
  v_retry_ms integer;
begin
  if p_window_seconds <= 0 or p_limit <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.chat_rate_limit_counters (
    rate_key,
    window_seconds,
    window_start,
    hits,
    updated_at
  )
  values (
    p_key,
    p_window_seconds,
    v_window_start,
    1,
    p_now
  )
  on conflict (rate_key, window_seconds, window_start)
  do update set
    hits = public.chat_rate_limit_counters.hits + 1,
    updated_at = excluded.updated_at
  where public.chat_rate_limit_counters.hits < p_limit
  returning public.chat_rate_limit_counters.hits into v_hits;

  if found then
    return query select true, 0, v_hits;
    return;
  end if;

  select c.hits
  into v_hits
  from public.chat_rate_limit_counters c
  where c.rate_key = p_key
    and c.window_seconds = p_window_seconds
    and c.window_start = v_window_start;

  v_retry_ms := greatest(
    1,
    ((extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - p_now))) * 1000)::integer
  );

  return query select false, v_retry_ms, coalesce(v_hits, p_limit);
end;
$$;

create or replace function public.claim_next_jobs(
  batch_size integer,
  now_at timestamptz default now()
)
returns setof public.jobs
language plpgsql
security definer
as $$
begin
  return query
  with claimed as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.run_at <= now_at
    order by j.created_at
    for update skip locked
    limit batch_size
  )
  update public.jobs j
  set
    status = 'processing',
    updated_at = now()
  from claimed
  where j.id = claimed.id
  returning j.*;
end;
$$;

-- Vector search helper for memory_items
create or replace function public.match_memory_items(
  query_embedding vector(1536),
  match_count integer,
  filter_agent_id uuid,
  filter_sensitivity text[] default null,
  filter_context_eligible boolean default true,
  filter_scope_type text default null,
  filter_scope_id uuid default null
)
returns table (
  id uuid,
  agent_id uuid,
  scope_type text,
  scope_id uuid,
  type text,
  content text,
  tags text[],
  sensitivity text,
  context_eligible boolean,
  embedding vector(1536),
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
language sql stable as $$
  select
    m.id,
    m.agent_id,
    m.scope_type,
    m.scope_id,
    m.type,
    m.content,
    m.tags,
    m.sensitivity,
    m.context_eligible,
    m.embedding,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memory_items m
  where m.agent_id = filter_agent_id
    and (filter_context_eligible is null or m.context_eligible = filter_context_eligible)
    and (filter_sensitivity is null or m.sensitivity = any(filter_sensitivity))
    and (filter_scope_type is null or m.scope_type = filter_scope_type)
    and (filter_scope_id is null or m.scope_id = filter_scope_id)
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- Agent templates (marketplace MVP)
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

-- Chat attachments (multimodal MVP – images + PDF)
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_id text not null,
  file_name text not null,
  content_type text not null,
  storage_path text not null,
  byte_size integer not null default 0,
  text_content text,
  created_at timestamptz not null default now()
);
alter table public.chat_attachments add column if not exists text_content text;

create index if not exists chat_attachments_session_idx
  on public.chat_attachments (agent_id, session_id, created_at desc);

-- Workspaces (multi-tenant foundation)
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

-- Workspace members
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');

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

-- Optional workspace scope on agents (null = personal agent)
alter table public.agents add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists agents_workspace_idx on public.agents (workspace_id) where workspace_id is not null;

-- Agent visibility: private | workspace | public
alter table public.agents add column if not exists visibility text not null default 'private';
alter table public.agents drop constraint if exists agents_visibility_check;
alter table public.agents add constraint agents_visibility_check check (visibility in ('private', 'workspace', 'public'));
create index if not exists agents_visibility_idx on public.agents (visibility) where visibility != 'private';

-- Agent visibility: private (owner only) | workspace (members visible) | public (all visible)
alter table public.agents add column if not exists visibility text not null default 'private';
