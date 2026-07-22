# `sales.items` Reporting Migration Roadmap

This roadmap is documentation only. No report is migrated in Sales Engine Foundation v1.1.

The target for every migration is `sale_lines`, using its stored line identity, financial amounts, branch, warehouse, category, and `sold_at`. Reports must not join mutable products to reconstruct historical facts. `sales` may still be joined for customer, cashier, payment, and header-level filters.

## Phase A — required before Sales Returns

| Consumer                                              | Required change                                                                    | Reason                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/routes/api/reports/sales.ts`                     | Read categories and line values from `sale_lines`; remove current-product fallback | It currently changes historical classification when a product category changes |
| `src/routes/api/reports/category-summary.ts`          | Aggregate sale quantities/value by stored `category_id` and line totals            | Current-product fallback fabricates historical category                        |
| `src/routes/api/reports/users-transaction-summary.ts` | Use stored line category, branch, warehouse, quantity, and total                   | It currently reconstructs location/category and prorates header revenue        |

Acceptance: historical results are unchanged when a product, category, warehouse assignment, price, or cost is edited after sale completion.

## Phase B — required before Production

| Consumer                                     | Required change                                                                          | Reason                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/routes/api/reports/top-products.ts`     | Aggregate canonical quantity and total by stable product/line IDs                        | Remove dependency on compatibility JSON                       |
| `src/routes/api/reports/dead-stock.ts`       | Read sold quantities and `sold_at` from canonical lines                                  | Required for canonical inventory analytics                    |
| `src/routes/api/reports/recent-sales.ts`     | Return canonical lines explicitly instead of relying on `select('*')` compatibility data | Establish a stable report response                            |
| `src/pages/sales.tsx` receipt printing       | Print returned canonical lines and honor `known_fields` for legacy values                | Correct display of old snake-case payloads and unknown values |
| `src/routes/api/sales.ts` and `sales.$id.ts` | Expose a canonical line DTO while retaining a versioned compatibility field              | Remove UI dependence on storage representation                |

Acceptance: report, print, CSV, Excel, PDF, and Word output use the same canonical line DTO and render unknown legacy values as “Unknown,” never zero.

## Phase C — can migrate later

| Consumer                                                  | Required change                                         | Reason                                       |
| --------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| `src/routes/api/ai.insights.ts`                           | Source product revenue and quantities from `sale_lines` | Analytical consumer; not transactional       |
| `src/routes/api/admin.generated-reports.auto-generate.ts` | Stop selecting unused `sales.items`                     | Field is currently selected but not consumed |

Acceptance: `rg` finds no report or analytical aggregation over `sales.items`; the compatibility projection remains only for versioned legacy API clients until its separate removal milestone.
