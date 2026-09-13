# -*- coding: utf-8 -*-
"""Dwellers Phase 6 Quotations - report content (data only). ASCII-safe."""

TITLE = "Dwellers - Phase 6 Quotations Report"
SUBJECT = ("Delivery record for the Phase 6 QUOTATIONS build: the quote state machine, "
           "server-side pesewa totals, eligibility, expiry, races, accept/decline and the payment boundary")

# Block kinds: h2, h3, p, bullet, table, callouts, quote
# table: {"title": str|None, "headers": [...], "rows": [[...]], "ratios": [...], "size": pt}

CH1 = {
    "num": 1, "title": "Executive Summary",
    "blocks": [
        ("callouts", [
            ("109", "Phase 6 verification checks, all passing"),
            ("486", "Total checks across the six suites"),
            ("12 / 12", "Critical acceptance tests passing"),
            ("28 + 6", "Browser E2E steps plus decline-flow steps"),
        ]),
        ("p", "Phase 6 of the Dwellers platform completes the commercial heart of the product: a "
              "provider can now price the work a customer described in Phase 5, item by item, and "
              "the customer reviews a professional quotation document and decides. The full flow "
              "the owner's brief specified is real: JOB REQUEST, PROVIDER RESPONSE, CREATE QUOTE, "
              "ADD QUOTE ITEMS, CALCULATE TOTAL, SEND QUOTE, CUSTOMER NOTIFIED, CUSTOMER REVIEWS, "
              "ACCEPT OR DECLINE, PROVIDER NOTIFIED. The workflow then stops precisely where the "
              "brief draws the line: an accepted quotation is an acceptance, not a payment, and no "
              "payment, escrow, wallet or fee machinery was built. The work was performed against "
              "the 87-part Phase 6 requirements brief, and every part of that brief is accounted "
              "for in this report."),
        ("p", "Three design decisions define the phase. First, the quotation totals are computed "
              "on the server, always: the browser may display running amounts for convenience, "
              "but the API schema has no field a client could use to declare an amount, and the "
              "service recalculates every line total, the subtotal, the discount and the total "
              "from the item data in integer pesewas - so the browser can never force a total of "
              "GH₵1.00 when the items sum to GH₵530.00. Second, one central state machine owns "
              "the quotation: clients submit actions, never statuses, and the existing Phase 2 "
              "status vocabulary (DRAFT, SUBMITTED, VIEWED, ACCEPTED, DECLINED, EXPIRED, "
              "WITHDRAWN) was preserved exactly as the brief required. Third, every decision is "
              "atomic: quote state, the job-request state move, the timeline event, the audit "
              "record and the notification land inside one transaction, guarded by conditional "
              "updates so a double click or two simultaneous decisions have exactly one winner."),
        ("p", "The proof is behavioural. The new verify-phase6 suite adds 109 checks on top of "
              "the Phase 1 (48), Phase 2 (106), Phase 3 (73), Phase 4 (56) and Phase 5 (94) "
              "suites for a combined battery of 486 checks, all green, including the twelve "
              "critical acceptance tests of the brief: the exact Nsawam arithmetic (1 x 350 plus "
              "4 x 25 plus 1 x 80 = GH₵530.00); send, view, accept and decline with their "
              "notifications and timeline events; the refusal to edit a sent quotation; the "
              "refusal to let a customer PATCH the total; expiry enforced at acceptance time; the "
              "IDOR matrix; the double-click send; and the concurrent-decision race. The full "
              "regression battery and a clean-database rebuild from all six migrations were "
              "executed, and a browser E2E walked the complete 28-step customer-to-provider-to-"
              "customer journey plus the decline flow at 390, 768 and 1440 pixel widths with zero "
              "console errors and zero horizontal overflow. The project now sits at the Phase 7 "
              "gate, awaiting the project owner's explicit approval."),
    ],
}

