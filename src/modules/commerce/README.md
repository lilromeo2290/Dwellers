# Module: Commerce

Owns the transactional core: cart, orders, quotations, payments and the
transaction ledger.

## Responsibilities
- Quotation workflow: customer request → provider submission → customer
  acceptance (the Quote step of Find → Compare → Connect → Quote → Buy → Build).
- Cart and checkout for product/equipment orders.
- Order lifecycle: placed → confirmed → fulfilled → completed/cancelled.
- Payment integration (Paystack/Hubtel/MoMo — Ghana Cedi, configured via env;
  nothing activates until keys exist) and an append-only transaction ledger.
- Provider settlements.

## Design rules
- Money is integer pesewas only; totals computed server-side — client
  totals are advisory and re-validated.
- Payment state changes are idempotent (webhook retries are expected).
- Every order/payment transition writes an audit entry
  (`AUDIT_ACTIONS.ORDER_*`, `PAYMENT_*`) and a log event.
- No payment provider code is trusted to define order state; the platform
  is the source of truth.

## Planned API surface
- `POST /api/quotes/requests` · `POST /api/quotes/[id]/submit|accept|decline`
- `GET/POST/PATCH /api/orders` · `/api/orders/[id]`
- `POST /api/payments/initiate` · `POST /api/payments/webhook/[provider]`

## Dependencies
Identity, Marketplace, Projects (build phases), Communication (notifications),
Database, external payment providers (env-gated).
