// Moved into _resource-helpers.ts so requireHrmAccess (same file) can share
// the exact same global-admin-permission-map logic instead of duplicating a
// buggy per-calling-user variant. Re-exported here for existing importers.
export { isPermissionKey, globalUserPermissions, requirePermission } from "./_resource-helpers";
