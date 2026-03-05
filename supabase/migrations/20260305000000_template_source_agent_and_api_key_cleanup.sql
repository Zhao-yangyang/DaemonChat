-- ============================================================
-- Migration: template_source_agent_and_api_key_cleanup
-- Description: 1) Add source_agent_id for "一 Agent 一模板" upsert
--              2) Clean historical apiKey from agent_templates.config
-- ============================================================

-- 1. Add source_agent_id column
alter table public.agent_templates
  add column if not exists source_agent_id uuid references public.agents(id) on delete set null;

create unique index if not exists agent_templates_source_agent_unique
  on public.agent_templates (author_user_id, source_agent_id)
  where source_agent_id is not null;

create index if not exists agent_templates_source_agent_idx
  on public.agent_templates (source_agent_id)
  where source_agent_id is not null;

-- 2. Clean historical apiKey from config (one-time cleanup)
update public.agent_templates
set config = config #- '{llmProvider,apiKey}'
where config ? 'llmProvider'
  and config->'llmProvider' ? 'apiKey';
