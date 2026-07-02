import { RoleEditor } from "../../role-editor";

/**
 * Edit-role page at `/admin/rbac/roles/[id]`. The role id is the only
 * thing the route carries ; the editor fetches the row + its
 * permissions through `rbac.adminGetRole`. Built-in `ADMIN` locks
 * the permission grid (it short-circuits to "all granted" in
 * code-side guards) and hides the Delete button.
 *
 * Replaces the previous edit-role modal : a full page surfaces the
 * complete permission set in one view and gives delete + save proper
 * page-bottom affordances instead of cramped dialog chrome.
 */
export default async function AdminRbacEditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section>
      <RoleEditor mode="edit" roleId={id} />
    </section>
  );
}