CH2 = {
    "num": 2, "title": "Objective and Scope",
    "blocks": [
        ("h2", "Objective"),
        ("p", "Phase 6 exists to turn interest into agreement. After Phase 5, a customer could "
              "describe a job and a provider could say they were interested, but the commercial "
              "conversation had no artefact: no prices, no items, no validity, no decision. The "
              "objective of this phase was a complete, professional quotation workflow in which "
              "the provider prices the job without re-entering anything the request already "
              "knows, the system calculates every amount itself, the customer receives the "
              "quotation as a document they could show a real Ghanaian counterpart, and both "
              "sides see the decision in real time. The quotation must be professional enough to "
              "be printed and handed over, and honest enough that no element of it can be "
              "inflated or deflated from the client side."),
        ("h2", "Scope of this phase"),
        ("p", "In scope: quote eligibility rules, the quotation state machine, itemised line "
              "items across five kinds (labour, materials, equipment, transport, other costs), "
              "server-side calculation, fixed-amount discounts, quotation notes and terms, "
              "validity windows, expiry, send, view tracking, customer acceptance and decline "
              "with an optional reason, provider withdrawal, notifications, timeline events, the "
              "audit trail, customer and provider dashboards with filters, a per-request "
              "comparison list, print-friendly documents, responsive layouts and the full "
              "verification battery."),
        ("p", "Out of scope by explicit instruction: payment gateways, mobile money, card "
              "payments, bank transfers, escrow, wallets, checkout, payment confirmation, "
              "refunds, commissions and platform fees (PART 51); WhatsApp, SMS and email "
              "channels (PART 52); tax types such as VAT, NHIL or GETFund levy (PART 16); "
              "quotation revision and versioning systems (PART 28); and AI comparison engines "
              "(PART 50). Each of these remains a clean seam for a later phase, documented in "
              "the deferred-features chapter."),
        ("h2", "Phase ledger"),
        ("table", {
            "title": "Table 2.1 - Phase ledger after Phase 6.",
            "headers": ["Phase", "Scope", "Status"],
            "ratios": [0.14, 0.62, 0.24],
            "rows": [
                ["1", "Foundation, architecture, standards", "Complete"],
                ["2", "Database and backend foundation", "Complete"],
                ["3", "Authentication and role dashboards", "Complete"],
                ["4", "Find / nationwide discovery", "Complete"],
                ["5", "Request service / job requests", "Complete"],
                ["6", "Quotations (this report)", "Complete"],
                ["7", "Awaiting owner instruction", "Gate"],
            ],
        }),
    ],
}

CH3 = {
    "num": 3, "title": "Existing Quote Foundation",
    "blocks": [
        ("p", "The brief's first hard rule was to inspect the existing code before changing "
              "anything, and the inspection produced the single most important finding of the "
              "phase: the Phase 2 database build had already anticipated quotations completely. "
              "The Quote model existed with a unique human quoteNumber in the QT-prefixed "
              "format, the jobRequestId, providerId and a denormalised customerId for fast "
              "per-customer queries, component amount columns for labour, materials, equipment "
              "and other charges, discount, tax and total amounts, a currency column defaulting "
              "to GHS, a validUntil date, an estimated duration, terms, and the full status "
              "vocabulary the phase needed. QuoteItem existed with the exact five item kinds the "
              "brief lists, a name, description, quantityMilli for precise quantities, a "
              "unitLabel snapshot, unitPriceAmount in pesewas and a lineTotalAmount."),
        ("p", "Equally important, the money policy was already in force. The schema carried an "
              "explicit comment, enforced since Phase 5, that quotation totals are always "
              "computed on the server from line items and that totals submitted by a frontend "
              "are never trusted. The finance helpers in src/lib/finance.ts provided "
              "formatCedi for display, toPesewas for converting decimal input with round-half-up, "
              "and lineTotalAmount for the sanctioned line-total arithmetic over integer "
              "thousandths. The permission catalogue from Phase 1 already contained "
              "commerce:quotes:request, commerce:quotes:submit and commerce:quotes:respond, "
              "granted to exactly the roles that should have them."),
        ("p", "The consequence shaped the whole phase: only one genuine schema gap existed. The "
              "Quote model had terms but no dedicated notes column, and the brief explicitly "
              "requires quotation notes with a recommended maximum of five thousand characters. "
              "A single migration, 20260914_phase6_quote_notes, added the notes column as plain "
              "text. No other model, relation or index needed to change; no second quotation "
              "system, money system or notification system was created."),
        ("table", {
            "title": "Table 3.1 - What already existed and what Phase 6 added.",
            "headers": ["Foundation element", "Source", "Phase 6 action"],
            "ratios": [0.42, 0.24, 0.34],
            "rows": [
                ["Quote and QuoteItem models with QT reference", "Phase 2 schema", "Reused as-is"],
                ["Integer-pesewa money policy and finance helpers", "Phase 2 library", "Reused as-is"],
                ["commerce:quotes:* permission entries", "Phase 1 matrix", "Used, never altered"],
                ["Job-request state machine and access resolver", "Phase 5 engine", "Reused; one transition added"],
                ["Notification, audit, analytics, rate-limit pipelines", "Phases 1-5", "Extended with new vocabularies"],
                ["Quotation notes column", "-", "New migration (the one gap)"],
            ],
        }),
    ],
}

