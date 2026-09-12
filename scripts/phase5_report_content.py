# -*- coding: utf-8 -*-
"""Dwellers Phase 5 Request Service / Job Requests - report content (data only). ASCII-safe."""

TITLE = "Dwellers - Phase 5 Request Service / Job Requests Report"
SUBJECT = ("Delivery record for the Phase 5 REQUEST SERVICE / JOB REQUESTS build: "
           "the real job-request workflow, state machine, attachments, notifications and verification")

# Block kinds: h2, h3, p, bullet, table, callouts, quote
# table: {"title": str|None, "headers": [...], "rows": [[...]], "ratios": [...], "size": pt}

CH1 = {
    "num": 1, "title": "Executive Summary",
    "blocks": [
        ("callouts", [
            ("94", "Phase 5 verification checks, all passing"),
            ("377", "Total checks across the five suites"),
            ("26 / 26", "Browser E2E steps across three viewports"),
            ("10 / 10", "Critical acceptance tests passing"),
        ]),
        ("p", "Phase 5 of the Dwellers platform completed the transformation that the product "
              "story has demanded since the beginning: the Request Service button now creates a "
              "real job request in the database, the targeted provider genuinely receives and "
              "responds to it, and the customer sees that response in a timeline built from real "
              "events. Building strictly on the Phase 1 security foundation, the Phase 2 domain "
              "backend, the Phase 3 authentication layer and the Phase 4 discovery engine, the "
              "phase delivered the full journey the owner's brief specified: FIND, SELECT "
              "PROVIDER, DESCRIBE JOB, ADD LOCATION, ADD PHOTOS, SUBMIT, PROVIDER RECEIVES "
              "REQUEST, PROVIDER RESPONDS, CUSTOMER SEES RESPONSE. The work was performed against "
              "the 86-part Phase 5 requirements brief, and every part of that brief is accounted "
              "for in this report. Nothing from Phases 1 to 4 was rebuilt, replaced or duplicated "
              "- no second authentication system, no second messaging, location, provider or "
              "quotation system."),
        ("p", "Three design decisions define the phase. First, the state machine is central: a "
              "client never submits a status, only an action, and a single server module decides "
              "the resulting state - so a customer forcing status = ACCEPTED through a PATCH "
              "request is stripped at the validation boundary and refused at the machine. Second, "
              "everything is atomic and honest: every transition writes its timeline event, its "
              "audit record and its notification inside one database transaction, and a failed "
              "submission never tells the customer that it succeeded. Third, privacy is structural: "
              "the provider sees a customer display name only, job photos stream through an "
              "authorization-checked route instead of public storage URLs, and job requests never "
              "appear in public APIs, the sitemap or SEO pages."),
        ("p", "The proof is behavioural. The new verify-phase5 suite adds 94 checks on top of the "
              "Phase 1 (48), Phase 2 (106), Phase 3 (73) and Phase 4 (56) suites for a combined "
              "battery of 377 checks, all green, including the ten critical acceptance tests of "
              "the brief: the Raymond-to-Kwame Nsawam plumbing request with three photos; the "
              "provider receiving, viewing and responding; the customer seeing the response; "
              "rejection of a service the provider does not offer; rejection of an invalid "
              "region/district/town combination; double-click protection; the IDOR matrix for "
              "customers, providers and attachments; the client-controlled-status refusal; and "
              "the suspended-provider guard. A clean-database rebuild was executed again this "
              "phase, and a 26-step browser E2E walked the complete customer-to-provider-to-"
              "customer journey at 390, 768 and 1440 pixel widths with zero console errors and "
              "zero horizontal overflow. The project now sits at the Phase 6 gate, Quotations, "
              "awaiting the project owner's explicit approval."),
    ],
}

