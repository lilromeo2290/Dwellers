# QUOTATIONS — the priced answer (Phase 6)

Phase 6 turns the Phase 5 request/response conversation into a professional,
auditable quotation workflow: the provider prices the job item by item, the
customer reviews a real document and accepts or declines — and the system
stops exactly at the payment boundary.

```
JOB REQUEST (RESPONDED · INTERESTED)
      ↓
CREATE QUOTE  (provider, draft — customer/service/location resolved server-side)
      ↓
ADD QUOTE ITEMS  (LABOUR / MATERIAL / EQUIPMENT / TRANSPORT / OTHER)
      ↓
CALCULATE TOTALS  (SERVER-side, integer pesewas)
      ↓
SEND QUOTE  (DRAFT → SUBMITTED, customer notified)
      ↓
CUSTOMER OPENS  (SUBMITTED → VIEWED, provider notified)
      ↓
ACCEPT / DECLINE  (customer decision, confirmation dialogs)
      ↓
PROVIDER NOTIFIED · timeline updated · request committed (ACCEPTED)
      ↓
STOP.  (Payment, escrow, mobile money: future phase — PART 85 boundary.)
```

## 1. State machine

One central machine in `src/modules/quotes/quote-state.ts`. Clients submit
ACTIONS, never statuses. The Phase 2 status vocabulary is preserved verbatim;
the spec's "SENT"/"CANCELLED" map onto the existing `SUBMITTED`/`WITHDRAWN`.

| Status | Meaning | Reached by |
| ------ | ------- | ---------- |
| `DRAFT` | Provider composing, invisible to the customer | quote creation |
| `SUBMITTED` | Sent to the customer ("Sent" in the UI) | provider action `send` |
| `VIEWED` | Customer opened it at least once | customer read, exactly once |
| `ACCEPTED` | Customer accepted the quotation | customer action `accept` |
| `DECLINED` | Customer declined (optional reason) | customer action `decline` |
| `EXPIRED` | Validity window elapsed | lazy transition on read/accept |
| `WITHDRAWN` | Provider cancelled its own quote | provider action `withdraw` |

Terminal: `ACCEPTED`, `DECLINED`, `EXPIRED`, `WITHDRAWN`.
Provider cannot accept/decline its own quote; staff never perform business
transitions; a sent quote is never silently edited.

## 2. Quote items & calculation rules

`QuoteItem` rows are the source of truth. Five kinds exactly as the Phase 2
schema defines: `LABOUR`, `MATERIAL`, `EQUIPMENT`, `TRANSPORT`, `OTHER`
(TRANSPORT totals roll up into the Quote model's `otherChargesAmount` bucket;
items remain authoritative).

Calculation (all in `computeQuoteTotals`, `src/modules/quotes/quote-service.ts`):

- Quantity: decimal units from the client, stored as `quantityMilli`
  (qty × 1000). Positive, finite, ≤ 1,000,000 units.
- Unit price: decimal cedis from the client, converted to integer pesewas
  (`toPesewas`, round half up). ≥ 0, ≤ GH₵999,999.99.
- Line total: `lineTotalAmount(quantityMilli, unitPriceAmount)` — integer
  pesewas, round half up. **The client-supplied amount is impossible by
  schema construction** (the field does not exist in the input schema).
- Subtotal: Σ line totals; maintained in the Quote's component buckets
  (`labourAmount`, `materialAmount`, `equipmentAmount`, `otherChargesAmount`).
- Discount: fixed amount only (no percentages). Rejected when ≥ subtotal.
- Total: `subtotal − discount`. `taxAmount` stays 0 — no VAT/NHIL/GETFund is
  invented (a controlled tax feature belongs to a later phase).
- Cap: at most 50 items per quote, enforced in BOTH the API schema and the
  service engine (defense in depth).

The browser may display running totals for convenience — the server
recalculates everything from the item data on every create/edit.

## 3. GH₵ money policy

Unchanged from Phase 2 (`src/lib/finance.ts` is the only sanctioned money
code): integer pesewas everywhere in storage and arithmetic, `formatCedi` for
every display, round-half-up, largest-remainder for any future splits. Floats
never touch stored money.

## 4. Quote eligibility (create ladder — all server-side)

A provider may create a quotation for a request only when:

1. authenticated, live account (`ACTIVE` re-checked per request);
2. the caller IS the targeted provider side (own profile or business
   OWNER/MANAGER — via the shared job-request access resolver);
3. the request is `RESPONDED` with `responseKind = INTERESTED`
   (cancelled/declined/completed requests are structurally ineligible);
4. the role holds `commerce:quotes:submit` (ARTISAN, CONTRACTOR,
   CONSTRUCTION_COMPANY — per the Phase 1 matrix; SUPPLIER and
   EQUIPMENT_PROVIDER cannot quote and the UI offers them no button);
5. no quotation exists yet for (request, provider) — one quote per provider
   per request, no silent revisions (a withdrawn quote is history).

Customer, service, job and location are resolved from authorized database
records — never accepted from the request body.

## 5. Permissions

| Side | Role | Powers |
| ---- | ---- | ------ |
| Customer | any CUSTOMER | view own quotes, accept, decline (optional reason) |
| Provider | profile owner / business OWNER · MANAGER | create draft, edit draft, send, withdraw |
| Provider | business MEMBER (ACTIVE) | read-only view of the business's quotes |
| Staff | ADMIN · SUPER_ADMIN | read-only |

