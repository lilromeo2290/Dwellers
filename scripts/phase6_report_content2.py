# -*- coding: utf-8 -*-
"""Dwellers Phase 6 Quotations - report content part 2 (data only). ASCII-safe."""

CH12 = {
    "num": 12, "title": "Notifications, Timeline and Audit Trail",
    "blocks": [
        ("h2", "Notifications (PART 32/33)"),
        ("p", "Four notification types were added to the existing vocabulary - QUOTE_SENT, "
              "QUOTE_VIEWED, QUOTE_ACCEPTED and QUOTE_DECLINED - and every one is delivered "
              "through the Phase 5 notification architecture: the same Notification model, the "
              "same in-app channel, created inside the same transaction as the state change it "
              "announces. The customer is notified when a quotation arrives, in the shape the "
              "brief's example gives: the provider has sent you a quotation. The provider is "
              "notified when the customer opens the quotation (once), when it is accepted and "
              "when it is declined. No SMS or WhatsApp was built; the architecture remains "
              "channel-ready for them. Lazy expiry intentionally notifies nobody - it is a state "
              "transition the timeline shows, not a message."),
        ("h2", "Timeline (PART 34)"),
        ("p", "Quotation events live on the job-request timeline, not in a duplicate history. "
              "The event vocabulary added QUOTE_CREATED, QUOTE_SENT, QUOTE_VIEWED, "
              "QUOTE_ACCEPTED, QUOTE_DECLINED, QUOTE_EXPIRED, QUOTE_WITHDRAWN and "
              "QUOTE_DRAFT_UPDATED, each written in the same transaction as the change and each "
              "carrying the actor and role where a human performed it. The brief's auditable "
              "sequence - request submitted, provider responded, quote created, quote sent, "
              "quote viewed, quote accepted - is therefore one continuous trace a reader can "
              "walk on a single timeline, and the suite asserts exactly that sequence for the "
              "acceptance flow. Nothing is fabricated: events exist only where something "
              "happened."),
        ("h2", "Audit trail (PART 35)"),
        ("p", "The audit log records the full quotation action family: created, updated, "
              "item-added, item-updated, item-removed, sent, viewed, accepted, declined, expired "
              "and withdrawn, with actor, role, entity and minimal safe metadata - reference "
              "numbers, item counts, totals, and the decline reason where supplied. Item-level "
              "actions accompany a draft edit whenever the item set actually changed, with "
              "counts in the metadata. Passwords, secrets and personal data are never recorded; "
              "the notification bodies were swept by the suite for leaked emails. Analytics "
              "events for the quotation funnel - created, updated, sent, viewed, accepted, "
              "declined, expired, withdrawn - flow through the same privacy-safe discovery-event "
              "pipeline as every other funnel in the platform."),
    ],
}

CH13 = {
    "num": 13, "title": "API Endpoints and Database Changes",
    "blocks": [
        ("h2", "Endpoints (PART 40)"),
        ("table", {
            "title": "Table 13.1 - The quotation API surface.",
            "headers": ["Method and path", "Permission", "Purpose"],
            "ratios": [0.36, 0.28, 0.36],
            "rows": [
                ["POST /api/quotes", "commerce:quotes:submit", "Create a DRAFT (201)"],
                ["GET /api/quotes", "scoped by auth", "Filtered, searched, paginated list with counts"],
                ["GET /api/quotes/[id]", "owner / provider / staff", "Detail; customer open marks VIEWED"],
                ["PATCH /api/quotes/[id]", "commerce:quotes:submit", "Edit DRAFT, totals recalculated"],
                ["POST /api/quotes/[id]/send", "commerce:quotes:submit", "DRAFT to SUBMITTED, notify customer"],
                ["POST /api/quotes/[id]/accept", "commerce:quotes:respond", "Customer acceptance ladder"],
                ["POST /api/quotes/[id]/decline", "commerce:quotes:respond", "Customer decline, optional reason"],
                ["POST /api/quotes/[id]/withdraw", "commerce:quotes:submit", "Provider withdrawal"],
            ],
        }),
        ("p", "The withdraw route maps the brief's cancel action onto the project's existing "
              "WITHDRAWN vocabulary rather than inventing a synonym, exactly as PART 21 and 22 "
              "direct. No endpoint duplicates an existing one, and all eight run through the "
              "factory pipeline - rate limit, authentication, live account status, RBAC, Zod, "
              "then ownership, eligibility, the state machine, the transaction, audit, "
              "notification and the standard envelope, in that order."),
        ("h2", "Database changes (PART 23/61)"),
        ("p", "One migration: 20260914_phase6_quote_notes adds a nullable notes text column to "
              "the quotes table. That is the entire schema diff, and it exists only because the "
              "brief requires quotation notes while the Phase 2 model carried terms but not "
              "notes. No new tables, no new indexes, no changes to QuoteItem, JobRequest, "
              "Notification or AuditLog. The migration was applied with the non-destructive "
              "diff-and-deploy flow, and the clean-database rebuild rebuilt the whole database "
              "from all six migrations and reseeded it. Data integrity invariants hold: a "
              "quotation belongs to exactly one job request, one provider and one customer "
              "through foreign keys with cascade deletes; quote items exist only under a quote; "
              "monetary columns are constrained by the service to non-negative integers."),
    ],
}