CH2 = {
    "num": 2, "title": "Objective, Scope and Phase Ledger",
    "blocks": [
        ("h2", "2.1  Objective"),
        ("p", "The Phase 5 brief states the objective directly: transform the existing Request "
              "Service button into a REAL job-request workflow. Before this phase the button "
              "honestly announced that requests arrive with the next release; nothing was faked, "
              "and nothing was stored. After this phase, the button opens a six-step request "
              "wizard that creates a durable JobRequest row, notifies the provider, records every "
              "lifecycle event, and gives both sides a professional tracking surface. Thirteen "
              "numbered customer capabilities from the brief - find, select, describe, locate, "
              "detail, attach, schedule, review, submit, confirm, track, provider receipt, "
              "provider response, customer visibility - are each implemented and each covered by "
              "an automated check."),
        ("h2", "2.2  Scope discipline"),
        ("p", "The phase reused, extended or at most touched four seams of the existing "
              "architecture, and built nothing parallel. The Prisma schema gained one model and "
              "five columns, all documented below; no existing model changed meaning. The "
              "job-request service module kept its role as the single owner of request logic. "
              "The API route tree kept its established handler factory, envelope and error "
              "conventions. The dashboard shells, navigation configuration and discovery "
              "components were extended, not replaced. The quotation system, messaging "
              "conversations, payments and analytics dashboards of later phases were left "
              "exactly where Phase 4 put them: as ready foundations with clean seams."),
        ("h2", "2.3  Phase ledger"),
        ("table", {
            "title": None,
            "headers": ["Phase", "Scope", "Status"],
            "ratios": [0.10, 0.62, 0.28],
            "size": 9,
            "rows": [
                ["1", "Foundation, architecture and standards", "Complete (gate: PASS WITH CONDITIONS)"],
                ["2", "Database schema and backend foundation", "Complete"],
                ["3", "Authentication, registration, role dashboards", "Complete"],
                ["4", "Find / Nationwide Discovery", "Complete"],
                ["5", "Request Service / Job Requests", "Complete - this report"],
                ["6+", "Quotations, payments, messaging, commerce", "Awaiting owner approval"],
            ],
        }),
        ("p", "Per the project's gate discipline, Phase 6 has not been started. The final section "
              "of this report records the recommendation for that phase and nothing more."),
    ],
}

CH3 = {
    "num": 3, "title": "Customer Workflow",
    "blocks": [
        ("p", "The customer journey begins exactly where Phase 4 ended. A customer searching "
              "Plumbing in Nsawam reaches the provider results page, opens Kwame's profile, and "
              "presses Request service. If the customer is anonymous, the click routes to sign-in "
              "with the destination and the intended action encoded in the callback URL - the "
              "browser E2E walked this round trip and verified that after authentication the "
              "customer lands directly inside the request wizard for the chosen provider, with "
              "the intent never lost. If the customer is already signed in, the click goes "
              "straight to the wizard."),
        ("p", "The wizard at /request-service/[providerId] is a focused multi-step form, never "
              "one endless page. Step one lists the services the provider genuinely offers, with "
              "the honest constraint that no other service can be chosen; the server re-validates "
              "this on submission, so even a forged request naming a service the provider does "
              "not list is rejected. Step two collects the job title and description with live "
              "character counters and the brief's limits of 10 to 120 and 10 to 5,000 characters. "
              "Step three selects the job location through the existing Region, District, Town "
              "cascade plus an optional community list and a free-text landmark field. Step four "
              "captures the schedule: as soon as possible, a specific date that cannot be in the "
              "past, or flexible, together with a preferred time slot and an urgency of normal, "
              "urgent or emergency. Step five uploads photos. Step six renders the complete "
              "review, and only the server's confirmation moves the customer to the confirmation "
              "page."),
        ("p", "A draft exists from the moment the wizard opens. This is deliberate: photos must "
              "upload against a real request row through the established storage pipeline before "
              "submission, and a draft is also the honest answer to abandonment - the customer "
              "sees the draft in My Job Requests and can continue or cancel it. Draft creation is "
              "idempotent on a browser-generated client token held in session storage, so a page "
              "refresh or a retried request resolves to the same draft instead of piling up "
              "duplicates. The submission itself carries all fields plus the submit action; the "
              "server re-validates everything and only a confirmed response navigates the "
              "customer to the confirmation view with the human-friendly reference, the status "
              "and the next step."),
    ],
}

