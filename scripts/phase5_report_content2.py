# -*- coding: utf-8 -*-
"""Dwellers Phase 5 report content, part two (chapters 12-13 + front matter constants). ASCII-safe."""

CH12 = {
    "num": 12, "title": "Browser End-to-End, Performance and Known Issues",
    "blocks": [
        ("h2", "12.1  The 26-step browser journey"),
        ("p", "The brief's end-to-end script was walked in a real browser against the live "
              "application: open Dwellers, search Plumbing, select Nsawam through the cascade, "
              "open the provider, press Request service, sign in as the customer, land in the "
              "wizard, fill the title and description, select the location, choose the preferred "
              "timing, upload a photo, review, submit, see the confirmation with the reference, "
              "open My Job Requests, open the request details; then as the provider - sign in, "
              "open Job Requests, open the customer's request, view the job details and photos, "
              "respond with a message; then as the customer again - return to the request, see "
              "the provider's response and the updated status. All twenty-six steps passed, and "
              "screenshots of the run are committed alongside the test evidence."),
        ("h2", "12.2  Responsive and console checks"),
        ("p", "The customer pages, the wizard, the results page and the home page were swept at "
              "390, 768 and 1440 pixel widths measuring horizontal overflow directly from the "
              "DOM. The sweep found one genuine defect: the site header showed its desktop "
              "navigation at 768 pixels, pushing the page three hundred and nine pixels wide. "
              "The fix moved the desktop navigation to the large breakpoint, where the mobile "
              "anchor strip takes over below it, and the same sweep then reported zero overflow "
              "at every viewport on every page. The browser console was captured across all key "
              "pages at the end of the run: zero errors."),
        ("h2", "12.3  Performance"),
        ("p", "The phase adds one indexed table and five nullable columns; every hot query is "
              "served by existing or new indexes - request lookups by primary key, provider "
              "boards by the new provider-and-status index, timelines by the request-and-time "
              "index, and the unique clientToken index turns duplicate protection into a single "
              "lookup. List endpoints paginate through the shared clamped pagination contract "
              "and select only the columns the interface renders; the detail route loads the "
              "request, its events and its attachments in a fixed number of queries with no "
              "N-plus-one pattern. The heaviest transaction - submission with attachments, "
              "events, and provider notification - completed in tens of milliseconds on the "
              "development hardware, and the response transaction behaves the same."),
        ("h2", "12.4  Known issues"),
        ("table", {
            "title": "Real issues found during verification, and their state",
            "headers": ["Issue", "Found by", "State"],
            "ratios": [0.55, 0.18, 0.27],
            "size": 8.5,
            "rows": [
                ["Provider board read the list envelope as an object; the data is the array - crashed after first fetch", "browser E2E", "fixed + regression-tested"],
                ["Oversized upload bodies exceeded the framework cap and surfaced as 500", "verify:phase5", "fixed: honest 413"],
                ["Photo streaming route returned a bare Response, which the factory wrapped as JSON", "verify:phase5", "fixed: NextResponse passthrough"],
                ["Customer display initials mishandled parenthesised name suffixes", "browser E2E", "fixed"],
                ["Header navigation overflowed 768-pixel viewports", "responsive sweep", "fixed"],
                ["Avatar upload route shares the oversized-body failure mode of 8.2", "code review", "recorded, pre-existing, untouched by this phase"],
            ],
        }),
    ],
}

CH13 = {
    "num": 13, "title": "Deferred Features, Git and the Phase 6 Recommendation",
    "blocks": [
        ("h2", "13.1  Deliberately deferred"),
        ("p", "The brief's do-not-build list is respected in full: no payment gateway, checkout, "
              "escrow or quotation marketplace; no WhatsApp, SMS or advanced email automation; no "
              "equipment rental transactions, project management, AI recommendations or "
              "construction cost estimator; no advanced analytics dashboard. The Quote model "
              "remains exactly as Phase 2 defined it, ready for the next phase. Within messaging, "
              "the request-scoped response message is the extent of the surface, and full "
              "conversations stay deferred. Saved providers, favourites and review flows also "
              "remain on their roadmap rows."),
        ("h2", "13.2  Git state"),
        ("p", "The phase was delivered in four reviewed commits plus one evidence commit: the "
              "engine (state machine, lifecycle service, respond and attachment APIs, migration), "
              "the frontend (wizard, customer and provider surfaces, navigation, header fix), the "
              "tests (the 94-check suite, seed fixtures, the adapted Phase 2 fixture) and the "
              "documentation (JOB_REQUESTS.md plus the architecture, database and readme "
              "updates), followed by the end-to-end screenshots. The working tree is clean of "
              "unstaged changes, the history is linear, and the branch is pushed to origin with "
              "head at e2dc074."),
        ("h2", "13.3  Phase 6 recommendation"),
        ("p", "The natural next phase is Quotations: JobRequest to Provider Response to Quote to "
              "Customer Reviews Quote to Accept or Decline. The foundation is genuinely ready - "
              "the Quote and QuoteItem models with their server-computed totals in integer "
              "pesewas, the RESPONDED state whose responseKind distinguishes interested providers "
              "from the rest, the customer and provider surfaces that a quote thread attaches to, "
              "and the notification architecture that carries the next event. A quotation phase "
              "would let the provider price labour, materials, equipment and other costs against "
              "a specific request, keep totals server-computed under the existing money policy, "
              "and give the customer a side-by-side comparison surface. Payment integration "
              "should remain outside that phase: acceptance and escrow-shaped flows deserve "
              "their own gate."),
        ("h2", "13.4  Handover summary"),
        ("p", "What the owner receives with this phase is best expressed as the things that are "
              "now true. A customer with an account can find any provider in the country and ask "
              "them for service without a phone call; the request exists as a durable row with a "
              "shareable reference, a photo set, a verified location and a schedule. The provider "
              "sees that request in a dashboard built for decisions, responds once, and the "
              "response reaches the customer as a notification and a permanent timeline entry. "
              "Every step of that journey is guarded by authentication, role checks, ownership "
              "resolution and the central state machine; every step is auditable; and every step "
              "was proven twice over - once by 94 automated checks and once by a human-path "
              "browser walk."),
        ("table", {
            "title": "Where the deliverables live",
            "headers": ["Artifact", "Location"],
            "ratios": [0.34, 0.66],
            "size": 8.5,
            "rows": [
                ["State machine and lifecycle service", "src/modules/projects/job-request-state.ts, job-request-service.ts"],
                ["API surface", "src/app/api/job-requests/** (8 endpoints)"],
                ["Customer surfaces", "/request-service/[providerId], /customer/requests, /customer/requests/[id]"],
                ["Provider surfaces", "/artisan /contractor /company /supplier /equipment - /requests and /requests/[id]"],
                ["Verification suite", "scripts/verify-phase5.ts via bun run verify:phase5 (94 checks)"],
                ["End-to-end evidence", "scripts/e2e-p5-*.png (10 screenshots of the 26-step run)"],
                ["Documentation", "JOB_REQUESTS.md; ARCHITECTURE.md; DATABASE.md section 8.2; README.md"],
                ["This report", "download/Dwellers_Phase5_Request_Service_Job_Requests_Report.pdf"],
            ],
        }),

        ("p", "Per the gate discipline observed on every phase: Phase 6 has not been started. "
              "The project waits for the project owner's explicit approval and instruction."),
    ],
}
