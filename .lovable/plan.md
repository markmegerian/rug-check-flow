

## Wholesale Portal: Rug List with Status Filters + Tabs

### What This Is

A client-facing portal at `/portal` where wholesale clients see their rugs, pickups, and invoices. No dashboard -- the default landing is a rug list with status filters and summary pills.

### Layout

```text
+----------------------------------------------------------+
| Pacific Rug Gallery                                      |
| [Rugs]  [Pickups]  [Invoices]                            |
+----------------------------------------------------------+

Rugs tab (default):

+----------------------------------------------------------+
| [12 Total] [3 In Progress] [2 Ready] [1 Delivered]       |
+----------------------------------------------------------+
| [All] [In Progress] [Ready] [Delivered]                  |
+----------------------------------------------------------+
| Rug #    | Type    | Services         | Status    | Date |
|----------|---------|------------------|-----------|------|
| R-4501   | Persian | Deep Wash, Fri.. | In Progr. | 2/17 |
| R-4442   | Kilim   | Standard Wash    | Ready     | 2/15 |
| R-4430   | Afghan  | Antique Restor.. | Delivered | 2/14 |
+----------------------------------------------------------+

Pickups tab:

+----------------------------------------------------------+
| Ready for Pickup (2 rugs)                                |
+----------------------------------------------------------+
| R-4442  Kilim   Standard Wash         Ready since 2/15   |
| R-4460  Persian Silk Treatment, Mo..  Ready since 2/16   |
|                                                          |
| [Request Pickup]                                         |
+----------------------------------------------------------+
| Scheduled Pickups                                        |
+----------------------------------------------------------+
| Feb 20 — 2 rugs (R-4442, R-4460)         Status: Pending|
+----------------------------------------------------------+

Invoices tab:

+----------------------------------------------------------+
| Invoice #  | Date  | Rugs | Total   | Status   |        |
|------------|-------|------|---------|----------|--------|
| INV-2026-001| 2/15 |  5   | $2,340  | Sent     | [View] |
| INV-2026-002| 2/12 |  3   | $890    | Paid     |        |
+----------------------------------------------------------+
```

### Status: IMPLEMENTED ✅

All files created and route added. Portal is live at `/portal`.