CH4 = {
    "num": 4, "title": "Provider Workflow",
    "blocks": [
        ("p", "Providers receive requests through the dashboard section Job Requests, now live "
              "for every provider role: artisan, contractor, construction company, supplier and "
              "equipment provider. The board organises work the way the brief describes - New, "
              "Active, Completed, Declined and Cancelled sections, expanded server-side from the "
              "state machine so the client cannot invent a section or widen a scope. Each row "
              "shows the request reference, the service, the job title, the job location, the "
              "requested timing, the photo count and the status, with urgent and emergency "
              "requests visually flagged."),
        ("p", "Opening a request shows everything a provider needs to decide: the service, the "
              "full description, the location with the landmark text, the preferred timing, the "
              "urgency, the photos, and the customer as a display name only - first name and last "
              "initial, never an email or phone number. The first provider-side open records the "
              "real VIEWED event exactly once, so the customer's timeline later shows when the "
              "provider actually looked. Where the job location falls outside the provider's "
              "listed service areas, the page says so plainly rather than pretending otherwise."),
        ("p", "The response panel offers the brief's three actions - I am interested, Ask for "
              "more info, and Decline - with an optional message of up to one thousand "
              "characters. Responding is a single server action: the status moves through the "
              "state machine, the response kind and timestamp are stored, the message becomes a "
              "timeline entry, the customer is notified inside the same transaction, and the "
              "panel is replaced by an honest record of the response that was made. A second "
              "response attempt is refused by the machine. Business-affiliated providers see the "
              "same surface, but the authorization layer grants the respond actions only to "
              "active owner or manager members; a plain member receives a read-only explanation "
              "instead of buttons that would fail."),
    ],
}

CH5 = {
    "num": 5, "title": "Job Request State Machine",
    "blocks": [
        ("p", "The state machine lives in one module, src/modules/projects/job-request-state.ts. "
              "It preserves the Phase 2 status vocabulary - DRAFT, SUBMITTED, MATCHING, RESPONDED, "
              "ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED - and adds one status the brief's "
              "provider dashboard requires: DECLINED, the real, terminal outcome of a provider "
              "saying no. Every action a client can submit is an entry in a central table; every "
              "state change in the service layer passes through the same assertTransition guard. "
              "There is no code path anywhere in the application that sets a status from client "
              "input."),
        ("table", {
            "title": "Permitted transitions (the complete set)",
            "headers": ["Action", "Actor", "Permitted from", "Resulting status"],
            "ratios": [0.20, 0.13, 0.40, 0.27],
            "size": 8.5,
            "rows": [
                ["submit", "Customer", "DRAFT", "SUBMITTED"],
                ["edit", "Customer", "DRAFT", "unchanged"],
                ["cancel", "Customer", "DRAFT, SUBMITTED, MATCHING, RESPONDED", "CANCELLED"],
                ["respond_interested", "Provider", "SUBMITTED, MATCHING", "RESPONDED (INTERESTED)"],
                ["respond_info", "Provider", "SUBMITTED, MATCHING", "RESPONDED (NEEDS_INFO)"],
                ["respond_declined", "Provider", "SUBMITTED, MATCHING", "DECLINED"],
            ],
        }),
        ("p", "The machine's security properties were tested directly. A customer's respond "
              "actions are structurally impossible because no customer source states exist for "
              "them; a provider cannot act on a completed, cancelled or already-responded "
              "request; staff cannot perform any business transition at all; and a cancelled "
              "request can never be re-accepted. At the HTTP boundary the same properties were "
              "confirmed end to end: a PATCH carrying status = ACCEPTED has the unknown key "
              "stripped by validation, the remaining edit refused because the request is not a "
              "draft, and the stored status verified unchanged by a fresh read."),
        ("p", "Terminal states are terminal: COMPLETED, DECLINED and CANCELLED allow no further "
              "transitions of any kind. The customer's cancel path deliberately remains open "
              "while a request waits for a provider or carries an early response, and closes "
              "once the engagement has committed further - the exact cut-off the brief asks for, "
              "enforced server-side with a confirmation step in the interface."),
    ],
}