CH14 = {
    "num": 14, "title": "Security",
    "blocks": [
        ("p", "The phase inherits the platform's security posture and adds the quotation-specific "
              "layers the brief lists. Authentication and the live account-status check run on "
              "every endpoint before any business code; RBAC is enforced against the Phase 1 "
              "matrix, so the submit and respond permissions are separate capabilities and a "
              "customer can never reach the edit or send endpoints at all. Ownership is "
              "structural: foreign callers receive the same opaque 404 as anonymous probes, "
              "whether they probe by id, by list or by action, so the existence of a quotation "
              "is never disclosed. The provider side sees a display-name-only customer, and no "
              "email, phone or account detail ever reaches a provider response."),
        ("p", "Server-side integrity is the heart of the phase. Every stored amount is derived "
              "on the server from the item data; the client-facing schema has no amount, total, "
              "subtotal or status field, and unknown keys are stripped before validation. The "
              "eligibility ladder re-verifies the request's state and the provider's liveness "
              "beneath the HTTP layer, so a bypassed route changes nothing. Business members "
              "act only by role: a MEMBER can read the business's quotations but cannot create, "
              "edit, send or withdraw them. Suspended providers fail the live check and can "
              "neither create, send nor modify protected data. Every quotation action is "
              "audited, and notifications and audit rows never carry secrets."),
        ("p", "Input hygiene follows the platform rules. Notes, terms, item names, descriptions "
              "and unit labels are length-capped, trimmed and stripped of control characters; "
              "the decline reason is capped at five hundred characters; the search query is a "
              "bounded plain-text token. All rendering is React text interpolation - no HTML "
              "injection surface exists in the document, the boards or the dialogs. Rate "
              "limiting uses the standard per-route buckets; the suite's flood checks confirm "
              "429s arrive as designed."),
    ],
}

CH15 = {
    "num": 15, "title": "Security and Acceptance Tests: IDOR, Tampering, Permissions, Expiry, Duplicates, Races",
    "blocks": [
        ("h2", "IDOR matrix (PART 43/75/76)"),
        ("p", "Ten cross-user scenarios were driven over live HTTP with real sessions, and all "
              "failed safely with 403 or 404 - never 200, never 500. Customer B cannot view, "
              "accept or decline Customer A's quotation, and Customer A's rows never appear in "
              "Customer B's list. Provider B cannot view, edit, send or withdraw Provider A's "
              "quotation, and cannot create a quotation on Provider A's request - no row is "
              "written. The same matrix is asserted at service level, where the refused cases "
              "raise the module's typed errors."),
        ("h2", "Price tampering (PART 44/73)"),
        ("p", "The tampering tests post exactly what a malicious browser would: fake amounts on "
              "each item, a fake subtotal, a fake total, a fake status and a foreign customerId "
              "in the create body; and, as the customer, a PATCH with total = 1. Every forged "
              "field is stripped as unknown to the schema, the stored total remains the server "
              "calculation (GH₵530.00 for the acceptance quote, GH₵23,000.00 for the mixed "
              "tamper payload), the status remains DRAFT, and the customer's PATCH is refused "
              "with 403 and the stored total untouched."),
        ("h2", "Permission, expiry, duplicate and race tests (PART 63/64/74/77/78)"),
        ("p", "Business permissions were exercised across OWNER, MANAGER and MEMBER: the owner "
              "and manager manage the business's quotation end to end while the member sees it "
              "read-only and is refused on send. A supplier role, which the matrix excludes from "
              "quoting, is refused at the service boundary even on its own targeted request. "
              "Suspended providers are refused over HTTP even with a valid session, because the "
              "live status check runs per request. The expiry test creates and sends a real "
              "quotation, moves its validity into the past, and proves acceptance is refused "
              "with the honest message and the row lands in EXPIRED. The duplicate-send test "
              "double-clicks send and counts exactly one notification and one timeline event. "
              "The race tests fire two concurrent accepts of one quote, and accept against "
              "decline, and prove exactly one transaction commits with exactly one decision "
              "event - the conditional-update guards hold under SQLite's serialised writes."),
    ],
}

