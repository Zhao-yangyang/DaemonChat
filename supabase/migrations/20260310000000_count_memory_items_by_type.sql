-- Efficient count of memory items grouped by type (replaces full-table SELECT type)
create or replace function public.count_memory_items_by_type(
  p_agent_id uuid
)
returns table (type text, cnt bigint)
language sql stable as $$
  select m.type, count(*) as cnt
  from public.memory_items m
  where m.agent_id = p_agent_id
  group by m.type;
$$;