CH6 = {
    "num": 6, "title": "Request Form, Location and Attachments",
    "blocks": [
        ("h2", "6.1  The form and its fields"),
        ("p", "The wizard's complete field set, with the validation each field carries on both "
              "sides of the wire, is listed below. Nothing asks the customer for technical "
              "knowledge; nothing asks for contact details the account already holds; and every "
              "limit in the brief is enforced by the server regardless of what the browser "
              "allows."),
        ("table", {
            "title": "Request fields",
            "headers": ["Field", "Required at submit", "Rules"],
            "ratios": [0.24, 0.18, 0.58],
            "size": 8.5,
            "rows": [
                ["Service", "Yes when a provider is targeted", "must be offered by that provider, active and available"],
                ["Title", "Yes", "10-120 characters, trimmed"],
                ["Description", "Yes", "10-5,000 characters, control characters rejected"],
                ["Job location (town)", "Yes", "must exist and be active in the Ghana hierarchy"],
                ["Community / area", "Optional", "must belong to the chosen town - hierarchy validated server-side"],
                ["Address / landmark", "Optional", "up to 200 characters of free text"],
                ["Preferred timing", "Optional", "ASAP, or a date not in the past, or flexible; time slot; urgency"],
                ["Budget range", "Optional", "integer pesewas; maximum cannot be below minimum"],
                ["Photos", "Optional", "up to 10 JPEG/PNG/WEBP files, 10 MB each"],
            ],
        }),
        ("h2", "6.2  Job location and the Ghana hierarchy"),
        ("p", "The job location is chosen through the live location API - Region, District, "
              "Town, then an optional community list - and it is explicitly independent of the "
              "customer's own profile location, exactly as the brief requires: a customer living "
              "in Accra can need a plumber in Nsawam. Cascading selectors are never trusted: the "
              "server re-resolves every reference and rejects a community that belongs to a "
              "different town, a town that does not exist, or a community submitted without a "
              "town. When the chosen town lies outside the provider's listed service areas the "
              "interface shows an honest notice and the request is still permitted, because the "
              "provider - not the system - decides whether to take the job."),
        ("h2", "6.3  Photos and their security"),
        ("p", "Uploads use the existing storage abstraction with a dedicated job-attachment "
              "policy: JPEG, PNG and WEBP only, ten megabytes each, SVG categorically blocked as "
              "a stored-XSS vector, filenames sanitised and keys generated as category-scoped "
              "UUIDs so client data never influences the physical path. The cap of ten photos per "
              "request is enforced against the live attachment count. The photo bytes are served "
              "back only through an authorization-checked route that verifies the caller is the "
              "owning customer, the targeted provider side or staff - storage keys are never "
              "exposed in any payload, and foreign probes of an attachment receive the same "
              "opaque 404 as any other missing resource. Removing a photo deletes the row and the "
              "binary and writes the real ATTACHMENT_REMOVED event."),
    ],
}

CH7 = {
    "num": 7, "title": "Provider Response, Notifications and Messaging",
    "blocks": [
        ("h2", "7.1  The response actions"),
        ("p", "The response workflow is the first provider-side decision surface in the product. "
              "Interested, ask-for-more-info and decline each map through the central machine to "
              "a distinct outcome, and each accepts an optional message that becomes part of the "
              "permanent timeline. The response is stored with the acting user and role; the "
              "customer's view renders the response card with the exact message text; and the "
              "request's responseKind column gives dashboards their honest grouping. Because "
              "responding implies reading, the first response also fixes the viewed timestamp if "
              "the provider somehow never opened the request."),
        ("h2", "7.2  Notifications"),
        ("p", "Two in-app notification types were added to the existing notification architecture "
              "- no new table, no new system. When a request is submitted, the targeted provider "
              "user receives New service request in Nsawam, with the service named and the "
              "request linked. When the provider responds, the customer receives one of three "
              "wordings: accepted, needs more information, or declined. Both notifications are "
              "created inside the same database transaction as the change that caused them, so a "
              "state change can never exist without its notification. Email, SMS and WhatsApp "
              "remain deliberately absent - the Notification model's channel column and sentAt "
              "bookkeeping are already schema-ready for those later integrations, and no external "
              "provider is a dependency of this phase."),
        ("h2", "7.3  Messaging foundation"),
        ("p", "The phase uses the existing communication foundation where it genuinely helps and "
              "leaves full conversations where the roadmap already placed them. The provider's "
              "ask-for-info response carries its message as a timeline entry visible to the "
              "customer, which answers the brief's request-more-information flow without inventing "
              "a second messaging model. The profile's Message provider button remains an honest "
              "placeholder that sends nothing, and the dashboard navigation continues to mark "
              "full messaging for Phase 6. Conversation and ConversationParticipant models - with "
              "their jobRequestId link - are untouched and ready."),
    ],
}

