# DWELLERS — Job Requests (Request Service)

**Find. Buy. Build.** — Ghana's digital construction marketplace.

This document covers Phase 5: the transformation of the "Request service"
button into a REAL job-request workflow. A customer finds a provider through
nationwide discovery, describes the job, picks the JOB location (which may
differ from where they live), attaches photos, reviews and submits — and the
targeted provider responds. Everything below is enforced server-side; the UI
is a view over these rules, never the source of them.

---

## 1. The lifecycle at a glance

```
CUSTOMER                                   PROVIDER
────────                                   ────────
FIND (/find) ─► PROVIDER PROFILE
        Request service ─► sign-in round-trip
        (intent preserved in callbackUrl)
        │
        ▼
REQUEST WIZARD  (DRAFT created up-front,
 1 Service      idempotent on clientToken)
 2 Details
 3 Job location          ◄─ location is the JOB's, never assumed
 4 Schedule                 to be the customer's own
 5 Photos                ◄─ through the existing storage pipeline
 6 Review
        SUBMIT ─────────────────►  JobRequest: SUBMITTED
        │                          + timeline events
        │                          + provider notification
        │                          ◄─ provider opens it (VIEWED, once)
        │                          ◄─ provider responds:
        │                              INTERESTED / NEEDS_INFO / DECLINED
        ◄─ customer notification
        ▼
CUSTOMER SEES RESPONSE (timeline + status)
```

Phase 5 ends at the provider response. The existing `Quote` model stays
ready for the quotation phase: JobRequest → Provider Response → Quote →
Customer Reviews Quote → Accept/Decline → Payment.

## 2. State machine

Single source of truth: `src/modules/projects/job-request-state.ts`.
The client submits an **action**, never a status; the server determines the
resulting state. Statuses preserve the Phase 2 vocabulary plus `DECLINED`:

| Status       | Meaning                                  |
| ------------ | ---------------------------------------- |
| DRAFT        | created, not yet submitted               |
| SUBMITTED    | waiting for the targeted provider        |
| MATCHING     | (reserved) waiting / broadcast matching  |
| RESPONDED    | provider expressed interest or asked for info |
| ACCEPTED     | accepted (later phases drive this)       |
| IN_PROGRESS  | work started (later phases)              |
| COMPLETED    | work done (terminal)                     |
| DECLINED     | provider declined (terminal, Phase 5)    |
| CANCELLED    | customer withdrew (terminal)             |

Permitted transitions:

| Action              | Actor   | From                                  | To          |
| ------------------- | ------- | ------------------------------------- | ----------- |
| submit              | CUSTOMER | DRAFT                                 | SUBMITTED   |
| edit                | CUSTOMER | DRAFT                                 | (stays)     |
| cancel              | CUSTOMER | DRAFT, SUBMITTED, MATCHING, RESPONDED | CANCELLED   |
| respond_interested  | PROVIDER | SUBMITTED, MATCHING                   | RESPONDED   |
| respond_info        | PROVIDER | SUBMITTED, MATCHING                   | RESPONDED   |
| respond_declined    | PROVIDER | SUBMITTED, MATCHING                   | DECLINED    |

Staff perform no business transitions. The guard is `assertTransition()` —
the only gate the service layer uses, and the entire machine is testable
through it.

## 3. Request form (wizard)

Six focused steps with a progress indicator (`/request-service/[providerId]`):

1. **Service** — only services the provider GENUINELY offers are listed; the
   server re-validates ownership server-side (`assertProviderOffersService`).
2. **Details** — title 10–120 chars; description 10–5,000 chars.
3. **Location** — Region → District → Town → optional Community, entirely
   DB-driven; validated server-side (a community must belong to the chosen
   town). Optional address/landmark text. An honest notice appears when the
   chosen town is outside the provider's listed service areas — the request
   is still allowed; the provider decides (no silent pretending).
4. **Schedule** — as-soon-as-possible / specific date (not in the past) /
   flexible; preferred time slot; urgency NORMAL/URGENT/EMERGENCY.
5. **Photos** — up to 10 JPEG/PNG/WEBP files, 10 MB each, through the
   EXISTING storage abstraction ('job-attachment' policy; SVG blocked).
6. **Review** — complete summary before submission.

Submission is idempotent: the browser generates a `clientToken`, the draft
is created once, and a double click or network retry resolves to the SAME
request (unique index on `clientToken`). A failed submit never shows
"Request submitted" — only a server-confirmed response navigates.

## 4. Ownership & permissions

- **Create/edit/submit/cancel**: the owning customer only
  (`projects:create` is customer-only in the RBAC matrix).
- **Read**: owner; the targeted provider side; staff. Foreign probes get the
  same opaque 404 as anonymous ones — the existence of a request is never
  disclosed.
