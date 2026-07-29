import { registerAutomationNodes } from "../registry";
import { eventTriggerNode } from "./event-trigger";
import { manualTriggerNode } from "./manual-trigger";
import { httpTriggerNode } from "./http-trigger";
import { scheduledTriggerNode } from "./scheduled-trigger";
import { notificationNode } from "./notification";
import { webhookNode } from "./webhook";
import { sendEmailNode } from "./send-email";
import {
  dataCreateRecordNode,
  dataDeleteRecordNode,
  dataFindRecordNode,
  dataFindRecordsNode,
  dataUpdateRecordNode,
} from "./data";
import { rbacAssignRoleNode, rbacRemoveRoleNode } from "./rbac";
import { userGetNode, userSetActiveNode, userSetMetadataNode, userUpdateProfileNode } from "./user";
import { conditionNode } from "./condition";
import { constantNode } from "./constant";
import { transformNode } from "./transform";
import { delayNode } from "./delay";

let registered = false;

/**
 * Register the node types Core ships, under the `automation` namespace. Called
 * once at api boot ; extended modules add their own via `registerAutomationNodes`
 * the same way. Idempotent.
 */
export function registerBuiltinAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("automation", {
    // Triggers
    "event-trigger": eventTriggerNode,
    "manual-trigger": manualTriggerNode,
    "http-trigger": httpTriggerNode,
    "schedule-trigger": scheduledTriggerNode,
    // Control flow
    condition: conditionNode,
    constant: constantNode,
    transform: transformNode,
    delay: delayNode,
    // Communication
    notification: notificationNode,
    webhook: webhookNode,
    "send-email": sendEmailNode,
    // Data
    "data-create-record": dataCreateRecordNode,
    "data-update-record": dataUpdateRecordNode,
    "data-delete-record": dataDeleteRecordNode,
    "data-find-record": dataFindRecordNode,
    "data-find-records": dataFindRecordsNode,
    // RBAC
    "rbac-assign-role": rbacAssignRoleNode,
    "rbac-remove-role": rbacRemoveRoleNode,
    // User
    "user-get": userGetNode,
    "user-set-metadata": userSetMetadataNode,
    "user-update-profile": userUpdateProfileNode,
    "user-set-active": userSetActiveNode,
  });
}
