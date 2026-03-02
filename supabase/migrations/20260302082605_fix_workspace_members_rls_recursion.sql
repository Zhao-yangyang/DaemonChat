-- ============================================================
-- Fix: workspace_members RLS 自引用递归问题
-- 原策略 ws_members_read 在 USING 子句中子查询了 workspace_members
-- 自身，导致 RLS 递归检查报错。
-- 修复方案：使用 SECURITY DEFINER 函数绕过递归。
-- ============================================================

-- 1. 创建 helper 函数（以 schema owner 权限运行，跳过 RLS）
create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
  );
$$;

-- 2. 删除有问题的旧策略
drop policy if exists "ws_members_read" on public.workspace_members;
drop policy if exists "ws_members_admin_insert" on public.workspace_members;
drop policy if exists "ws_members_admin_delete" on public.workspace_members;

-- 3. 重建 workspace_members RLS 策略（无递归）
create policy "ws_members_read" on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id, auth.uid())
  );

create policy "ws_members_admin_insert" on public.workspace_members
  for insert
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_user_id = auth.uid()
    )
    or (
      public.is_workspace_member(workspace_id, auth.uid())
      and exists (
        select 1 from public.workspace_members wm2
        where wm2.workspace_id = workspace_members.workspace_id
          and wm2.user_id = auth.uid()
          and wm2.role in ('owner', 'admin')
      )
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
