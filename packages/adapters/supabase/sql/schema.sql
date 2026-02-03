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

create index if not exists agents_owner_user_id_idx on public.agents (owner_user_id);

-- Sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_key text not null,
  current boolean not null default true,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create unique index if not exists sessions_agent_key_current_idx
  on public.sessions (agent_id, session_key)
  where current = true;

create index if not exists sessions_agent_id_idx on public.sessions (agent_id);

-- Transcript events (append-only)
create table if not exists public.transcript_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  type text not null,
  content jsonb not null,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);

create index if not exists transcript_events_agent_session_created_idx
  on public.transcript_events (agent_id, session_id, created_at);

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

-- Vector search helper for memory_items
create or replace function public.match_memory_items(
  query_embedding vector(1536),
  match_count integer,
  filter_agent_id uuid,
  filter_sensitivity text[] default null,
  filter_context_eligible boolean default true
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
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
