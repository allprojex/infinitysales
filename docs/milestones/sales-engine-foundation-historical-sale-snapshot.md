# Sales Engine Foundation – Historical Sale Snapshot

Status: implemented locally for review; migration not applied; no commit, push, or deployment.

## Milestone boundary

This milestone is a prerequisite to Sales Returns. The suspended Phase 2A work must not be restored until this foundation and its migration order are approved.

## Complete sale-write audit

| Surface                        | Previous behavior                                                                        | Foundation behavior                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/sales`              | Called the legacy three-argument RPC with a mutable JSON item array                      | Calls the sole application engine with canonical lines                       |
| Sales CSV/XLSX import          | Inserted directly into `sales`; skipped inventory, spend, receivables, and durable lines | Calls the engine in explicit `historical_no_post` / `catalog_at_import` mode |
| Admin smoke seed               | Inserted directly into `sales`                                                           | Calls the engine in explicit non-posting smoke mode                          |
| `PUT /api/sales/:id`           | Could replace status, items, totals, identity, and other history                         | Permits notes only; DB trigger independently enforces this                   |
| `DELETE /api/sales/:id`        | Physically deleted history                                                               | Returns 405; DB trigger independently blocks deletion                        |
| Direct authenticated table DML | `authenticated` had INSERT, UPDATE, DELETE                                               | Write grants revoked; only SELECT remains                                    |
| Legacy RPC                     | Accepted mutable header JSON, item JSON, and client-computed credit                      | Dropped and replaced by a service-only canonical engine                      |
| Smoke cleanup                  | Generic direct delete                                                                    | Dedicated RPC can delete only non-posting `smoke_test` sales                 |

The POS and manual-sale interfaces both already converge on `POST /api/sales`; duplicate products are intentionally retained as distinct lines and receive distinct immutable IDs.

## Canonical architecture

`sales` is the immutable transaction header. `sale_lines` is the authoritative immutable line ledger. `sales.items` remains an immutable compatibility projection so current reports can migrate incrementally without losing behavior.

Each canonical line permanently records:

- a UUID line ID and ordinal;
- product ID plus name, SKU, barcode, category, brand, and unit snapshots;
- quantity, unit price, unit cost, tax rate, gross, discount, tax, net total, and COGS;
- effective warehouse, batch/lot, expiry, and serial-number snapshots;
- branch and business `sold_at` snapshots independent of the header;
- promotion, pricing-decision, full product, and original input payload snapshots;
- the declared snapshot-completeness class and an explicit `known_fields` map.

The database derives header totals and the compatibility JSON from inserted canonical lines. It snapshots catalogue cost and identity while product rows are locked, posts inventory/customer effects in the same transaction for completed application sales, and records an idempotency key and audit event.

## Historical truth policy

The migration never fills missing old facts from the current catalogue. Pre-foundation payloads are retained verbatim in `source_payload`, receive stable line IDs, and are marked `legacy_partial` and return-ineligible. Historical imports are marked `catalog_at_import`, post no operational effects, and are also return-ineligible. This prevents the system from presenting inferred data as historical fact.

Unknown legacy quantities and financial values are stored as `NULL`, never as zero or minimum placeholders. `known_fields` distinguishes an observed value from an unknown one, including fields where `NULL` can otherwise mean either “none” or “not recorded.”

## Permitted insertion paths

There are exactly two database functions permitted to insert immutable sale data:

1. `create_sale_atomic` creates a new logical transaction and posts its effects atomically.
2. `restore_canonical_sale` restores exact backed-up headers and lines without replaying effects.

Both functions are service-role-only. Header and line triggers reject direct table inserts, including direct service-role PostgREST writes. The restore function preserves sale UUIDs, line UUIDs, timestamps, values, provenance, and known/unknown status.

POS and Manual Sales persist a logical transaction UUID in session storage until success. Identical retries reuse it, including after a page reload; changing the request creates a new UUID. Imports and smoke operations derive stable UUIDs from their logical source records. The database requires the key and returns the existing transaction before any side effects when it is retried.

## Review and rollout notes

- Migration: `supabase/migrations/20260722183000_sales_engine_historical_snapshot.sql`
- The migration has intentionally not been run.
- Generated Supabase types have intentionally not been regenerated; that happens only after schema approval and application.
- The suspended Sales Returns stash must be restored only after approval, then rebased on this migration and adapted to `sale_lines` IDs.