CH4 = {
    "num": 4, "title": "Quote Architecture",
    "blocks": [
        ("p", "Phase 6 added one new domain module, src/modules/quotes, split into the same "
              "shape the platform uses everywhere. quote-state.ts is the pure, I/O-free state "
              "machine: statuses, actions, the transition table, the terminal set, the timeline "
              "event vocabulary and the validity comparison. quote-service.ts is the lifecycle "
              "engine: the eligibility ladder, the money calculation, the access resolution, and "
              "the create, edit, send, view, accept, decline, withdraw and expire operations, "
              "each ending in a transaction plus audit and analytics. Two thin helpers complete "
              "the module: a server-side mapper that projects service results into the view "
              "model every page shares, and request-scoped listing helpers used by the "
              "comparison panel."),
        ("p", "The module deliberately reuses the request-side machinery rather than imitating "
              "it. Quote eligibility is defined against the same access resolver that Phase 5 "
              "uses for responding - so the notions of the targeted provider side, of business "
              "members who may act, and of opaque 404s for strangers are literally one "
              "implementation, not two that can drift. The API layer adds no logic of its own: "
              "all eight quotation endpoints delegate to the service through the Phase 1 handler "
              "factory, which applies rate limiting, authentication, the live account-status "
              "check, RBAC and Zod validation before the business code runs, and standardises "
              "the error envelope afterwards."),
        ("p", "On the frontend, four shared components carry the whole feature. The quote form "
              "handles compose and preview with dynamic items; the quote document renders the "
              "professional view both sides see, with the decision dialogs; the quotes board "
              "renders the filtered lists; and the request-quotes panel renders the comparison "
              "view on a request detail. Role dashboards mount these through thin server pages - "
              "twelve provider routes across artisan, contractor and construction-company "
              "dashboards, plus the customer's list and detail. The CREATE QUOTE entry is wired "
              "into all five provider dashboards' request pages; supplier and equipment-provider "
              "roles, which the Phase 1 matrix deliberately excludes from quoting, see no button "
              "and no promise."),
    ],
}

CH5 = {
    "num": 5, "title": "Quote State Machine",
    "blocks": [
        ("p", "The machine preserves the Phase 2 vocabulary exactly as the brief demanded: the "
              "spec's SENT state is the existing SUBMITTED, and the spec's CANCELLED is the "
              "existing WITHDRAWN. The mapping is documented in the machine itself so no future "
              "reader invents a duplicate enum. Clients submit one of six actions - edit_draft, "
              "send, view, accept, decline, withdraw - and the server determines the resulting "
              "state; no API surface accepts a status value."),
        ("table", {
            "title": "Table 5.1 - Actions, actors and permitted origin states.",
            "headers": ["Action", "Actor", "From states", "To state"],
            "ratios": [0.18, 0.16, 0.42, 0.24],
            "rows": [
                ["edit_draft", "Provider", "DRAFT", "DRAFT"],
                ["send", "Provider", "DRAFT", "SUBMITTED"],
                ["view", "Customer", "SUBMITTED", "VIEWED"],
                ["accept", "Customer", "SUBMITTED, VIEWED", "ACCEPTED"],
                ["decline", "Customer", "SUBMITTED, VIEWED", "DECLINED"],
                ["withdraw", "Provider", "DRAFT, SUBMITTED, VIEWED", "WITHDRAWN"],
                ["(expiry)", "System, lazily", "SUBMITTED, VIEWED", "EXPIRED"],
            ],
        }),
        ("p", "Four properties make the machine trustworthy. It is total: every action is "
              "checked against both the actor kind and the origin state, and anything not listed "
              "is refused with a clear message such as this quotation has already been sent. It "
              "is honest: terminal states - accepted, declined, expired, withdrawn - accept "
              "nothing further, and the provider cannot accept or decline its own quote in any "
              "state. It is idempotent where it must be: the customer's first open claims the "
              "SUBMITTED-to-VIEWED move with a conditional update, so concurrent opens cannot "
              "duplicate the event or the provider notification. And it is lazy about expiry: "
              "there is no background job; a quotation past its validity is transitioned to "
              "EXPIRED by whichever read or decision path touches it first, with a single "
              "conditional claim so concurrent readers produce one event."),
        ("p", "The machine was also extended where the brief required a decision rather than a "
              "feature. The job-request state machine gained one new transition, accept_quote, "
              "permitted only for the customer and only from the RESPONDED state, moving the "
              "request into its existing ACCEPTED status. This is the formal link between the "
              "two lifecycles: accepting a quotation commits the engagement, and the transition "
              "is invoked only by the quote service inside the acceptance transaction. Adding it "
              "changed nothing about Phase 5 behaviour - the Phase 5 suite was re-run green, "
              "with one assertion updated from six to seven job-request actions."),
    ],
}

