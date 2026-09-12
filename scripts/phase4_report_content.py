# -*- coding: utf-8 -*-
"""Dwellers Phase 4 Nationwide Discovery - report content (data only). ASCII-safe."""

TITLE = "Dwellers - Phase 4 Nationwide Discovery Report"
SUBJECT = ("Delivery record for the Phase 4 FIND / Nationwide Discovery build: "
           "discovery engine, ranking, Ghana location matching, SEO and verification")

# Block kinds: h2, h3, p, bullet, table, callouts, quote
# table: {"title": str|None, "headers": [...], "rows": [[...]], "ratios": [...],
#         "size": pt}

CH1 = {
    "num": 1, "title": "Executive Summary",
    "blocks": [
        ("callouts", [
            ("56", "Phase 4 verification checks, all passing"),
            ("283", "Total checks across the four suites"),
            ("21 / 21", "Browser E2E steps across three viewports"),
            ("50", "Content-backed URLs in the sitemap"),
        ]),
        ("p", "Phase 4 of the Dwellers platform turned the product from an authenticated "
              "application into a real marketplace. Building strictly on the Phase 1 security "
              "foundation, the Phase 2 domain backend and the Phase 3 authentication layer, the "
              "phase delivered the nationwide discovery experience: a customer anywhere in Ghana "
              "can type what they need, choose where they need it, and see the providers that "
              "genuinely serve that location. The work was performed against the 52-part Phase 4 "
              "requirements brief supplied by the project owner, and every part of that brief is "
              "accounted for in this report. Nothing from Phases 1 to 3 was rebuilt, replaced or "
              "duplicated - no second authentication system, no second location or category "
              "system, no parallel provider or service-area models."),
        ("p", "Three design decisions define the phase. First, discovery has exactly one "
              "backend: a single discoverProviders service, driven by one central ranking "
              "configuration, serves the homepage search panel, the /find results page, the "
              "category and location landing pages, the provider directory and the public REST "
              "API. Search logic exists in no React component. Second, matching is grounded in "
              "real database rows, never in free text: a provider appears for a search only if "
              "an ACTIVE service row links it to the requested category subtree and a "
              "ProviderServiceArea or BusinessServiceArea row covers the requested location. "
              "Third, the system is honest by construction: missing information scores neutral "
              "instead of fabricated, unverified providers are never called verified, suspended "
              "accounts disappear from public view on the very next request, and nearby results "
              "are always clearly separated from exact matches."),
        ("p", "The proof is behavioural, not cosmetic. The new verify-phase4 suite adds 56 "
              "checks on top of the Phase 1 (48), Phase 2 (106) and Phase 3 (73) suites for a "
              "combined battery of 283 checks, all green, including the five critical acceptance "
              "tests: the Nsawam plumber appears for Plumbing plus Nsawam; the Accra-only plumber "
              "does not; the suspended plumber does not; the Nsawam electrician does not appear "
              "in a plumbing search; and thirteen matching providers paginate as ten plus three, "
              "never unlimited. A clean-database rebuild was executed again this phase, and a "
              "21-step browser E2E walked the full customer journey at 390, 768 and 1440 pixel "
              "widths with zero console errors and zero horizontal overflow. The project now "
              "sits at the Phase 5 gate, Request Service / Job Requests, awaiting the project "
              "owner's explicit approval."),
    ],
}

