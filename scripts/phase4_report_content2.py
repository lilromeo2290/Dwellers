# -*- coding: utf-8 -*-
"""Dwellers Phase 4 Nationwide Discovery - report content part 2 (CH7-CH13). ASCII-safe."""

CH7 = {
    "num": 7, "title": "Filters, Sorting and Pagination",
    "blocks": [
        ("h2", "7.1  Server-side filters"),
        ("p", "Every filter operates on the server. The browser sends parameters; the engine "
              "applies them inside the query or immediately after the capped fetch; the browser "
              "never filters a result list it has already received. Each active filter also "
              "stays in the URL, so a filtered view is a shareable view, and the filters panel "
              "collapses into a mobile sheet at small widths without changing the contract."),
        ("table", {
            "title": "Table 7.1 - Filter surface (all server-side)",
            "headers": ["Filter", "Parameter", "Notes"],
            "rows": [
                ["Service / category", "category, serviceId", "Subtree expansion; landings use slugs"],
                ["Location", "region, district, town, community", "IDs internally; cascade in the panel"],
                ["Community refinement", "community", "Optional level-4 narrowing"],
                ["Verification", "verification", "VERIFIED / PENDING / UNVERIFIED"],
                ["Availability", "availability", "Real field, not inferred"],
                ["Minimum rating", "minRating", "Requires at least 3 reviews to trust"],
                ["Maximum starting price", "maxPrice", "Integer pesewas bound"],
                ["Provider type", "providerType", "INDIVIDUAL or BUSINESS"],
                ["Distance", "maxDistanceKm", "Only meaningful where coordinates exist"],
            ],
            "ratios": [0.28, 0.26, 0.46],
        }),
        ("h2", "7.2  Sorting without false ranking"),
        ("table", {
            "title": "Table 7.2 - Sort orders",
            "headers": ["Order", "Behaviour when data is missing"],
            "rows": [
                ["Recommended", "The weighted matching score; neutral fill keeps empty profiles mid-pack"],
                ["Nearest", "Haversine distance ascending; providers without distance fall to the end"],
                ["Highest rated", "Rated providers first (3 or more reviews), then average descending"],
                ["Most experienced", "yearsExperience descending"],
                ["Lowest starting price", "Price ascending; quote-required providers sort last"],
                ["Fastest response", "Response rate descending; null rates sort last"],
            ],
            "ratios": [0.30, 0.70],
        }),
        ("p", "The rule across every order is that missing information never fabricates a "
              "position: a provider without a price is not treated as the cheapest, and a "
              "provider without reviews is not treated as the best rated. Each sort is pinned "
              "by dedicated checks in the verification suite, including the null-last "
              "behaviour and a multi-provider experience ordering case."),
        ("h2", "7.3  Pagination"),
        ("p", "Pagination is server-side and reuses the Phase 1 pagination contract: page and "
              "pageSize are clamped on the way in, and the response carries page, pageSize, "
              "total, totalPages, hasNextPage and hasPreviousPage alongside the items. Nothing "
              "ever returns an unlimited provider list, and duplicate suppression is "
              "structural - one row per provider profile, with a defensive id-based dedupe "
              "pass after scoring - so a provider with five services and three service areas "
              "still appears exactly once. Acceptance test 5 pins this: thirteen matching "
              "providers return as page one of ten and page two of three with the full meta."),
    ],
}

