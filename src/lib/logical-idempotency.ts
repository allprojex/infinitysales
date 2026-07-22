export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingTransaction = { fingerprint: string; key: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function logicalTransactionFingerprint(payload: unknown) {
  return JSON.stringify(canonicalize(payload));
}

/**
 * Keeps one UUID for one logical browser transaction, including page reloads.
 * Editing the payload starts a new transaction; retrying it reuses the UUID.
 */
export function getLogicalTransactionKey(
  storage: KeyValueStorage,
  scope: string,
  payload: unknown,
  makeUuid: () => string = () => crypto.randomUUID(),
) {
  const fingerprint = logicalTransactionFingerprint(payload);
  const storageKey = `infinity:idempotency:${scope}`;
  try {
    const existing = JSON.parse(storage.getItem(storageKey) ?? "null") as PendingTransaction | null;
    if (existing?.fingerprint === fingerprint && existing.key) return existing.key;
  } catch {
    // A corrupt client cache is replaced below.
  }
  const key = makeUuid();
  storage.setItem(storageKey, JSON.stringify({ fingerprint, key } satisfies PendingTransaction));
  return key;
}

export function completeLogicalTransaction(storage: KeyValueStorage, scope: string) {
  storage.removeItem(`infinity:idempotency:${scope}`);
}

/** Stable UUID for server-side logical operations such as one imported sale. */
export async function deterministicTransactionKey(scope: string, payload: unknown) {
  const input = new TextEncoder().encode(`${scope}:${logicalTransactionFingerprint(payload)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