CH8 = {
    "num": 8, "title": "API and Database",
    "blocks": [
        ("h2", "8.1  Endpoints"),
        ("p", "Eight endpoints carry the phase, built on the established handler factory with "
              "its fixed pipeline: rate limit, authentication with a live account-status "
              "re-check, RBAC, Zod validation, ownership, business rules, database transaction, "
              "audit event and the standard response envelope. The two Phase 2 routes were "
              "extended rather than replaced, and the brief's suggested submit and cancel paths "
              "remain actions on the existing PATCH route exactly as the brief permits."),
        ("table", {
            "title": "Phase 5 API surface",
            "headers": ["Endpoint", "Change", "Purpose"],
            "ratios": [0.42, 0.13, 0.45],
            "size": 8.5,
            "rows": [
                ["POST /api/job-requests", "extended", "idempotent create; draft or direct submit; returns authorized detail"],
                ["GET /api/job-requests", "extended", "role-scoped list with status and statusGroup filters"],
                ["GET /api/job-requests/[id]", "extended", "detail + timeline; provider side marks VIEWED once"],
                ["PATCH /api/job-requests/[id]", "extended", "customer actions: edit, submit, cancel"],
                ["POST /api/job-requests/[id]/respond", "new", "provider response actions with optional message"],
                ["POST /api/job-requests/[id]/attachments", "new", "multipart photo upload through the storage policy"],
                ["GET /api/job-requests/[id]/attachments/[attachmentId]", "new", "authorization-checked photo streaming"],
                ["DELETE /api/job-requests/[id]/attachments/[attachmentId]", "new", "customer removes a photo while editable"],
            ],
        }),
        ("h2", "8.2  Schema changes"),
        ("p", "The migration phase5_job_request_lifecycle is deliberately small. The JobRequest "
              "table gains five nullable columns: urgency, viewedAt, respondedAt, responseKind "
              "and clientToken, the last with a unique index that makes duplicate submission "
              "impossible at the database level. A new JobRequestEvent table stores the append-"
              "only timeline with an index on request and creation time. The attachment table "
              "gains an uploadedById audit column and defaults its kind to PHOTO. No existing "
              "column changed type or meaning, no model was duplicated, and the clean-database "
              "rebuild test applied all five migrations from zero and reseeded without error."),
        ("h2", "8.3  Money"),
        ("p", "The existing money policy stands unchanged: the Ghanaian currency is recorded as "
              "GHS, amounts are integer pesewas, floating point is never used, and the optional "
              "budget range on a request is validated so the maximum cannot sit below the "
              "minimum. No new money abstraction was introduced, and quotation pricing remains "
              "entirely outside this phase."),
    ],
}

CH9 = {
    "num": 9, "title": "Security and Audit Trail",
    "blocks": [
        ("h2", "9.1  The security review, point by point"),
        ("p", "The brief's security review lists fifteen areas; each is enforced by structure "
              "and each was exercised by a test. Authentication guards every endpoint, with the "
              "live database re-check suspending an account mid-session. RBAC keeps projects:create "
              "customer-only, so providers cannot file requests at themselves. Ownership is "
              "resolved through one service-level resolver that returns the caller's side - "
              "customer, provider or staff - and the canManage decision for business members; "
              "everyone else receives the same 404 an anonymous visitor would get. State "
              "transitions belong to the central machine. Validation strips unknown fields and "
              "rejects malformed identifiers with 422s. Rate limiting uses the standard preset "
              "on request routes, the upload preset on attachments and the auth preset on "
              "sign-in, returning 429 with Retry-After."),
        ("p", "The PART 65 IDOR matrix was executed over live HTTP with real sessions for every "
              "row: customer A viewing, editing, cancelling or attaching to customer B's request; "
              "customer A touching the provider response endpoint; provider A viewing or "
              "responding to provider B's request; a provider deleting a foreign attachment; and "
              "a business member attempting protected actions. Every attempt returned 404 or 403, "
              "never 200 and never 500, and no response was created. A request enumeration probe "
              "through the public discovery API and the sitemap found no request identifiers and "
              "no private URLs."),
        ("h2", "9.2  The audit trail"),
        ("p", "The append-only audit log gained nine job-request actions: created, submitted, "
              "updated, viewed, responded, declined, attachment_added, attachment_removed and "
              "cancelled. Each records the actor, role, entity and a minimal metadata object; "
              "passwords, secrets and unnecessary personal data are excluded by the existing "
              "redaction pipeline, and audit failures can never break the business operation. "
              "The verification suite asserts that every one of the nine actions appears for the "
              "fixture lifecycle."),
    ],
}

