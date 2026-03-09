-- 允许匿名用户读取 visibility=public 的 Agent（用于分享页）
create policy "agents_public_read" on public.agents
  for select
  using (visibility = 'public');