CH2 = {
    "num": 2, "title": "Phase Scope and Phase Ledger",
    "blocks": [
        ("h2", "2.1  What the phase covers"),
        ("p", "Phase 4 spans the whole discovery surface: the homepage WHAT and WHERE search "
              "panel, the /find results page with server-side filters, sorting and pagination, "
              "the cascading Ghana location selectors, the database-driven category and service "
              "taxonomy, provider result cards, the public provider profile, the nearby-provider "
              "fallback, shareable search URLs, indexable SEO landing pages, the centralized "
              "discovery API, the analytics event foundation, and the documentation set that "
              "explains all of it. Every surface reads from the same engine, and every result "
              "shown is a real database record - the phase adds no fabricated content anywhere."),
        ("p", "Equally important is what the phase deliberately does not build. The job request "
              "workflow, quotations, payments and checkout, full messaging, WhatsApp and SMS "
              "integration, equipment rental transactions, project management, an AI "
              "recommendation engine and a construction cost estimator all belong to later "
              "phases. Where the customer journey reaches one of those boundaries, the interface "
              "shows an honest, clearly-labelled transition - for example a Request Service "
              "button that preserves the customer's intent through authentication and then "
              "states plainly that job requests arrive with Phase 5 - rather than faking a "
              "submission."),
        ("h2", "2.2  The starting seam"),
        ("p", "The phase began with an inspection of the existing seams rather than a rebuild. "
              "From Phase 2 it inherited the 41-model domain - in particular ProviderProfile, "
              "ProviderServiceArea, BusinessServiceArea, Service, the Category tree and the "
              "Region, District, Town and CommunityArea hierarchy with real latitude and "
              "longitude columns. From Phase 1 it inherited the API handler factory with its "
              "auth, validation, rate-limit and logging pipeline, the pagination contract and "
              "the error envelope. From Phase 3 it inherited live account-status enforcement, "
              "the service-area pickers that keep provider data truthful, and the design system "
              "that keeps the interface visually continuous. The only schema change the phase "
              "required was one new analytics table, which is documented in chapter 9."),
        ("h2", "2.3  Phase ledger"),
        ("table", {
            "title": "Table 2.1 - Project phase ledger after Phase 4",
            "headers": ["Phase", "Scope", "Status"],
            "rows": [
                ["1", "Foundation, architecture, security primitives, brand", "COMPLETE"],
                ["2", "41-model schema, API foundation, seed, location data", "COMPLETE"],
                ["3", "Authentication, registration, role dashboards", "COMPLETE"],
                ["4", "Find / nationwide discovery (this report)", "COMPLETE"],
                ["5", "Request service / job requests / messaging / quotations", "AWAITING OWNER APPROVAL"],
            ],
            "ratios": [0.10, 0.62, 0.28],
        }),
        ("p", "The remainder of this report maps one-to-one onto the 29 sections required by "
              "the Phase 4 specification: chapters 3 to 10 cover architecture, matching, "
              "ranking, filters, profiles, API, database, SEO, performance and security; "
              "chapter 11 carries the test, browser, device and Nsawam acceptance evidence; "
              "chapters 12 and 13 close with findings, deferrals, commits and the Phase 5 "
              "recommendation."),
    ],
}