## 6. Expiry

Every quote carries a required `validUntil` (never valid forever; creation
and send refuse past dates, > 730 days ahead is rejected). Expiry is enforced
**at decision time and on read** — a lazily-transitioned `EXPIRED` state with
a real timeline event; no background job exists to forget. The customer sees
"This quotation has expired." and acceptance is refused.

## 7. Races & idempotency

- **Double send**: conditional `updateMany` on `status = 'DRAFT'` — exactly
  one send transition, one notification, one timeline event; the loser gets
  a clear 409/400.
- **Concurrent accept** (same quote twice, or accept vs decline): the
  conditional update on `status IN (SUBMITTED, VIEWED)` lets exactly one
  transaction commit; the loser rolls back whole.
- **Two quotes of one request**: the job-request move to `ACCEPTED` is
  itself a conditional update on `status = 'RESPONDED'` inside the same
  transaction — only one acceptance can commit the request.
- **Viewed-once**: the SUBMITTED → VIEWED transition is claimed
  conditionally; concurrent opens produce at most one event.

## 8. Notifications (in-app only)

| Event | Recipient |
| ----- | --------- |
| `QUOTE_SENT` | customer ("…has sent you a quotation.") |
| `QUOTE_VIEWED` | provider (once, on first customer open) |
| `QUOTE_ACCEPTED` | provider |
| `QUOTE_DECLINED` | provider |

No SMS/WhatsApp/email in this phase; the Phase 5 notification architecture
(the single `Notification` model) carries everything, ready for future
channels. Expiry intentionally notifies nobody — it is a state transition,
visible on the timeline.

## 9. Timeline & audit

Every quote action writes a real `JobRequestEvent` on the request timeline
(QUOTE_CREATED, QUOTE_SENT, QUOTE_VIEWED, QUOTE_ACCEPTED, QUOTE_DECLINED,
QUOTE_EXPIRED, QUOTE_WITHDRAWN — plus QUOTE_DRAFT_UPDATED) — one history, no
duplicate timelines. The audit log records `quote.*` actions for created /
updated / item-level changes / sent / viewed / accepted / declined / expired /
withdrawn with actor, role, entity and safe metadata only.

## 10. API endpoints

| Method & path | Permission | Notes |
| ------------- | ---------- | ----- |
| `POST /api/quotes` | `commerce:quotes:submit` | create DRAFT; 201 |
| `GET /api/quotes` | auth (scoped) | `status` filter, `q` search, pagination, per-status counts |
| `GET /api/quotes/[id]` | auth (owner/provider/staff) | customer open flips VIEWED once |
| `PATCH /api/quotes/[id]` | `commerce:quotes:submit` | DRAFT-only edits, totals recalculated |
| `POST /api/quotes/[id]/send` | `commerce:quotes:submit` | DRAFT → SUBMITTED |
| `POST /api/quotes/[id]/accept` | `commerce:quotes:respond` | full PART 29 validation ladder |
| `POST /api/quotes/[id]/decline` | `commerce:quotes:respond` | optional `reason` ≤ 500 chars |
| `POST /api/quotes/[id]/withdraw` | `commerce:quotes:submit` | provider cancels before a decision |

Every endpoint runs the factory pipeline: rate limit → auth → live account
status → RBAC → Zod → ownership → eligibility → state machine → transaction →
audit → notification → standard envelope. Foreign probes get opaque 404s —
quote existence is never disclosed.

## 11. Surfaces

- **Provider**: CREATE QUOTE on an eligible request detail (artisan /
  contractor / company dashboards); quote form (compose → preview → send);
  Quotations board (status tabs with counts); quote document exactly as the
  customer sees it + edit-draft / withdraw.
- **Customer**: MY QUOTATIONS list (status tabs); the professional quotation
  document (DWELLERS header, reference, validity, items grouped by type,
  subtotal → discount → total, notes, terms, print-friendly); accessible
  accept/decline confirmations restating total, provider, job and validity;
  per-request comparison list (provider · reference · total · validity ·
  status) so the wrong quote is never accepted by accident.
- Mobile: stacked item cards and list cards; desktop: professional tables.
  Zero horizontal overflow at 390/768/1440.

## 12. Security checklist

- Ownership enforced in the service layer on every read/write; IDOR matrix
  (10 scenarios) returns 403/404, never 200/500.
- Client cannot submit `customerId`, `providerId`, `jobRequestId`, `status`,
  `total`, `subtotal` or per-item `amount` — the schemas have no such field
  and unknown keys are stripped; the stored values are re-derived.
- Suspended provider accounts fail the live-status check and cannot create,
  send or modify quotes (defense in depth beyond the HTTP layer).
- Notes/terms are length-capped, control-character-free plain text rendered
  as text (no HTML injection surface).
- Rate limiting via the standard presets; all actions audited.

## 13. Future payment handoff (PART 85)

An accepted quote is an ACCEPTANCE — no payment, no escrow, no wallet, no
commission exists in this phase (the Payment model is untouched; nothing
writes to it). The clean boundary for the payment phase is
`Quote.status === 'ACCEPTED'` + the committed `JobRequest.status === 'ACCEPTED'`
+ the QUOTE_ACCEPTED audit/timeline trail. Payment, mobile money, cards,
escrow, platform fees, receipts and refunds plug in downstream of that state.
