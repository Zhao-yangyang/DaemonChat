import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceStore } from "@daemon/domain";
import type { WorkspaceRole } from "@daemon/domain";

const ROLE_MAP: Record<string, WorkspaceRole> = {
  owner: "owner",
  admin: "admin",
  member: "member",
  viewer: "viewer",
};

export function createWorkspaceStore(client: SupabaseClient): WorkspaceStore {
  return {
    async isMember(workspaceId, userId) {
      const { data, error } = await client
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return false;
      return data != null;
    },
    async getMemberRole(workspaceId, userId) {
      const { data, error } = await client
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data?.role) return null;
      return ROLE_MAP[String(data.role)] ?? null;
    },
  };
}