CH6 = {
    "num": 6, "title": "Quote Creation and Provider Workflow",
    "blocks": [
        ("h2", "Eligibility ladder (PART 2)"),
        ("p", "A provider cannot quote an arbitrary request. The creation operation runs a "
              "fixed ladder, every rung enforced server-side. The caller must be authenticated "
              "and hold the commerce:quotes:submit permission. The request must exist and the "
              "caller must be its targeted provider side - resolved through the same access "
              "resolver Phase 5 uses, so business members are handled by role. The request must "
              "be in RESPONDED with responseKind INTERESTED: a request the provider declined, a "
              "request still waiting, a cancelled request or an already-committed request is "
              "refused with a clear message. The provider account must still be live in the "
              "database - the suspended guard is applied again here, beneath the HTTP layer. "
              "Finally, the provider must not already have a quotation on this request: one "
              "quote per provider per request, because a withdrawn or declined quote is history, "
              "not a reusable template, and the brief forbids silent revisions."),
        ("h2", "Nothing re-entered (PART 3)"),
        ("p", "The CREATE QUOTE button appears on the provider's request detail only when the "
              "eligibility ladder would pass, and the form receives the customer, the service, "
              "the job title and the job location from the request - the provider never types "
              "them. On the server the linkage fields are again resolved from authorised "
              "records: the API schema has no customerId, providerId or jobRequestId field, and "
              "the stored quote's ownership chain is derived from the request row. The detail "
              "response exposes that resolved chain explicitly, which is how the verification "
              "suite proves that a tampered body cannot change who a quote belongs to."),
        ("h2", "Compose, preview, send (PART 26)"),
        ("p", "The provider flow is compose, preview, send. Compose offers dynamic item rows - "
              "add, edit, remove, with a configurable cap of fifty - plus notes, terms, an "
              "estimated duration, an optional fixed discount and a required validity date. The "
              "preview step renders the itemised quotation with the exact totals the server will "
              "compute, and the provider can go back to edit or send. Saving as a draft is "
              "possible at any point before sending; a draft is invisible to the customer. "
              "Sending claims the transition conditionally: a double click produces one send, "
              "one notification and one event, and the second attempt is told the quotation has "
              "already been sent."),
    ],
}

CH7 = {
    "num": 7, "title": "Quote Item Structure and Labour",
    "blocks": [
        ("h2", "The line item (PART 8)"),
        ("p", "Every quotation line is a QuoteItem row with the five fields the brief requires: "
              "an item type, a description, a quantity, a unit and a unit price. The item types "
              "are exactly the vocabulary the Phase 2 schema already defined - LABOUR, MATERIAL, "
              "EQUIPMENT, TRANSPORT, OTHER - so no new types were invented. Quantities are "
              "stored as integer thousandths (2.5 bags becomes 2500) because the SQLite "
              "connector has no decimal type; prices are integer pesewas. Each item also carries "
              "a sort order so the document reads in the order the provider composed it, and an "
              "optional free-text unit label such as job, metres, day, trip or bag."),
        ("h2", "Labour (PART 5)"),
        ("p", "Labour items price the work itself. The brief's canonical example - labour, "
              "bathroom pipe repair, quantity 1, unit job, unit price GH₵350.00, amount "
              "GH₵350.00 - is implemented literally and asserted by the verification suite. The "
              "client may display the amount as the provider types, but the stored line total is "
              "computed by the server from the quantity in thousandths and the price in "
              "pesewas. In the browser E2E the provider entered exactly these three kinds of "
              "items and the document showed exactly the amounts the arithmetic demands."),
        ("table", {
            "title": "Table 7.1 - The acceptance-test quotation as stored (integer pesewas).",
            "headers": ["Item", "Kind", "Qty (milli)", "Unit price", "Line total"],
            "ratios": [0.34, 0.18, 0.16, 0.16, 0.16],
            "rows": [
                ["Bathroom pipe repair", "LABOUR", "1000", "35000", "35000"],
                ["PVC Pipe", "MATERIAL", "4000", "2500", "10000"],
                ["Transportation", "TRANSPORT", "1000", "8000", "8000"],
                ["", "", "", "Subtotal", "53000"],
            ],
        }),
    ],
}

