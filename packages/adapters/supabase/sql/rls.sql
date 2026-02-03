-- Enable RLS
alter table public.agents enable row level security;
alter table public.sessions enable row level security;
alter table public.transcript_events enable row level security;
alter table public.memory_items enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_events enable row level security;

-- Agents
create policy "agents_owner_read" on public.agents
  for select
  using (owner_user_id = auth.uid());

create policy "agents_owner_write" on public.agents
  for insert
  with check (owner_user_id = auth.uid());

create policy "agents_owner_update" on public.agents
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "agents_owner_delete" on public.agents
  for delete
  using (owner_user_id = auth.uid());

-- Sessions
create policy "sessions_owner_read" on public.sessions
  for select
  using (exists (
    select 1 from public.agents
    where agents.id = sessions.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "sessions_owner_write" on public.sessions
  for insert
  with check (exists (
    select 1 from public.agents
    where agents.id = sessions.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "sessions_owner_update" on public.sessions
  for update
  using (exists (
    select 1 from public.agents
    where agents.id = sessions.agent_id
      and agents.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.agents
    where agents.id = sessions.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "sessions_owner_delete" on public.sessions
  for delete
  using (exists (
    select 1 from public.agents
    where agents.id = sessions.agent_id
      and agents.owner_user_id = auth.uid()
  ));

-- Transcript events (append-only: allow insert/select only)
create policy "transcripts_owner_read" on public.transcript_events
  for select
  using (exists (
    select 1 from public.agents
    where agents.id = transcript_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "transcripts_owner_write" on public.transcript_events
  for insert
  with check (exists (
    select 1 from public.agents
    where agents.id = transcript_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));

-- Memory items
create policy "memory_owner_read" on public.memory_items
  for select
  using (exists (
    select 1 from public.agents
    where agents.id = memory_items.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "memory_owner_write" on public.memory_items
  for insert
  with check (exists (
    select 1 from public.agents
    where agents.id = memory_items.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "memory_owner_update" on public.memory_items
  for update
  using (exists (
    select 1 from public.agents
    where agents.id = memory_items.agent_id
      and agents.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.agents
    where agents.id = memory_items.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "memory_owner_delete" on public.memory_items
  for delete
  using (exists (
    select 1 from public.agents
    where agents.id = memory_items.agent_id
      and agents.owner_user_id = auth.uid()
  ));

-- Usage events
create policy "usage_owner_read" on public.usage_events
  for select
  using (exists (
    select 1 from public.agents
    where agents.id = usage_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "usage_owner_write" on public.usage_events
  for insert
  with check (exists (
    select 1 from public.agents
    where agents.id = usage_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));

-- Audit events
create policy "audit_owner_read" on public.audit_events
  for select
  using (exists (
    select 1 from public.agents
    where agents.id = audit_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));

create policy "audit_owner_write" on public.audit_events
  for insert
  with check (exists (
    select 1 from public.agents
    where agents.id = audit_events.agent_id
      and agents.owner_user_id = auth.uid()
  ));