CH8 = {
    "num": 8, "title": "Provider Profiles, Public Discovery and Authentication",
    "blocks": [
        ("h2", "8.1  The public profile"),
        ("p", "Each result card and each public profile shows only what actually exists in the "
              "database: display name and provider type (individual or the affiliated "
              "business), profession, headline, verification status, rating aggregate once "
              "reviews exist, years of experience, the real availability field, starting price "
              "where published, completed-job count where present, service areas, matched "
              "services, portfolio items and published reviews. Nothing is invented to make a "
              "card look fuller - an unrated provider reads No reviews yet, an unverified "
              "provider reads Unverified, and a provider with no published starting price "
              "shows no price."),
        ("p", "The profile loader assembles everything in a fixed number of queries and "
              "applies privacy gates by construction: reviews expose only the reviewer's first "
              "name, the payload carries no email addresses, no phone numbers and no raw "
              "coordinates, and suspended or deleted providers return 404 rather than a "
              "stale public page. A public profile also renders structured data for search "
              "engines, with aggregate ratings included only when real reviews exist."),
        ("h2", "8.2  Public versus authenticated"),
        ("table", {
            "title": "Table 8.1 - Discovery surfaces and their boundaries",
            "headers": ["Surface", "Access"],
            "rows": [
                ["Search, results, filters, sorting", "Public"],
                ["Public provider profile, services, service areas", "Public"],
                ["Public reviews and portfolio", "Public"],
                ["Request Service", "Authentication required; intent preserved"],
                ["Message Provider", "Authentication required; intent preserved"],
                ["Save Provider / Post a Job", "Placeholder transitions; real flow is Phase 5"],
            ],
            "ratios": [0.60, 0.40],
        }),
        ("h2", "8.3  Intent-preserving authentication"),
        ("p", "Discovery is public by design, but the actions that create obligations require "
              "an account. When an anonymous visitor presses Request Service, the interface "
              "routes to sign-in with the destination and the intent encoded in the callback "
              "URL; after authentication the customer lands back on the provider profile with "
              "the intent intact, and the browser E2E verified this round trip with a real "
              "sign-in. Because the Phase 5 job-request system does not exist yet, the "
              "authenticated button does not pretend to submit: it records the analytics "
              "event, shows an honest notice that job requests arrive with Phase 5, and the "
              "architecture is wired so that Provider Profile, Request Service, Job Request "
              "and Provider Response connect the moment Phase 5 lands. Message Provider "
              "behaves the same way on the existing communication foundation."),
    ],
}

CH9 = {
    "num": 9, "title": "API Endpoints and Database Changes",
    "blocks": [
        ("h2", "9.1  GET /api/discovery/providers"),
        ("p", "The centralized discovery endpoint is public, rate-limited with the shared "
              "search preset, and validated by the same strict schema the service uses - "
              "every parameter is enumerated, coerced and bounded, and any unknown key or "
              "malformed value is rejected with a 422 validation error rather than silently "
              "ignored. Each successful search also writes one analytics event with resolved "
              "identifiers and coarse outcome counts, and that write is fire-and-forget: an "
              "analytics failure can never fail a search."),
        ("table", {
            "title": "Table 9.1 - Query parameters (all Zod-validated)",
            "headers": ["Group", "Parameters"],
            "rows": [
                ["What", "categoryId, categorySlug, serviceId, q"],
                ["Where", "regionId, districtId, townId, communityId, latitude, longitude"],
                ["Refinement", "providerType, verification, availability, minRating, maxPrice, maxDistanceKm"],
                ["Ordering", "sort (recommended, nearest, rating, experience, price, response)"],
                ["Paging", "page (1-based), pageSize (1-100, default 20)"],
            ],
            "ratios": [0.20, 0.80],
        }),
        ("p", "The response envelope mirrors the service contract: criteria echo with human "
              "labels, the resolved location context with breadcrumb and nearby suggestions, "
              "the ranked items, the pagination meta, and the nearby tier present only when "
              "nothing matched exactly. A second endpoint, POST /api/discovery/events, accepts "
              "the client-side interaction events under the same strict validation."),
        ("h2", "9.2  Analytics events"),
        ("p", "The event foundation records the seven behaviours the specification names - "
              "provider_search, service_search, location_search, provider_profile_view, "
              "filter_used, provider_contact_clicked and request_service_clicked - into a "
              "single DiscoveryEvent table whose columns are event type, optional category, "
              "service, region, district, town, community and provider identifiers, result "
              "count, sort and page. There are no personal-identifier columns, no IP address, "
              "no user agent and no free-form payload, and the verification suite asserts "
              "exactly that. No dashboard was built; this is a foundation, deliberately."),
        ("h2", "9.3  Database changes"),
        ("p", "The phase added exactly one table. The DiscoveryEvent model backs the analytics "
              "foundation and nothing else; it arrives with its own migration, "
              "20260912091952_phase4_discovery_events, and introduces no duplicate of any "
              "existing provider, service-area, location or category model - the Phase 2 "
              "domain is reused as-is, bringing the total to 42 models. The clean-database "
              "test in chapter 11 replays all three migrations from scratch and seeds the "
              "reference and demo data on the fresh schema."),
    ],
}