CH16 = {
    "num": 16, "title": "Browser E2E and Responsive Results",
    "blocks": [
        ("h2", "The 28-step journey (PART 79)"),
        ("p", "The full flow was walked in a real browser against the live server. The customer "
              "logged in, opened My Job Requests, opened the eligible request and saw the "
              "provider's response and the quotations panel. The provider logged in, opened the "
              "request, pressed Create quote, added labour, materials and transport, wrote notes, "
              "set the validity date, reviewed the preview totals and sent. The customer received "
              "the notification, opened the quotation through My Quotations, reviewed provider, "
              "job, all items, subtotal, total and validity, accepted through the confirmation "
              "dialog - which restates total, provider, job and validity - and the status became "
              "Accepted. The provider then received the acceptance notification, opened the "
              "quotation and saw the Accepted status with the exact total. Alongside the "
              "scripted journey, the PART 80 decline flow was walked end to end with an optional "
              "reason, ending with both sides seeing Declined and the provider notified."),
        ("h2", "Responsive checks (PART 53)"),
        ("table", {
            "title": "Table 16.1 - Viewport sweep results.",
            "headers": ["Viewport", "Surfaces checked", "Horizontal overflow", "Critical console errors"],
            "ratios": [0.16, 0.44, 0.2, 0.2],
            "rows": [
                ["390 px", "Quote form, boards, document, request detail", "None", "None"],
                ["768 px", "Quote form, boards, document, request detail", "None", "None"],
                ["1440 px", "Quote form, boards, document, request detail", "None", "None"],
            ],
        }),
        ("p", "On mobile the form switches from the desktop table to stacked item cards and the "
              "boards switch to cards; on desktop the professional tables carry the density. "
              "The sweep measured scrollWidth against clientWidth on every page and found zero "
              "overflow at all three widths, and the console carried only development-mode "
              "notices - hot-reload messages and one next-auth URL warning that predates this "
              "phase - with zero critical errors. Evidence screenshots of the sent quotation, "
              "the customer document, the acceptance, the declined state and the mobile document "
              "are committed with the E2E work."),
    ],
}

CH17 = {
    "num": 17, "title": "Performance and Known Issues",
    "blocks": [
        ("h2", "Performance (PART 60)"),
        ("p", "The data-access patterns follow the fixed-query discipline the platform uses "
              "everywhere. The quote detail loads the quote, its items, the request with service "
              "and location names, the provider display and the customer display in one include - "
              "no N+1 chains. The board list runs a fixed trio of queries: one page of rows with "
              "their joins, one count, and one grouped count for the status tabs. The "
              "request-scoped comparison list is a single indexed query on the jobRequestId "
              "foreign key, which the schema has indexed since Phase 2. Pagination is standard "
              "page and page-size with clamped bounds. Nothing in the phase introduced a "
              "background job, a queue or a cache to reason about."),
        ("h2", "Known issues"),
        ("bullet", [
            "Client display-mirror defect (found and fixed in E2E): the quote form's "
            "convenience totals mixed cedis and pesewas and displayed amounts one order of "
            "magnitude small (GH₵35.00 where GH₵350.00 was correct). The stored values were "
            "never wrong - the server always computes its own - and the fix aligns the mirror "
            "with finance.lineTotalAmount. The suite now asserts stored totals independently.",
            "Discount null handling (found and fixed in E2E): the form sends an explicit null "
            "to clear the discount, which the schema's optional() alone rejected with a 422. "
            "The schema now accepts null with clear-on-edit semantics.",
            "Environment repairs were required twice this phase (the recurring post-rebuild "
            "pattern): the .env lost AUTH_SECRET, and the development database had been "
            "created by db push without migration history. Both were repaired - the secret "
            "regenerated, the database rebuilt from the six migrations and reseeded - and the "
            "rate-limit enablement flag was restored so the flood tests behave as in Phase 5.",
            "The dev-mode next-auth NEXTAUTH_URL warning remains visible in server logs; it "
            "predates this phase, is configuration-level, and has no functional effect on "
            "quotation behaviour.",
        ]),
    ],
}

