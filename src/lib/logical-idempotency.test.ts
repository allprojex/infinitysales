import { describe, expect, it } from "vitest";
import {
  completeLogicalTransaction,
  deterministicTransactionKey,
  getLogicalTransactionKey,
  logicalTransactionFingerprint,
  type KeyValueStorage,
} from "./logical-idempotency";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("logical sale idempotency", () => {
  it("reuses one key for retries and across a simulated reload", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const makeUuid = () => `key-${++sequence}`;
    const payload = { items: [{ productId: "p1", quantity: 2 }], total: 20 };
    expect(getLogicalTransactionKey(storage, "pos", payload, makeUuid)).toBe("key-1");
    expect(
      getLogicalTransactionKey(storage, "pos", { total: 20, items: payload.items }, makeUuid),
    ).toBe("key-1");
    expect(sequence).toBe(1);
  });

  it("rotates when the transaction changes or completes", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const makeUuid = () => `key-${++sequence}`;
    expect(getLogicalTransactionKey(storage, "manual", { total: 10 }, makeUuid)).toBe("key-1");
    expect(getLogicalTransactionKey(storage, "manual", { total: 11 }, makeUuid)).toBe("key-2");
    completeLogicalTransaction(storage, "manual");
    expect(getLogicalTransactionKey(storage, "manual", { total: 11 }, makeUuid)).toBe("key-3");
  });

  it("creates stable server keys for the same import and different keys for changed input", async () => {
    const first = await deterministicTransactionKey("import:user:file:ref", { total: 10 });
    const retry = await deterministicTransactionKey("import:user:file:ref", { total: 10 });
    const changed = await deterministicTransactionKey("import:user:file:ref", { total: 11 });
    expect(first).toBe(retry);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("canonicalizes object key order", () => {
    expect(logicalTransactionFingerprint({ b: 2, a: 1 })).toBe(
      logicalTransactionFingerprint({ a: 1, b: 2 }),
    );
  });
});