CH8 = {
    "num": 8, "title": "Materials, Equipment, Transport and Other Costs",
    "blocks": [
        ("h2", "Materials (PART 6)"),
        ("p", "Material items cover consumables and parts, and the brief's worked examples are "
              "part of the verification suite: four metres of PVC pipe at GH₵25.00 yields "
              "GH₵100.00, and three PVC elbows at GH₵8.00 yield GH₵24.00. Fractional quantities "
              "are first-class because of the thousandths representation: the suite also drives "
              "two and a half bags of cement at GH₵20.00 through the API and asserts exactly "
              "GH₵50.00 comes back, which is the case the naive float arithmetic would get "
              "wrong."),
        ("h2", "Equipment (PART 7)"),
        ("p", "Equipment items price tools and machinery where the job needs them - the brief's "
              "example is a pipe cutter for one day at GH₵50.00. Equipment is supported exactly "
              "as the model supports it: the kind exists, the dashboard type selector offers it, "
              "and its amounts roll into the equipmentAmount bucket on the Quote. The draft-edit "
              "verification adds precisely this item to a draft and asserts the recalculated "
              "totals."),
        ("h2", "Transport (PART 8) and other costs (PART 9)"),
        ("p", "Transport items price moving people and materials - one trip at GH₵80.00 in the "
              "acceptance test. Other costs cover legitimate extras such as a site inspection. "
              "The Quote model's denormalised buckets have no separate transport column, so "
              "transport and other roll up into otherChargesAmount while the line items remain "
              "the source of truth; the mapping is documented in the calculation code. The "
              "customer's document groups items under readable headings - Labour, Materials, "
              "Equipment, Transport, Other costs - so a five-line quote still reads like a "
              "business document rather than a database dump."),
    ],
}

CH9 = {
    "num": 9, "title": "Calculation Algorithm and GH₵ Money Handling",
    "blocks": [
        ("h2", "The algorithm (PART 13/14/17)"),
        ("p", "One function, computeQuoteTotals, is the single place where money is derived. It "
              "takes the raw item inputs and an optional discount and produces every stored "
              "figure. Quantity is converted to integer thousandths and the price to integer "
              "pesewas before any multiplication; the line total uses the sanctioned "
              "round-half-up helper; the four component buckets are summed by kind; the "
              "subtotal is the sum of the buckets; the discount is converted and validated; and "
              "the total is subtotal minus discount. There is no floating-point money anywhere "
              "in storage or arithmetic - the only decimals are the boundary conversions at "
              "round half up, which is the documented Phase 2 policy."),
        ("p", "The browser cannot corrupt this. The input schema has no amount, total, subtotal "
              "or status field at all, so a malicious payload carrying amount = 1 or total = 1 "
              "is stripped as an unknown key before the service runs; the suite posts such "
              "payloads and asserts the stored total equals the server calculation. The same "
              "applies to per-item fake amounts. The verification suite additionally replicates "
              "the client-side display logic and compares it with the stored values to catch "
              "display-only drift."),
        ("h2", "The money grid (PART 45)"),
        ("table", {
            "title": "Table 9.1 - Money grid results (all server-verified).",
            "headers": ["Case", "Expected", "Result"],
            "ratios": [0.5, 0.28, 0.22],
            "rows": [
                ["GH₵0.01 unit price", "1 pesewa stored", "Pass"],
                ["GH₵1.00, GH₵100.00", "100 / 10000 pesewas", "Pass"],
                ["GH₵999,999.99 (ceiling)", "99999999 pesewas", "Pass"],
                ["Multiple items, mixed kinds", "Exact bucket sums", "Pass"],
                ["Discount GH₵20 on GH₵604", "Total GH₵584.00", "Pass"],
                ["Decimal quantity 2.5 x GH₵20", "GH₵50.00 exactly", "Pass"],
                ["Negative price / negative discount", "Rejected", "Pass"],
                ["Zero quantity", "Rejected", "Pass"],
                ["NaN, Infinity over JSON", "Rejected (422/400)", "Pass"],
                ["Unreasonably large quantity", "Rejected", "Pass"],
            ],
        }),
        ("h2", "Discount policy (PART 15) and tax (PART 16)"),
        ("p", "Discounts are fixed amounts, never percentages, and a discount that reaches or "
              "exceeds the subtotal is rejected at creation, at edit and over the API. Tax is "
              "deliberately absent: the taxAmount column exists and stays zero, and no VAT, "
              "NHIL or GETFund levy was invented. If Ghanaian tax configuration is required "
              "later it must arrive as a separate, controlled feature with its own migration and "
              "documentation, exactly as the brief prescribes."),
    ],
}