CH10 = {
    "num": 10, "title": "SEO, Performance and Security",
    "blocks": [
        ("h2", "10.1  Search-engine visibility"),
        ("p", "Discovery is the platform's largest organic acquisition surface, so the phase "
              "ships database-driven, indexable landing routes: /find/{category} and "
              "/find/{category}/{location} - for example /find/plumbing/nsawam - each rendered "
              "from live data with a real title, description and heading structure, provider "
              "results when they exist, related services and nearby locations. The sitemap "
              "currently exposes 50 content-backed URLs, generated only where real category "
              "and location data exists, and the dynamic robots policy complements it; "
              "parameter-heavy search URLs are not sitemapped, thin pages are not generated, "
              "and nothing is indexed that would render empty."),
        ("p", "Search URLs are shareable by construction: criteria live in the query string, "
              "refreshing preserves the search, no sensitive information is ever placed in a "
              "URL, and the verification suite checks that landing pages render with content, "
              "titles and result data, that the sitemap lists genuine discovery URLs, and "
              "that discovery surfaces respond with the standard security headers and request "
              "identifiers."),
        ("h2", "10.2  Performance posture"),
        ("p", "The discovery path is one capped, minimal-select query plus a bounded scoring "
              "loop, with relation data loaded through filtered Prisma joins rather than "
              "per-row queries; there is no N+1 in the hot path and no unbounded take. "
              "Existing indexes from Phase 2 serve the filters, and no new index was added "
              "without justification - the one new table carries only the indexes it needs. "
              "Ranking is pure computation over at most 600 candidates, pagination slices "
              "after ranking, and the nearby fallback runs only when the exact search is "
              "empty, so the common path pays nothing for it. Caching was deliberately not "
              "introduced this phase; the upgrade path in DISCOVERY.md records the conditions "
              "(privacy-safe keys, correct invalidation) under which it may be."),
        ("h2", "10.3  Security and privacy"),
        ("p", "Discovery inherits the Phase 1 handler pipeline end to end: authentication "
              "declared per route (public here), Zod validation before any database call, "
              "rate limiting per preset, safe Prisma-only queries, and the standard error "
              "envelope that never leaks internals. The privacy rules are absolute: results "
              "and profiles carry no passwords, no private audit records, no email addresses, "
              "no phone numbers and no raw coordinates, and the verification suite scans live "
              "HTTP payloads to assert it. Strict validation doubles as injection defence - "
              "SQL-like junk in any parameter is a 422, not a query - and the ownership "
              "guards from Phase 3 continue to protect the provider self-edit surfaces that "
              "sit beside discovery, including the rule that no provider can set its own "
              "verification status."),
    ],
}

