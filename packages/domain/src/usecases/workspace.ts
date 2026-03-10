import { ForbiddenError } from "../errors";
import type { WorkspaceRole } from "../types";
import type { WorkspaceStore } from "../container/types";

export type WorkspaceAction =
  | "create_agent"
  | "edit_agent"
  | "delete_agent"
  | "chat"
  | "view_memory"
  | "invite_member"
  | "remove_member"
  | "delete_workspace";

/** 权限矩阵：action -> 允许的 role；ownOnly 时 member 仅能操作自己的资源 */
const CAN_DO: Record<WorkspaceAction, { roles: WorkspaceRole[]; ownOnly?: boolean }> = {
  create_agent: { roles: ["owner", "admin", "member"] },
  edit_agent: { roles: ["owner", "admin", "member"], ownOnly: true },
  delete_agent: { roles: ["owner", "admin", "member"], ownOnly: true },
  chat: { roles: ["owner", "admin", "member", "viewer"] },
  view_memory: { roles: ["owner", "admin", "member", "viewer"] },
  invite_member: { roles: ["owner", "admin"] },
  remove_member: { roles: ["owner", "admin"] },
  delete_workspace: { roles: ["owner"] },
};

export function createWorkspaceService(ports: { workspace: WorkspaceStore }) {
  return {
    async checkPermission(
      workspaceId: string,
      userId: string,
      action: WorkspaceAction,
      opts?: { agentOwnerUserId?: string },
    ): Promise<boolean> {
      const role = await ports.workspace.getMemberRole(workspaceId, userId);
      if (!role) return false;

      const rule = CAN_DO[action];
      if (!rule.roles.includes(role)) return false;

      if (rule.ownOnly && opts?.agentOwnerUserId !== undefined) {
        if (role === "owner" || role === "admin") return true;
        return opts.agentOwnerUserId === userId;
      }
      return true;
    },

    async requirePermission(
      workspaceId: string,
      userId: string,
      action: WorkspaceAction,
      opts?: { agentOwnerUserId?: string },
    ): Promise<void> {
      const allowed = await this.checkPermission(workspaceId, userId, action, opts);
      if (!allowed) {
        throw new ForbiddenError(
          `Workspace permission denied: ${action} requires higher role or ownership`,
        );
      }
    },
  };
}
