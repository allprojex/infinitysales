export function mergeSettingsPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const merged = { ...existing, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null) delete merged[key];
  }
  return merged;
}