CH3 = {
    "num": 3, "title": "Discovery Architecture and Search Flow",
    "blocks": [
        ("h2", "3.1  One engine, many doors"),
        ("p", "The central rule of the phase is that discovery has one backend and many entry "
              "points. The homepage search panel, the /find results page, the /find/[category] "
              "category landings, the /find/[category]/[location] location landings, the "
              "provider directory and the GET /api/discovery/providers endpoint all funnel into "
              "the same discoverProviders(criteria) service. No page implements its own search "
              "query, no component holds matching logic, and no surface can drift from the "
              "others, because there is nothing to drift from. When the ranking weights change, "
              "every door changes with them."),
        ("h2", "3.2  The ten-step pipeline"),
        ("table", {
            "title": "Table 3.1 - discoverProviders pipeline",
            "headers": ["Step", "Stage", "Behaviour"],
            "rows": [
                ["1", "Validate criteria", "Strict Zod schema; unknown keys rejected; page and pageSize clamped"],
                ["2", "Resolve location", "Community to town, district sweep, region sweep, or explicit coordinates"],
                ["3", "Resolve service or category", "ID or slug; subtree expansion to depth 3"],
                ["4", "Hard filters", "Active account, offered service, covering service area, public eligibility"],
                ["5", "Fetch candidates", "Single capped query (600), minimal selects, no N+1"],
                ["6", "Score relevance", "Central weights only; neutral fill for missing data"],
                ["7", "Rank", "Total score descending, stable tie-break by provider id"],
                ["8", "Sort", "Requested order applied; null data never falsely ranks"],
                ["9", "Paginate", "Server-side slice; meta with total and totalPages"],
                ["10", "Return", "Standardized, privacy-safe envelope plus labelled nearby tier"],
            ],
            "ratios": [0.08, 0.24, 0.68],
        }),
        ("p", "Hard filters run before any scoring, so a suspended provider or a provider whose "
              "service areas never touch the requested town is never fetched at all, let alone "
              "ranked. Scoring only orders the providers that already passed, which keeps the "
              "ranking honest and the query cheap. The nearby fallback reuses the same hard "
              "filters with only the location condition swapped, so a nearby provider is never "
              "someone who failed the service or eligibility test."),
        ("h2", "3.3  Search flow from the browser"),
        ("p", "A customer journey begins on the homepage, where a WHAT combobox lists the real "
              "category tree from the database and a WHERE cascade loads regions, then "
              "districts, then towns from the location API - each level fetched only after the "
              "previous choice, never one giant dropdown. Submitting navigates to /find with the "
              "criteria in the URL: category slug plus location IDs. The /find page is a server "
              "component that calls the discovery service directly, renders results, and keeps "
              "every filter and sort choice in the URL, so refreshing preserves the search, the "
              "back button behaves, and any search can be shared by copying the address bar. "
              "The same criteria expressed as an API call return the identical result set, "
              "which the verification suite asserts explicitly."),
    ],
}

CH4 = {
    "num": 4, "title": "Ghana Location Architecture",
    "blocks": [
        ("h2", "4.1  The database hierarchy"),
        ("p", "Discovery is nationwide by design, not Accra-centric. The phase consumes the "
              "existing five-level Ghana hierarchy - Ghana, Region, District or Municipality, "
              "Town, Community area - exactly as seeded in Phase 2, with all sixteen regions "
              "supported and every level carrying real coordinates where they exist. Location "
              "identity is internal database IDs end to end; names are display labels only. The "
              "frontend hard-codes no region, district, town or service anywhere: the homepage "
              "cascade, the filter panels and the SEO landings all read the live tables, so a "
              "new town added to the database is immediately searchable."),
        ("table", {
            "title": "Table 4.1 - Location reference data after seed (verified this phase)",
            "headers": ["Level", "Rows", "Role in discovery"],
            "rows": [
                ["Region", "16", "Region sweep; cascade level 1"],
                ["District / Municipality", "54", "District sweep; cascade level 2"],
                ["Town", "54", "Hard location filter; cascade level 3; service-area target"],
                ["Community area", "23", "Cascade refinement (optional level 4)"],
            ],
            "ratios": [0.30, 0.12, 0.58],
        }),
        ("h2", "4.2  Cascading selection"),
        ("p", "The location selectors cascade in four steps - region, district, town, optional "
              "community - and each level loads only after its parent is chosen. Choosing "
              "Eastern enables the district list for Eastern; choosing Nsawam Municipal enables "
              "its towns; choosing Nsawam optionally offers its communities. Defaults are never "
              "pre-selected, because a silent default would silently change the customer's "
              "search. The same discipline applies on the server: when a district or region "
              "sweep runs, the response labels the level honestly, and the requested town "
              "context is retained so exact-match providers still outrank wider-area ones."),
        ("h2", "4.3  Breadcrumbs and shareable context"),
        ("p", "Every results page renders a breadcrumb built from the resolved hierarchy - for "
              "example Ghana, Eastern, Nsawam Municipal, Nsawam - with links back to the region "
              "and town searches. The breadcrumb is not decoration: it is the same resolved "
              "location object the engine used, so what the customer sees, what the URL says "
              "and what the engine filtered on are always the same thing. This is also what "
              "keeps SEO landings honest, as chapter 10 describes."),
    ],
}