- **Respond**: the targeted provider — the profile's own user, or for
  business-affiliated profiles an ACTIVE business member with role OWNER or
  MANAGER. Plain MEMBERs may READ but never act (no blanket owner powers).
- **Attachments**: owned by the request; added/removed only by the owning
  customer while the request is still customer-editable (pre-provider
  response). Photo bytes are served through an authorization-checked route —
  storage keys and binaries never leave the auth boundary.

## 5. Provider response

The provider panel submits one of three actions with an optional short
message (≤1,000 chars, control-character-free):

- **I am interested** (`respond_interested`) → RESPONDED / INTERESTED
- **Ask for more info** (`respond_info`) → RESPONDED / NEEDS_INFO
- **Decline** (`respond_declined`) → DECLINED (terminal)

The response is atomic: status + `responseKind` + `respondedAt` + timeline
event (with the message) + customer notification, all in one transaction.
A second response is refused — one response per request; the quotation
phase continues from here.

## 6. Timeline

The timeline is derived EXCLUSIVELY from `JobRequestEvent` rows written in
the same transaction as the state change they describe: CREATED, SUBMITTED,
VIEWED (first provider-side open, exactly once), EDITED, ATTACHMENT_ADDED,
ATTACHMENT_REMOVED, RESPONSE_INTERESTED, RESPONSE_INFO_REQUESTED,
RESPONSE_DECLINED, CANCELLED. The UI never fabricates timeline entries or
timestamps.

## 7. Notifications

Event-driven, in-app only (external channels stay deferred by design):

| Event                        | Notification                              | Recipient |
| ---------------------------- | ----------------------------------------- | --------- |
| request submitted            | `JOB_REQUEST_NEW` — "New plumbing service request in Nsawam." | provider user |
| provider responded           | `JOB_REQUEST_RESPONSE` — accepted / needs-info / declined wording | customer |

Created inside the same transaction as the state change. No SMS/WhatsApp/
email dispatch exists — the `Notification.channel` and `sentAt` columns are
schema-ready for later phases.

## 8. API endpoints

All follow the established pipeline (rate limit → auth → RBAC → Zod →
ownership → business rules → transaction → audit → standard envelope):

| Endpoint                                          | Purpose                                   |
| ------------------------------------------------- | ----------------------------------------- |
| `POST /api/job-requests`                          | create draft or direct submit (idempotent) |
| `GET /api/job-requests`                           | role-scoped list (`status`, `statusGroup`) |
| `GET /api/job-requests/[id]`                      | detail + timeline (provider side marks VIEWED once) |
| `PATCH /api/job-requests/[id]`                    | customer: edit draft / submit / cancel (actions only) |
| `POST /api/job-requests/[id]/respond`             | provider: respond_interested / _info / _declined |
| `POST /api/job-requests/[id]/attachments`         | multipart photo upload (job-attachment policy) |
| `GET /api/job-requests/[id]/attachments/[attachmentId]` | authorized photo streaming |
| `DELETE /api/job-requests/[id]/attachments/[attachmentId]` | customer removes a photo |

Unknown fields are stripped (a client-sent `status` key cannot mutate
state); malformed IDs and invalid location combinations are 422s.

## 9. Analytics

Request-funnel events flow through the SAME privacy-safe DiscoveryEvent
pipeline as discovery (IDs only — no user identifiers, no free text):
`request_started`, `request_step_completed`, `request_attachment_added`,
`request_submitted`, `request_cancelled`, `provider_request_viewed`,
`provider_response`.

## 10. Security checklist

- Authentication on every endpoint; live account-status re-check per request
  (suspended/deactivated accounts never act — including mid-session).
- RBAC (`projects:create` customer-only) + ownership guards + opaque 404s.
- Central state machine — the client can never set a status.
- Server-side location-hierarchy and provider-service validation.
- Idempotent creation (clientToken unique index).
- Upload validation (MIME allow-list, SVG blocked, size ceilings, sanitized
  filenames, category-scoped keys); oversized bodies map to 413, never 500.
- Rate limits: standard per request routes, `upload` preset for attachments,
  `auth` preset for sign-in; floods receive 429 + Retry-After.
- Append-only audit trail: job.request_created / submitted / updated / viewed
  / responded / declined / attachment_added / attachment_removed / cancelled.
- No private data leaks: provider sees the customer's display name only
  (first name + last initial); job requests never appear in public APIs,
  sitemaps or SEO pages.

## 11. Future quotation integration (deferred)

Phase 5 deliberately stops at the provider response. The architecture leaves
clean seams for: JobRequest → Provider Response → Quote (labour / materials /
equipment / other, server-computed totals in integer pesewas, GH₵) → customer
review → accept/decline → payment. The `Quote`/`QuoteItem` models already
carry this; no pricing or payment logic exists in Phase 5.
