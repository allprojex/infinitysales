import { apiToRow } from "./_resource-helpers";

const BRANCH_WRITE_FIELDS = [
  "name",
  "code",
  "address",
  "city",
  "phone",
  "email",
  "managerId",
  "isActive",
  "isDefault",
  "notes",
] as const;

export function branchWriteRow(body: unknown = {}) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const normalized = { ...(source as Record<string, unknown>) };
  if ((normalized.city == null || normalized.city === "") && normalized.region != null) {
    normalized.city = normalized.region;
  }

  const allowed: Record<string, unknown> = {};
  for (const field of BRANCH_WRITE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      allowed[field] = normalized[field];
    }
  }

  return apiToRow(allowed);
}