CH5 = {
    "num": 5, "title": "Service Matching and Provider Eligibility",
    "blocks": [
        ("h2", "5.1  What offers the service means"),
        ("p", "A provider offers a service only if an ACTIVE, non-deleted Service row links the "
              "provider to a category inside the requested subtree. Searching Plumbing expands "
              "to the Plumbing category and all of its descendants; searching a parent such as "
              "Construction Services finds the specialists beneath it, and those ancestor hits "
              "score below exact category hits so the specialist still outranks the generalist. "
              "Service names are never matched against free text, and the seed taxonomy - 41 "
              "categories from Construction Services down to individual trades - is the only "
              "taxonomy in the system."),
        ("h2", "5.2  Hard eligibility filters"),
        ("table", {
            "title": "Table 5.1 - Conditions applied before any ranking",
            "headers": ["Filter", "Rule"],
            "rows": [
                ["Account status", "LIVE check that the owning user is ACTIVE; suspension hides a provider mid-session"],
                ["Public eligibility", "Profile not deleted; suspended or deactivated accounts never render as public results"],
                ["Service match", "At least one ACTIVE Service row in the requested category subtree"],
                ["Service area", "A ProviderServiceArea or BusinessServiceArea row covers the requested location tier"],
                ["Verification filter", "Optional VERIFIED, PENDING or UNVERIFIED constraint"],
                ["Availability filter", "Optional AVAILABLE, BUSY or UNAVAILABLE constraint on the real field"],
                ["Provider type", "Optional INDIVIDUAL (no business) or BUSINESS (business-affiliated)"],
                ["Price bound", "Optional maximum starting price in integer pesewas"],
            ],
            "ratios": [0.26, 0.74],
        }),
        ("p", "The suspension filter deserves emphasis because it is a live read, not a cached "
              "flag: the engine requires the owning user row to be ACTIVE at query time, so an "
              "account suspended between two searches disappears from the second one, and its "
              "public profile returns 404 immediately. This is the Phase 3 live-status "
              "principle applied to public discovery, and acceptance test 4 depends on it."),
        ("h2", "5.3  Candidates, not unlimited rows"),
        ("p", "Eligible candidates are fetched in a single capped query - at most 600 provider "
              "profiles, selected to the minimal field set the scorer needs, with services and "
              "service areas joined through Prisma's filtered relation loads. There is no N+1 "
              "anywhere in the hot path, and pagination happens after ranking inside the cap. "
              "The cap is a documented, central constant, not a silent truncation: with real "
              "Ghana-scale data the correct long-term answer is PostgreSQL-side ranked "
              "pagination, which is noted in the upgrade path in DISCOVERY.md. One filter that "
              "SQL on SQLite cannot express cleanly - minimum rating with a minimum review "
              "count - is applied immediately after fetch, before scoring."),
    ],
}

