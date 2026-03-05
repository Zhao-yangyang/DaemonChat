-- ============================================================
-- Migration: template_tags_ratings
-- Description: 新增模板标签（多对多）、评分表及 RLS
-- ============================================================

-- 1. Template tags (预置标签)
create table if not exists public.template_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- 2. Agent template <-> tags (多对多)
create table if not exists public.agent_template_tags (
  template_id uuid not null references public.agent_templates(id) on delete cascade,
  tag_id uuid not null references public.template_tags(id) on delete cascade,
  primary key (template_id, tag_id)
);

create index if not exists agent_template_tags_template_idx
  on public.agent_template_tags (template_id);
create index if not exists agent_template_tags_tag_idx
  on public.agent_template_tags (tag_id);

-- 3. Template ratings (1-5 星)
create table if not exists public.template_ratings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.agent_templates(id) on delete cascade,
  user_id uuid not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  unique (template_id, user_id)
);

create index if not exists template_ratings_template_idx
  on public.template_ratings (template_id);
create index if not exists template_ratings_user_idx
  on public.template_ratings (user_id);

-- 4. Seed 预置标签
insert into public.template_tags (name) values
  ('写作'), ('编程'), ('客服'), ('翻译'), ('创意'), ('学习'), ('效率')
on conflict (name) do nothing;

-- 5. RLS for template_tags (仅读)
alter table public.template_tags enable row level security;
create policy "template_tags_read_all" on public.template_tags
  for select
  using (auth.role() = 'authenticated');

-- 6. RLS for agent_template_tags (作者可改自己模板的标签)
alter table public.agent_template_tags enable row level security;
create policy "agent_template_tags_read" on public.agent_template_tags
  for select
  using (
    exists (
      select 1 from public.agent_templates t
      where t.id = agent_template_tags.template_id
        and (t.is_public = true or t.author_user_id = auth.uid())
    )
  );
create policy "agent_template_tags_author_insert" on public.agent_template_tags
  for insert
  with check (
    exists (
      select 1 from public.agent_templates t
      where t.id = agent_template_tags.template_id
        and t.author_user_id = auth.uid()
    )
  );
create policy "agent_template_tags_author_update" on public.agent_template_tags
  for update
  using (
    exists (
      select 1 from public.agent_templates t
      where t.id = agent_template_tags.template_id
        and t.author_user_id = auth.uid()
    )
  );
create policy "agent_template_tags_author_delete" on public.agent_template_tags
  for delete
  using (
    exists (
      select 1 from public.agent_templates t
      where t.id = agent_template_tags.template_id
        and t.author_user_id = auth.uid()
    )
  );

-- 7. RLS for template_ratings (本人可读写自己的评分)
alter table public.template_ratings enable row level security;
create policy "template_ratings_read" on public.template_ratings
  for select
  using (
    exists (
      select 1 from public.agent_templates t
      where t.id = template_ratings.template_id
        and (t.is_public = true or t.author_user_id = auth.uid())
    )
  );
create policy "template_ratings_own_insert" on public.template_ratings
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.agent_templates t
      where t.id = template_ratings.template_id
        and (t.is_public = true or t.author_user_id = auth.uid())
    )
  );
create policy "template_ratings_own_update" on public.template_ratings
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "template_ratings_own_delete" on public.template_ratings
  for delete
  using (user_id = auth.uid());
