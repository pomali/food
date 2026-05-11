# Current State and Intended Operating Model

## Level 1: Problem Definition

- The system has working static read-only publishing and working browser-local editing, but the intended path from local edits to canonical data is implicit and fragile.
- The main affected user is the single maintainer who edits canonical data, while shared readers consume a deployed read-only static site.
- This matters because missing workflow definition creates data loss risk, unclear operational steps, and confusion about which database is authoritative.

## Level 2: Goals and Non-Goals

### Goals

- P0: Preserve a single canonical database in `data/food.db` that drives all published static pages.
- P0: Keep deployed sites read-only and hostable on static platforms such as GitHub Pages, S3, Cloudflare Pages, and R2-backed setups.
- P0: Support mobile-first local capture and editing without any always-on write backend.
- P0: Define a repeatable import workflow from local edits into the canonical database with manual conflict review.
- P1: Provide strong user warning when local edits are non-persistent or unsaved.
- P1: Enable local advanced search over recipes and products, with future expansion to FTS/vector features.
- P2: Keep static page indexing quality high so the site is useful before any SQLite initialization.

### Non-Goals

- Multi-user collaborative online editing is out of scope.
- Real-time sync or server-side write APIs are out of scope.
- Automatic conflict resolution is out of scope.
- Full production-grade synchronization service is out of scope.

## Level 3: Context

### System Boundaries

- In scope: static generation from SQLite, browser-local editing, local export/import workflow definition, and deployment constraints.
- Out of scope: hosted mutation endpoints, auth systems, and collaborative workflow features.

### Dependencies

- Build and static generation depend on a present canonical SQLite file at `data/food.db`.
- Browser persistence quality depends on cross-origin isolation and OPFS availability.
- Local editable DB initialization depends on build-time `db-seed.json` output.

### Dependents

- Recipe and product static routes depend on canonical DB correctness at build time.
- Shared readers depend on static artifacts, service worker caching, and valid route generation.
- Maintainer operational flow depends on clear manual import tooling and procedures.

### Current State

- Canonical content is stored in SQLite and used for static page generation.
- Browser local editing writes to a separate local SQLite copy and does not sync to canonical DB.
- Export exists as whole DB download, but canonical re-ingestion is currently a manual external step.
- Memory fallback exists when OPFS is unavailable, but persistence limitations are not strongly surfaced.

## Level 4: Proposed Solution

- Adopt an explicit operating model: canonical DB is edited by one maintainer, deployed artifacts are read-only static snapshots.
- Keep frontend-only capture/edit on mobile and desktop, then ingest changes later through an offline maintainer workflow.
- Define an importer that performs row-level merge from exported local data into canonical DB with manual conflict review.
- Keep memory fallback available for broad hosting compatibility, but require clear in-app warnings when data may be lost.
- Treat local SQLite as an experimentation and capture engine for advanced capabilities while preserving prerendered static pages as primary reader UX.

### Key Design Decisions

- Canonical write authority remains local maintainer workflow, not deployed runtime.
- Import unit is row-level merge, not whole DB replacement, to reduce accidental data loss.
- Conflict policy is manual review required for any overlapping edits.
- Advanced local search scope includes both recipes and products.

### Trade-offs

- Manual import review increases maintainer effort but avoids hidden destructive merges.
- Static-only deployment simplifies cost and security but removes direct publish-from-phone path.
- Memory fallback broadens host compatibility but can produce temporary edits unless user is warned.

## Level 5: Alternatives Considered

- Whole DB replacement from downloaded local file was rejected because it is simple but too risky for accidental overwrite.
- Hosted write API was rejected because edits are infrequent and not worth backend cost and attack surface.
- Disabling local editing without OPFS was rejected because fallback still provides short-session utility when warnings are explicit.

## Level 6: Cross-Cutting Concerns

### Reliability

- Unsaved or non-persistent local edits must trigger before-leave warnings and visible persistence-state indicators.
- Import workflow must be deterministic, repeatable, and produce a conflict report before canonical mutation.

### Backwards Compatibility

- Existing static route structure and canonical schema remain compatible with current deployments.
- New import process should not require changing reader-facing URLs or route contracts.

## Level 7: Functional Specification

### Use Cases

- As maintainer, I edit or create recipes on mobile in local storage while offline or away from home.
- As maintainer, I export local changes and later merge them into canonical DB on my development machine.
- As maintainer, I review conflicts manually before applying overlapping record changes.
- As reader, I browse a deployed read-only static site with no editing capabilities.

### Input and Output Behavior

- Local editor initializes from build-seeded snapshot and stores subsequent edits in browser-local database.
- Export operation outputs local data suitable for canonical import workflow.
- Import operation reads exported local data, computes row-level differences, and applies non-conflicting updates.
- Import operation emits a conflict list requiring explicit maintainer decisions before final apply.
- Published site output remains static pages generated from canonical DB state at build time.

### State Transitions

- Canonical DB state transitions only via explicit maintainer local operations.
- Local editor state transitions independently from canonical state until export/import is performed.
- Deployment state transitions only after canonical DB update and static rebuild/redeploy.

### Edge Cases and Error Conditions

- If OPFS is unavailable, editor enters memory mode and must show prominent non-persistent warning.
- If user has pending local changes, navigating away must warn before page unload.
- If import input schema is incompatible, importer must fail fast with actionable diagnostics.
- If conflicts exist, importer must block final apply until each conflict is resolved.

### Acceptance Criteria

- Canonical update path is documented as edit local, export, import with review, rebuild, redeploy.
- Deployed environments remain fully static and read-only for shared users.
- Local editor clearly indicates persistence mode and warns on potential data loss.
- Import process supports row-level merge with manual conflict resolution.
- Local advanced search requirements include recipes and products in scope.

## Level 8: Technical Specification

- Build pipeline continues to generate static routes from canonical `data/food.db` and produce `db-seed.json` snapshot.
- Local editor continues to use browser SQLite with OPFS primary and memory fallback.
- Add dirty-state tracking in local editor and bind beforeunload warning when unsaved edits exist.
- Define a local CLI import utility that compares exported local dataset against canonical DB tables by primary keys and slugs.
- Import utility outputs three sets: inserts, non-conflicting updates, and conflicts requiring interactive or file-driven decision.
- Import utility applies approved operations in a transaction and emits a summary report for rebuild readiness.