CH6 = {
    "num": 6, "title": "Location Matching and the Ranking Algorithm",
    "blocks": [
        ("h2", "6.1  Exact location first"),
        ("p", "Location matching has one golden rule: a provider who explicitly serves Nsawam "
              "receives the strongest possible match for a Nsawam search. Match quality descends "
              "through the hierarchy - exact community or town match scores 1.0, a district "
              "sweep 0.6, a region sweep 0.3 - and when the requested town is known, any "
              "provider whose primary location or service-area rows contain that town gets the "
              "exact-match score even under a wider sweep. A provider who serves only Accra is "
              "not reinterpreted as serving Nsawam: they either match a wider tier honestly or "
              "they are absent, and acceptance test 2 pins this behaviour."),
        ("h2", "6.2  Distance where coordinates exist"),
        ("p", "When the requested location and the provider's towns carry real coordinates, the "
              "engine computes Haversine great-circle distance to the nearest matching town and "
              "maps it onto coarse bands. Bands are deliberately coarse because they exist to "
              "rank and to explain, and because the provider's exact coordinates never leave "
              "the service layer - the result carries a band label such as 0 to 5 km, never a "
              "raw coordinate pair. Where coordinates are missing the engine falls back to the "
              "hierarchy scores rather than inventing a distance."),
        ("table", {
            "title": "Table 6.1 - Distance bands (central configuration)",
            "headers": ["Band", "Score", "Use"],
            "rows": [
                ["0 - 5 km", "1.00", "Effectively local"],
                ["5 - 15 km", "0.80", "Nearby town"],
                ["15 - 30 km", "0.55", "Same corridor"],
                ["30+ km", "0.35", "Wider area"],
            ],
            "ratios": [0.30, 0.20, 0.50],
        }),
        ("h2", "6.3  The weight matrix"),
        ("table", {
            "title": "Table 6.2 - Recommendation weights (sum asserted to 1.0 at module load)",
            "headers": ["Component", "Weight", "Data source", "Missing-data behaviour"],
            "rows": [
                ["Service match", "30%", "ACTIVE Service rows", "Neutral 0.5 when no category searched"],
                ["Location match", "25%", "Service-area rows, hierarchy, distance", "Exact tiers and bands as above"],
                ["Availability", "15%", "Real availabilityStatus field", "UNKNOWN maps to 0.5, never inferred"],
                ["Rating / reviews", "10%", "PUBLISHED review aggregate", "Neutral 0.5 below 3 reviews"],
                ["Response rate", "10%", "responseRatePercent when present", "Neutral 0.5 when null"],
                ["Experience", "5%", "yearsExperience, full at 10 years", "Neutral 0.5 when zero"],
                ["Verification", "5%", "Platform verification status", "Unverified scores 0"],
            ],
            "ratios": [0.22, 0.10, 0.34, 0.34],
        }),
        ("p", "The weights live in one configuration module and are asserted to sum to one at "
              "load time, so no component can scatter a private weight. The verification suite "
              "asserts both the sum and the exact product matrix. The score itself is internal: "
              "the API and the interface expose plain-language reasons - Serves your area, "
              "Verified provider, Highly rated, Available now, About 5 to 15 km away - and never "
              "the number, and the word best is never used. This is ranking transparency "
              "without leaking the machinery."),
        ("h2", "6.4  Neutral fill: the bug the tests caught"),
        ("p", "The verification suite exposed a real scoring flaw during the build: an earlier "
              "draft renormalised the weights over the components that happened to have data, "
              "which let an empty profile - no rating, no response rate, no availability - "
              "score a perfect hundred percent because its missing components were simply "
              "excluded from the denominator. The fix is neutral fill: a component without "
              "real data scores 0.5 and keeps its weight, so missing information pulls a "
              "provider toward the middle of the ranking instead of manufacturing a perfect "
              "one. Unrated professionals sit below genuinely highly rated ones and above "
              "poorly rated ones, and no profile can ride a thin denominator to the top. The "
              "fix was made in the engine, not the tests, and the regression is now pinned by "
              "the recommended-ranking checks."),
        ("h2", "6.5  Nearby providers as a labelled tier"),
        ("p", "When nothing matches exactly and the search has a real point to measure from, "
              "the engine widens the location condition to towns within a 50 kilometre radius "
              "while keeping every other hard filter, ranks those providers by nearest served "
              "town, and returns them in a separate nearby block that never merges into the "
              "exact results. The interface labels the block Nearby providers and states "
              "plainly that these providers serve nearby towns, not the selected location - "
              "the customer's choice is never silently replaced. The browser pass verified "
              "this live: searching Electrical in Ejisu, where nobody serves exactly, surfaced "
              "the Kumasi electrician about 29 kilometres away under the nearby heading."),
    ],
}
