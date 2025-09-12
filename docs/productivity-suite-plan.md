# Productivity Suite Scale Plan

This plan evolves the current MV3 extension into a multi‑device productivity suite (todos, notes, calendar) with reminders and broad integrations. It is incremental, MV3‑compliant, and keeps the side panel as the primary surface with the overlay as a global command launcher.

## Goals & Scope
- Multi‑device: offline‑first with sync to providers and/or optional backend.
- Integrations: Google (Calendar/Tasks), Outlook/Microsoft 365; extensible adapter model.
- Reminders: local notifications via `chrome.alarms` + `chrome.notifications` with rescheduling.
- Build toolchain: ESM + TypeScript, bundling via Vite/Rollup (MV3‑safe), tests + lint.

## Architecture Overview
- Surfaces: 
  - Side Panel = main app with router and views (Tabs/Bookmarks, Todos, Notes, Calendar, Settings).
  - Command Overlay = cross‑feature search and actions launcher.
- Runtime:
  - Background Service Worker = message hub, sync engine, alarms/notifications scheduler, OAuth flows.
  - Optional Offscreen Document = long tasks (indexing, large merges) without blocking UI.
- Data:
  - IndexedDB (idb wrapper) with versioned migrations for local cache and offline edits.
  - `chrome.storage.local` for lightweight UI prefs, feature flags, and tokens.
- Messaging: namespaced, typed actions over `chrome.runtime` (short) and `chrome.runtime.connect` ports (long‑lived streams).

## Phased Plan

### Phase 0 — Baseline Hardening (1–2 days)
- Consolidate listeners in `background.js` (single source of truth for tabs/bookmarks listeners).
- Introduce TypeScript + Vite (no eval; MV3 CSP‑safe) and convert `js/*.js` to ESM.
- Remove `window.*` globals; export/import modules directly.
- Add ESLint + Prettier; Vitest unit test harness.

### Phase 1 — Core Platform (2–4 days)
- Router: lightweight hash/router for `sidepanel.html` (Views: Home, Todos, Notes, Calendar, Settings).
- Message Bus: typed action registry (e.g., `todos/add`, `calendar/eventsForRange`), request/response shapes, error envelope.
- Data Layer: idb setup, schema v1, migration framework, repositories per feature.
- Offscreen Document: scaffold + channel for indexing and long merges.

### Phase 2 — Todos (2–4 days)
- Model: Todo { id, title, notes, due, completed, createdAt, updatedAt, recurrence? }.
- Repo + Service: CRUD, list by filters, search index build.
- UI: Side panel list + detail; quick add; inline edit; keyboard shortcuts.
- Reminders: schedule via `alarms` (per due/recurrence); notify via `notifications`.

### Phase 3 — OAuth & First Integration (Google) (3–6 days)
- OAuth: `chrome.identity.launchWebAuthFlow`, token storage/refresh.
- Adapter Interface: `listDelta`, `upsert`, `delete`, `mapToLocal`, `conflictPolicy`.
- Google Calendar: read events, time‑range fetch, incremental sync; schedule reminders; open event in provider.
- Sync Engine: periodic alarms; retry/backoff; conflict resolution with version stamps.

### Phase 4 — Notes (3–5 days)
- Model: Note { id, title, content, tags, updatedAt, encrypted? }.
- Editor: minimal rich text or markdown; offline‑first.
- Search: local full‑text index (MiniSearch); run indexing in offscreen.
- (Optional) Provider: Notion/Todoist adapter for import/export.

### Phase 5 — Command Overlay Integration (2–3 days)
- Cross‑feature search: tabs, bookmarks, todos, notes, events; ranked results and actions.
- Action verbs: open, mark‑done, schedule reminder, “add note”, “create event”.

### Phase 6 — Performance & UX (ongoing)
- Virtualized lists for bookmarks, tabs, and large datasets.
- Fine‑grained DOM updates; measured reflow.
- Caching + debounced queries; optimistic UI for edits.

### Phase 7 — Permissions & Manifest (0.5–1 day)
- Add: `alarms`, `notifications`, `identity`.
- Host permissions: provider domains (googleapis.com, microsoft.com, etc.) and narrow `img-src` as needed.
- Optional permissions per provider; request on demand from Settings.

### Phase 8 — Observability, Backup, QA (1–3 days)
- Diagnostics view: logs (ring buffer in idb), last sync status, scheduled alarms.
- Export/Import: JSON export of todos/notes, provider disconnect, data reset.
- Tests: repositories, merge/conflict, adapters (mocked), reminder scheduling.

## Message Bus (Sketch)
- Request: `{ ns: 'todos', op: 'add', v: 1, payload: { title, due } }`
- Response: `{ ok: true, data } | { ok: false, code, message }`
- Long‑lived: use `port = chrome.runtime.connect({ name: 'calendar' })` for event streams.

## IndexedDB Schema v1 (Sketch)
- `todos`: by `id`, indexes: `byDue`, `byUpdatedAt`, `byCompleted`.
- `notes`: by `id`, indexes: `byUpdatedAt`, `byTag`.
- `events`: by `id`, indexes: `byStart`, `byUpdatedAt`.
- `providers`: connections { id, type, account, scopes, tokens }.
- `sync_queue`: pending mutations; `sync_cursor`: per provider/resource cursors.
- `reminders`: { id, targetRef, at, recurrence, lastFiredAt }.

## Reminders & Scheduling
- On create/update: compute next fire time; set `chrome.alarms.create(key, { when })`.
- On alarm: fetch reminder, validate (active window/timezone), `chrome.notifications.create()`; reschedule next occurrence.
- On resume (SW wake): sweep pending reminders since last run, coalesce missed ones, reschedule.

## Integrations
- Adapters: `googleCalendar`, `googleTasks`, `m365Calendar`, each implements common interface.
- Auth: per‑adapter scopes; refresh tokens; token store in `chrome.storage.local`.
- Sync: periodic (alarms), manual refresh; conflict policy: provider as source of truth or two‑way with versioning.

## Security & Privacy
- Minimal scopes; least privilege per adapter.
- Token lifecycle: refresh, revoke on disconnect; wipe secrets on sign‑out.
- Optional local encryption for sensitive notes (user passphrase, WebCrypto).

## Risks & Mitigations
- Service worker ephemerality → persist job state, offscreen for long tasks.
- Conflict resolution → version stamps + field merge; surface conflicts in UI.
- Quotas/rate limits → adapter backoff, request coalescing.
- Large lists → virtualization, incremental render.
- Notifications throttling → retries and digest fallback.

## Acceptance Criteria (Per Phase)
- Phase 0: Build runs, TS types in place; no `window.*` exports.
- Phase 1: Router + bus; idb with migrations; unit tests pass.
- Phase 2: Todos CRUD, offline, reminders firing; tests for scheduler.
- Phase 3: Google auth, events visible, delta sync, reminders scheduled.
- Phase 4: Notes editor, indexed search, offline; import/export basic.
- Phase 5: Overlay shows cross‑feature results and action verbs.
- Phase 6+: Lists remain responsive at 10k+ items.

---

Notes
- Keep current tabs/bookmarks modules as a separate feature; refactor gradually to ESM and typed bus.
- Start with Google Calendar as first adapter to validate OAuth + sync + reminders end‑to‑end.
- Add Settings view for accounts, permissions, export/import, diagnostics.

