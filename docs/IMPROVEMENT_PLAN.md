# PyDBAPI Improvement Plan

> Review and improvement plan for the PyDBAPI project.  
> Last updated: 2025-02

---

## 1. Current State Overview

PyDBAPI is a **DB API** platform (Full Stack FastAPI + React): DataSource management (PostgreSQL, MySQL), API Assignment (SQL Jinja2 / Python Script), Module, Group, Client, and Gateway for dynamic API execution with auth and rate limiting.

**Completed (Phase 1–4):**

- Models, migrations, config, pool, SQL engine (Jinja2), Script engine (RestrictedPython), Gateway, Auth (JWT/Basic/X-API-Key), Rate limit (Redis/in-memory), Version Commit (api-assignments, macro-defs).

**Current state notes:**

- **Firewall**: Feature disabled — `check_firewall()` always returns `True` (no firewall CRUD on backend/frontend).
- **Alarm**: No API routes for alarm management; model exists in DB but is not used in UI/API.
- **README/SECURITY**: Still using template content (Full Stack FastAPI Template, security@tiangolo.com).

---

## 2. Improvement Items (by priority)

### 2.1 Health check & operations (High priority)

| #   | Item                             | Current state                                                               | Recommendation                                                                                                                                       |
| --- | -------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **Health check endpoint**        | `GET /api/v1/utils/health-check/` returns only `true`, no dependency checks | Return readiness: check DB (Postgres), Redis (if enabled). Optionally add `/ready` and `/live` (Kubernetes-style). Return 503 when DB/Redis is down. |
| 1.2 | **Redis healthcheck (Docker)**   | Redis has `healthcheck` but no `start_period`                               | Add `start_period: 10s` (or similar) for the `redis` service in `docker-compose.yml` to avoid marking unhealthy while Redis is starting.             |
| 1.3 | **Backend healthcheck (Docker)** | Backend healthcheck calls curl to `/api/v1/utils/health-check/`             | Once 1.1 is done, healthcheck will reflect DB/Redis status. Consider adding `start_period` if backend starts slowly.                                 |

**Implementation plan (1.1):**

1. Add `readiness_check()`: verify Postgres (engine or session), Redis (ping) if `CACHE_ENABLED`/rate limit uses Redis.
2. Endpoint `GET /api/v1/utils/health-check/`: call `readiness_check()`; on failure return 503 with body `{ "success": false, "message": "...", "data": [] }` or equivalent.
3. (Optional) Keep endpoint simple (200/503 only) for compatibility with older load balancers.
4. Update tests and docker-compose test to expect 503 when DB is down (if such tests exist).

**Implementation plan (1.2):** Edit `docker-compose.yml` service `redis`, add `start_period: 10s` to `healthcheck`.

---

### 2.2 README & branding (Medium priority)

| #   | Item            | Current state                                                                | Recommendation                                                                                                                                 |
| --- | --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **README**      | Still describes "Full Stack FastAPI Template", badges point to template repo | Rename project to PyDBAPI (or product name), short description: DB API platform, DataSource, API Assignment, Gateway. Update or remove badges. |
| 2.2 | **SECURITY.md** | Security contact: security@tiangolo.com                                      | Replace with project PyDBAPI contact.                                                                                                          |

**Plan:** Update `README.md` and `SECURITY.md` in small commits (README first, then SECURITY).

---

### 2.3 Frontend – Missing System pages (Medium priority)

| #   | Item                 | Current state                                                              | Recommendation                                                                                                                                                                                      |
| --- | -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **System: Firewall** | Backend has no firewall CRUD API; gateway `check_firewall()` always allows | To re-enable firewall: (1) Add firewall CRUD API routes (backend), (2) Add System > Firewall page (frontend). To keep disabled: document in docs (e.g. PHASE_STATUS_REPORT) as "firewall disabled". |
| 3.2 | **System: Alarm**    | UnifyAlarm model and test utils exist; no alarm API routes, no Alarm page  | If alarm is needed: (1) Add alarm CRUD API routes, (2) Add System > Alarm page. If not used yet: note "Alarm (planned)" in PHASE5_UI_PLAN / PHASE_STATUS_REPORT.                                    |

**Plan:** Decide product scope: whether firewall and alarm are in scope. If yes — add backend routes and frontend routes (firewall.tsx, alarm.tsx) per structure in `docs/PHASE5_UI_PLAN.md`.

---

### 2.4 SQL/Jinja2 editor (Medium priority)

Detailed plan in **`docs/SQL_JINJA_SUGGEST_IMPROVEMENT_PLAN.md`**.

Summary:

- Full **Jinja tag** suggestions: `{% if %}`, `{% for %}`, `{% where %}`, `{% set %}`, `{# #}`, etc.
- Full **filter** suggestions matching backend: `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `in_list`, `sql_like`, …
- Stable param suggestions (from form and optionally from parse_parameters when viewing API).
- Snippets for Jinja blocks and better triggers when typing `{{`, `{%`, `|`.

**Plan:** Implement in order per sections 4.1 → 4.3 in `SQL_JINJA_SUGGEST_IMPROVEMENT_PLAN.md`.

---

### 2.5 Rate limit & flow control (Low–medium priority)

| #   | Item                          | Current state                                                              | Recommendation                                                                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Max concurrent per client** | `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` in config but not used in gateway | To limit concurrency: in gateway after auth, use semaphore/Redis per `client_id` (or ip); check before calling runner; release when done. |
| 5.2 | **Redis fail-open**           | When Redis fails, rate limit currently "allows" (fail-open)                | Document in config/code. Per environment you may consider "fail closed" (reject request when Redis fails) via config.                     |

**Plan (5.1):** Design endpoint/key (client_id or ip) → semaphore or Redis counter; integrate into gateway flow (after auth, before resolve/run). Update config and tests.

---

### 2.6 Observability (Low priority)

| #   | Item                                | Current state                  | Recommendation                                                                                                                                                             |
| --- | ----------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | **Metrics**                         | No Prometheus/metrics          | Add endpoint `/api/v1/utils/metrics/` (or `/metrics`) returning Prometheus format: gateway request count, latency, errors by module/path (middleware + counter/histogram). |
| 6.2 | **Structured logging / Request ID** | No clear request_id end-to-end | Middleware that attaches `request_id` (UUID) to each request; log with request_id for tracing from gateway to executor.                                                    |

**Plan:** (1) Request ID middleware + log format. (2) Middleware or dependency to count requests/latency → export Prometheus (optional, enabled via config).

---

### 2.7 Script engine & security (Low priority, needs review)

| #   | Item                     | Current state                                         | Recommendation                                                                                                           |
| --- | ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 7.1 | **SCRIPT_EXTRA_MODULES** | Allows whitelist (e.g. pandas, numpy) in script       | Document clearly: whitelist only, no arbitrary import. Review default list (pandas, numpy) as they can run complex code. |
| 7.2 | **Script timeout**       | Uses SIGALRM (Unix) when `SCRIPT_EXEC_TIMEOUT` is set | Document behaviour on Windows (if supported). Consider thread-based timeout for cross-platform.                          |

**Plan:** Update docs (PARAMS_USAGE or backend README) for SCRIPT_EXTRA_MODULES and timeout; keep whitelist strict.

---

### 2.8 Version Commit & UI (exists, may extend)

Version Commit exists: `POST /api-assignments/{id}/versions/create`, VersionCommit schema. Possible additions:

- Rollback endpoint (if missing): `POST /api-assignments/{id}/versions/{version_id}/rollback` per `docs/VERSION_COMMIT_IMPLEMENTATION_PLAN.md`.
- Frontend: version history page + rollback button on API detail/edit screen.

**Plan:** Compare VERSION_COMMIT_IMPLEMENTATION_PLAN with current code; implement missing parts (rollback API + UI).

---

### 2.9 Docker & deployment (minor)

| #   | Item            | Recommendation                                                                                                          |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 9.1 | **prestart**    | Already using `condition: service_completed_successfully` for prestart — OK.                                            |
| 9.2 | **Backend env** | Avoid duplicate env between `env_file` and `environment`; current env_file + override is clear — OK.                    |
| 9.3 | **Traefik**     | HTTPS redirect and cert resolver in place — OK. Can add deployment doc (deployment.md) for DOMAIN/STACK_NAME variables. |

---

## 3. Suggested implementation order

| Phase       | Content                                                                                                                         | Estimate           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Phase A** | Real health check (DB + Redis), 503 on fail; Redis `start_period` in docker-compose                                             | ✅ Done            |
| **Phase B** | README + SECURITY branding                                                                                                      | ✅ Done            |
| **Phase C** | Update PHASE_STATUS_REPORT / PHASE5: state firewall "disabled", alarm "planned" or implement firewall/alarm if in product scope | ✅ Done (doc only) |
| **Phase D** | SQL/Jinja editor: suggestions + snippets per SQL_JINJA_SUGGEST_IMPROVEMENT_PLAN                                                 | 1–2 days           |
| **Phase E** | Max concurrent per client (5.1) + document rate limit fail-open (5.2)                                                           | ✅ Done            |
| **Phase F** | Request ID middleware + (optional) Prometheus metrics                                                                           | 1 day              |
| **Phase G** | Document script sandbox + timeout; Version rollback API + UI (if missing)                                                       | ✅ Done            |

---

## 4. Related documentation

- `docs/PHASE_STATUS_REPORT.md` — Phase 1–4 status (update firewall/alarm as needed).
- `docs/PHASE5_UI_PLAN.md` — UI structure, System (groups, clients, firewall, alarm).
- `docs/SQL_JINJA_SUGGEST_IMPROVEMENT_PLAN.md` — SQL/Jinja2 editor improvements.
- `docs/VERSION_COMMIT_IMPLEMENTATION_PLAN.md` — Version Commit & rollback.
- `docs/RESPONSE_FORMAT_AUDIT.md` — Gateway/debug response format.
- `docs/PARAMS_USAGE.md` — Parameters guide for SQL/Script.

---

_This document may be updated when scope changes or phases are completed._