CH11 = {
    "num": 11, "title": "Verification Evidence",
    "blocks": [
        ("h2", "11.1  The automated battery"),
        ("table", {
            "title": "Table 11.1 - Full battery, re-executed this session on a clean environment",
            "headers": ["Suite", "Checks", "Result"],
            "rows": [
                ["bun run lint", "-", "0 problems"],
                ["tsc --noEmit", "-", "0 errors"],
                ["bun run verify (Phase 1)", "48", "48 passed, 0 failed"],
                ["bun run verify:phase2", "106", "106 passed, 0 failed"],
                ["bun run verify:phase3", "73", "73 passed, 0 failed"],
                ["bun run verify:phase4", "56", "56 passed, 0 failed"],
                ["Total", "283", "283 passed, 0 failed"],
            ],
            "ratios": [0.44, 0.16, 0.40],
        }),
        ("p", "The Phase 4 suite runs in twelve sections on an isolated database rebuilt from "
              "migrations, then repeats its contract checks against the live HTTP server: "
              "ranking configuration, the critical acceptance block, location hierarchy, "
              "server-side filters, sorting, pagination and duplicates, empty results and the "
              "nearby fallback, public profiles, ownership boundaries, analytics, and the "
              "live HTTP section covering envelope shape, private-data scans, 422 validation, "
              "rate limiting, SEO pages and the sitemap."),
        ("h2", "11.2  The five critical acceptance tests"),
        ("table", {
            "title": "Table 11.2 - Critical acceptance results (fixtures on the isolated database)",
            "headers": ["#", "Scenario", "Expected", "Result"],
            "rows": [
                ["1", "Kwame Plumbing serves Nsawam; search Plumbing + Nsawam", "Kwame appears", "PASS"],
                ["2", "Accra Plumbing serves only Accra; search Plumbing + Nsawam", "Absent from exact results", "PASS"],
                ["3", "Nsawam electrician; search Plumbing + Nsawam", "Absent", "PASS"],
                ["4", "Suspended Nsawam plumber; search Plumbing + Nsawam", "Absent as a public result", "PASS"],
                ["5", "13 matching providers; search Plumbing + Nsawam", "Paginated 10 + 3, never unlimited", "PASS"],
            ],
            "ratios": [0.06, 0.44, 0.30, 0.20],
        }),
        ("p", "Two supporting assertions travel with the block: every exact result genuinely "
              "serves Nsawam through a real service-area or primary-location row, and the "
              "reason strings rendered on cards are honest and score-free. The same suite "
              "also pins the nearby tier: the Electrical plus Akropong case surfaces the "
              "Nsawam electrician only under the clearly-labelled nearby block, and a "
              "verified-only nearby search keeps the verification hard filter."),
        ("h2", "11.3  Clean-database rebuild"),
        ("p", "The clean-database test was executed again this session: the development "
              "database was deleted, all three migrations were applied with migrate deploy "
              "(the Phase 2 domain, the Phase 3 delivery flag, and the Phase 4 discovery "
              "events table), the idempotent seed repopulated reference and demo data - "
              "54 towns, 4 provider profiles, 41 categories - and the server came up healthy "
              "against the fresh schema. The Nsawam landing page rendered Kwame Darko with "
              "his real service areas, and the Phase 3 and Phase 4 suites were re-run in "
              "full against the rebuilt environment: 73 and 56 checks, all passing."),
        ("h2", "11.4  Browser end-to-end"),
        ("p", "The browser pass walked the complete customer journey in 21 steps with zero "
              "console errors and zero page errors: homepage search panel with the database "
              "combobox and cascade; the Find navigation; selecting Plumbing, Eastern, Nsawam "
              "Municipal and Nsawam; the results page announcing one provider found serving "
              "Nsawam with the criteria in a shareable URL; the provider profile showing "
              "services, service areas (Nsawam, Adoagyiri, Suhum, Koforidua), an honest "
              "Unverified status and no fabricated reviews; the filters and sort controls "
              "persisting to the URL; Request Service redirecting anonymous visitors to "
              "sign-in with the intent preserved, the sign-in round trip returning the "
              "customer to the profile, and the authenticated press producing the honest "
              "Phase 5 notice rather than a fake submission; a verified-only filter "
              "producing the honest empty state with nearby-area suggestions and real "
              "distances; and the nearby tier demonstrated live with the Ejisu search."),
        ("table", {
            "title": "Table 11.3 - Device matrix (find results, provider profile, homepage)",
            "headers": ["Viewport", "Width", "Horizontal overflow", "Console errors"],
            "rows": [
                ["Mobile", "390 px", "None", "Zero"],
                ["Tablet", "768 px", "None", "Zero"],
                ["Desktop", "1440 px", "None", "Zero"],
            ],
            "ratios": [0.24, 0.20, 0.32, 0.24],
        }),
        ("p", "One accessibility detail was investigated during the pass: an accessibility-tree "
              "snapshot appeared to show a missing space inside the results heading. The DOM "
              "text content was inspected directly and reads Plumbing in Nsawam correctly - "
              "the artifact is a snapshot-serializer quirk, not a rendering defect, and no "
              "code change was warranted."),
    ],
}