CH10 = {
    "num": 10, "title": "Test Results",
    "blocks": [
        ("callouts", [
            ("94", "verify:phase5 checks"),
            ("377", "checks across all five suites"),
            ("0", "failures anywhere"),
        ]),
        ("p", "The verification architecture follows the established two-level pattern. The "
              "service level runs against an isolated database rebuilt from the migration files, "
              "exercising the state machine, validation rules, transactions, notifications, "
              "audit, analytics, attachments, business permissions and suspension guards directly. "
              "The HTTP level runs against the live development server with real NextAuth "
              "sessions, real middleware and the seeded demo database, exercising the acceptance "
              "journeys, the IDOR matrix, upload limits, rate limiting and privacy over the wire. "
              "Nothing is mocked: every check goes through the same code paths the product uses."),
        ("table", {
            "title": "Combined verification battery (this phase's fresh run)",
            "headers": ["Suite", "Checks", "Result"],
            "ratios": [0.56, 0.22, 0.22],
            "size": 9,
            "rows": [
                ["verify (foundation)", "48 / 48", "pass"],
                ["verify:phase2", "106 / 106", "pass"],
                ["verify:phase3", "73 / 73", "pass"],
                ["verify:phase4", "56 / 56", "pass"],
                ["verify:phase5", "94 / 94", "pass"],
                ["Total", "377 / 377", "pass"],
            ],
        }),
        ("p", "Two suites required small, honest updates this phase and both are recorded here. "
              "The Phase 2 suite's draft fixture now carries a title and location before "
              "submission, because Phase 5 enforces the brief's submit-time completeness rules "
              "that Phase 2 predated. The Phase 5 suite itself gained three defect-driven checks "
              "during development, described in the Known Issues chapter: the envelope shape of "
              "the list endpoint, the oversized-upload status code and the binary streaming "
              "route. TypeScript passes with zero errors and ESLint with zero warnings; both are "
              "part of the completion standard and were run fresh before this report."),
    ],
}

CH11 = {
    "num": 11, "title": "Acceptance Tests",
    "blocks": [
        ("p", "The brief defines ten critical acceptance tests. All ten were automated - nine in "
              "verify:phase5 at both service and HTTP level, and the full browser journey as the "
              "26-step end-to-end walk reported in the next chapter. The table records each test "
              "with its expected outcome and its actual result in this phase's fresh runs, "
              "including on the clean-database rebuild."),
        ("table", {
            "title": "The ten critical acceptance tests",
            "headers": ["#", "Test", "Expected", "Result"],
            "ratios": [0.05, 0.47, 0.34, 0.14],
            "size": 8.5,
            "rows": [
                ["1", "Raymond files Fix leaking bathroom pipe, Plumbing, Nsawam, photos, ASAP", "one real SUBMITTED request with all data persisting", "pass"],
                ["2", "Provider opens Job Requests, views everything, responds with a message", "response stored, status per machine, customer notified", "pass"],
                ["3", "Customer opens My Job Requests and the request", "response visible, timeline updated", "pass"],
                ["4", "Electrical submitted to the plumber", "server rejects; no request created", "pass"],
                ["5", "Invalid region/district/community combination", "422 with field error; nothing created", "pass"],
                ["6", "Double-click submit", "exactly one request exists", "pass"],
                ["7", "Customer A reads customer B's request", "404, never 200", "pass"],
                ["8", "Provider A responds against provider B's request", "404; no response created", "pass"],
                ["9", "Customer PATCH with status = ACCEPTED", "rejected; server owns state", "pass"],
                ["10", "Suspended provider attempts to act", "current account rules applied; no protected action", "pass"],
            ],
        }),
        ("p", "Acceptance test one deserves its sentence: on a freshly migrated and seeded "
              "database, Raymond filed the leaking-bathroom-pipe request against Kwame's plumbing "
              "service in Nsawam with photos and an as-soon-as-possible schedule; one JobRequest "
              "row was created with status SUBMITTED and reference JR-Y3FCNUXU on the clean-"
              "database run; the provider, service, location, urgency and attachments all "
              "persisted across a server restart and a page refresh."),
    ],
}