CH18 = {
    "num": 18, "title": "Deferred Features, Git Commits, Test Counts and the Phase 7 Recommendation",
    "blocks": [
        ("h2", "Deferred features (PART 37)"),
        ("bullet", [
            "Payments in every form - gateway, mobile money, cards, bank transfer, escrow, "
            "wallet, checkout, confirmation, refunds, commission and platform fees - plus the "
            "Payment-model integration; the accepted quote is the clean handoff boundary.",
            "WhatsApp, SMS and email delivery for quotation notifications; the architecture is "
            "channel-ready.",
            "Quotation revisions and versioning: a sent quote is never silently edited, and no "
            "revision workflow was required for correctness this phase.",
            "Tax configuration (VAT, NHIL, GETFund levy) as a separate controlled feature.",
            "Print/PDF download beyond the print stylesheet; the document is print-friendly "
            "today and a formal generator remains future work.",
            "Advanced comparison: ranking or AI assistance over multiple quotations; the "
            "honest comparison table is the deliberate Phase 6 foundation.",
            "Equipment-rental workflows, project management, full messaging UI and analytics "
            "dashboards - unchanged from earlier phase deferrals.",
        ]),
        ("h2", "Git commits (PART 38)"),
        ("table", {
            "title": "Table 18.1 - Phase 6 commit ledger (in order).",
            "headers": ["Commit", "Content"],
            "ratios": [0.2, 0.8],
            "rows": [
                ["8db5ba2", "Quote engine: central state machine, lifecycle service, quotes API, vocabulary extensions, notes migration"],
                ["70ff26e", "Repo hygiene: untrack transient tool-results and upload artifacts"],
                ["d5dd265", "Quotation UI: form with preview, customer document, boards, CREATE QUOTE wiring"],
                ["8a9c487", "verify:phase6 suite (109 checks) + engine hardening from test findings"],
                ["e257683", "Form money-display fix + decline-null schema fix + E2E evidence screenshots"],
                ["9332f20", "Documentation: QUOTATIONS.md, architecture, database and README updates"],
                ["(this)",  "Phase 6 report PDF and final ledger commit"],
            ],
        }),
        ("h2", "Exact test counts (PART 39)"),
        ("table", {
            "title": "Table 18.2 - Combined verification battery (fresh runs, all green).",
            "headers": ["Suite", "Checks", "Scope"],
            "ratios": [0.3, 0.16, 0.54],
            "rows": [
                ["verify (Phase 1)", "48", "Foundation: env, fonts, security headers, health"],
                ["verify:phase2", "106", "Domain, storage, messaging, authorization"],
                ["verify:phase3", "73", "Authentication, onboarding, dashboards"],
                ["verify:phase4", "56", "Discovery engine, acceptance, privacy, SEO"],
                ["verify:phase5", "94", "Job-request lifecycle and security"],
                ["verify:phase6", "109", "Quotation lifecycle and security"],
                ["Total", "486", "All six suites green, dev and clean databases"],
            ],
        }),
        ("p", "The clean-database test rebuilt the database from all six migrations, reseeded "
              "it, and re-ran every suite green on the fresh data, confirming discovery, job "
              "requests, provider responses and quotations end to end. TypeScript strict "
              "compilation and ESLint report zero errors across the repository."),
        ("h2", "Phase 7 recommendation (PART 40)"),
        ("p", "The natural next phase is the one the product has been pointing at since the "
              "first quotation was accepted: payments. The clean boundary is already in place - "
              "an accepted quotation with its committed request, its audit trail and its "
              "timeline - so a payment phase can consume Quote.status ACCEPTED without touching "
              "the quotation engine: mobile money first, given the Ghanaian market, then cards "
              "and bank transfer, with escrow and platform fees as deliberate, separately "
              "reviewed decisions. If the owner prefers to broaden the marketplace before "
              "monetising, the next most valuable increments are quotation revisions for "
              "negotiation, messaging between the two sides of an accepted engagement, or "
              "reviews once jobs complete. As always with this project: the gate belongs to the "
              "owner, and Phase 7 does not start without explicit approval."),
        ("h2", "Handover status"),
        ("p", "The working tree is clean and the phase is delivered in the same state as every "
              "previous one: source, tests, evidence screenshots, documentation and this report "
              "are committed, and the running system is the one that was verified. The database "
              "carries the six migrations in order, the seed reproduces the demo world from "
              "scratch, and the eight command-line suites re-prove the whole platform from a "
              "clean checkout in minutes. A reviewer who wants to confirm any single claim in "
              "this report can do so by running the named suite - every check prints its own "
              "pass and failure, and none of the numbers in these pages were transcribed by "
              "hand from memory."),
        ("p", "For the project owner, the practical reading is simple. A Ghanaian customer can "
              "now find a provider anywhere in the country, describe the job with photos, "
              "receive an itemised quotation in cedis, compare it against other offers on the "
              "same request, and accept or decline it - and the provider's price can be trusted "
              "because no browser anywhere in the flow was ever allowed to state an amount. "
              "Everything beyond that point - collecting the money, holding it in escrow, "
              "settling the provider, taking the platform's fee - is deliberately unbuilt "
              "ground, marked by an accepted quotation and a committed request. That is the "
              "door Phase 7 opens, and it opens only on the owner's word."),
    ],
}