CH12 = {
    "num": 12, "title": "Operational Findings, Known Issues and Deferrals",
    "blocks": [
        ("h2", "12.1  Operational findings from this session"),
        ("p", "The working session began in a rebuilt sandbox, which resurrected two known "
              "operational behaviours. First, the untracked .env had lost its AUTH_SECRET and "
              "the development database was empty - the same environment-rebuild signature "
              "recorded in the Phase 3 report. The secret was regenerated into .env, the "
              "idempotent seed re-ran, and the server restarted; verify:phase3 then passed "
              "73 of 73. This remains an environment artefact, not a code defect, but it is "
              "worth restating that a fresh clone needs DATABASE_URL, AUTH_SECRET and a seed "
              "before any authenticated or discovery check can pass. Second, 179 tracked "
              "files showed mode-only permission diffs (0644 to 0755) from the rebuild; the "
              "recorded modes were restored and the tree verified clean with zero content "
              "changes."),
        ("p", "Two smaller findings were handled during verification: the background dev "
              "server needed a detached start to survive between tool sessions, and the "
              "accessibility-snapshot heading quirk described in chapter 11 was disproved "
              "against the DOM. None of these findings affected the shipped code; all are "
              "recorded here because the phase standard is that every claim is backed by "
              "evidence, including the uneventful ones."),
        ("h2", "12.2  Known issues and limits"),
        ("bullet", [
            "Candidate cap: ranking is computed over at most 600 eligible providers per search, a documented central constant; beyond Ghana-scale data the ranked pagination should move into PostgreSQL.",
            "Free-text search uses SQLite contains matching; the PostgreSQL upgrade path (citext or trigram indexes) is documented in DISCOVERY.md and Phase 2 notes.",
            "The nearby tier requires a real search point (requested town or explicit coordinates) to measure distance; without coordinates the interface offers hierarchy-based nearby areas instead of distance-ranked ones.",
            "Ranking weights are product defaults; they are tuned centrally and should be revisited once real engagement data exists.",
            "Availability is the provider's declared field, not a live presence signal; the interface words it accordingly and Phase 5 job responses will provide the real signal.",
        ]),
        ("h2", "12.3  Deferred to later phases"),
        ("p", "The following are deliberately unbuilt, each behind a clean integration point: "
              "the job request workflow and its provider response loop, quotations, payments "
              "and checkout, full messaging conversations, WhatsApp and SMS delivery, "
              "save-provider favourites, equipment rental transactions, project management, "
              "an AI recommendation engine, a construction cost estimator, and any analytics "
              "dashboarding beyond the event foundation. The discovery surfaces already "
              "speak the language of the next phase - intent-preserving buttons, honest "
              "placeholder notices and analytics events on every entry point - so Phase 5 "
              "extends the journey rather than re-plumbing it."),
    ],
}

CH13 = {
    "num": 13, "title": "Git Commits and Phase 5 Recommendation",
    "blocks": [
        ("h2", "13.1  Commits and documentation"),
        ("table", {
            "title": "Table 13.1 - Phase 4 commits on main (pushed to origin)",
            "headers": ["Commit", "Content"],
            "rows": [
                ["8e26c98", "Discovery engine, central ranking configuration and discovery API"],
                ["c3f713d", "Discovery-first frontend: homepage search, /find results, SEO landings, provider profiles"],
                ["84e1213", "Phase 4 verification suite (56 checks) and the neutral-fill scoring fix"],
                ["4943add", "Browser E2E findings: hydration-safe intent links, accessibility and copy polish"],
                ["466c396", "Phase 4 work log documentation"],
            ],
            "ratios": [0.16, 0.84],
        }),
        ("p", "Documentation shipped with the code: DISCOVERY.md in fifteen sections covering "
              "the architecture, criteria, matching, eligibility, ranking, sorting, "
              "pagination, nearby fallback, public-versus-authenticated boundaries, SEO, API, "
              "performance, security and the future upgrade path; ARCHITECTURE.md, DATABASE.md "
              "and README.md updated for the 42-model schema, the discovery services and the "
              "new verification suite. At the end of the session the working tree was clean, "
              "local main matched origin/main, and .env remained untracked with only "
              ".env.example versioned."),
        ("h2", "13.2  Phase 5 recommendation"),
        ("p", "The recommended Phase 5 scope is Request Service / Job Requests: the job request "
              "model and state machine already exist from Phase 2, the discovery surfaces "
              "already hand off with preserved intent, and the analytics foundation already "
              "records every request-service click - the phase is the natural next increment. "
              "Its core journey is specified and staged: find, select provider, describe the "
              "job with location and photos, submit, and let the provider respond toward "
              "quotation. Messaging should ride the existing conversation models, and the "
              "quotation flow should reuse the money policy and Quote models already in "
              "place."),
        ("p", "Per the standing protocol, Phase 5 has not been started. Phase 4 is complete "
              "against every gate condition in the specification - nationwide discovery, the "
              "Ghana hierarchy, service and category search, service-area matching, exact and "
              "nearby tiers, ranking, filters, sorting, pagination, profiles, public "
              "discovery, authentication boundaries, security, the Nsawam acceptance tests, "
              "TypeScript, ESLint, all four verification suites, the browser E2E across "
              "mobile, tablet and desktop, documentation and a clean git tree - and the "
              "project now waits for the project owner's explicit approval before Phase 5 "
              "begins."),
    ],
}