CH10 = {
    "num": 10, "title": "Quote Validity",
    "blocks": [
        ("p", "Every quotation carries a required validUntil date, and nothing in the platform "
              "is valid forever. The server validates the date at creation, at draft edit and "
              "again at send: a past date is rejected, a date more than seven hundred and thirty "
              "days ahead is rejected, and a draft that sat unused until its own validity passed "
              "cannot be sent - the provider must pick a future date first. The customer-facing "
              "document prints the validity prominently in the header block, and the acceptance "
              "dialog restates it before the customer commits."),
        ("p", "Expiry is enforced where it matters. There is no background job to forget and no "
              "cron dependency to misconfigure; instead, any read of a sent or viewed quotation "
              "whose validity has elapsed lazily transitions it to EXPIRED inside a claimed "
              "transaction, writing the QUOTE_EXPIRED timeline event and the audit record. The "
              "acceptance path performs the same check before the machine transition: an expired "
              "quotation is expired first and then refused with the message the brief specifies "
              "- this quotation has expired - and the customer sees the honest Expired state on "
              "the document. The suite proves both directions: time-travelled quotes are refused "
              "on accept and flipped on plain read."),
    ],
}

CH11 = {
    "num": 11, "title": "Customer Workflow",
    "blocks": [
        ("h2", "Receiving and reviewing (PART 25/57)"),
        ("p", "The customer meets a quotation in three honest places: the QUOTE_SENT "
              "notification, the MY QUOTATIONS board and the quotations panel on the request "
              "itself. The document view is deliberately a business document: a DWELLERS header "
              "with the word Quotation, the reference in mono type, the sent date and the "
              "valid-until date, the provider, the customer, the job with its request reference, "
              "the service and location, the items grouped by kind, the subtotal, any discount, "
              "the total, the notes and terms, and the status badge - everything the brief's "
              "document-quality list requires, rendered from actual server data. A print button "
              "produces a clean print layout, and the print stylesheet removes the interactive "
              "chrome (PART 56), so the quotation can be handed over on paper today; a formal "
              "PDF generator remains future work."),
        ("h2", "Deciding (PART 29/30)"),
        ("p", "Accept and decline are never one-click accidents. Each opens an accessible "
              "confirmation dialog that restates the total, the provider, the job and the "
              "validity before the customer confirms; the decline dialog collects an optional "
              "reason of at most five hundred characters. Server-side, acceptance walks the "
              "brief's validation ladder: the customer owns the request and is the quote "
              "recipient, the quotation is in a decidable state, it has not expired, the request "
              "has not been cancelled or declined, and no incompatible quotation has already "
              "been accepted. Then one transaction updates the quote, moves the request through "
              "the accept_quote transition, writes the timeline event and creates the provider "
              "notification. Declining closes the quotation but deliberately leaves the request "
              "open in RESPONDED, so the customer can still accept a different provider's price "
              "- the comparison foundation of PART 49."),
        ("p", "The customer cannot mutate what they are deciding on. The PATCH endpoint requires "
              "the submit permission that customers do not hold, so an attempted total change "
              "is refused with 403 before validation even runs; item edits, price changes, "
              "provider changes, expiry changes and ownership changes have no client-facing "
              "surface at all. The comparison list on the request detail shows every quotation "
              "side by side - provider, reference, total, validity, status - which is exactly "
              "the simple, honest foundation PART 50 asks for; no AI ranking, no price-only "
              "ordering."),
    ],
}
