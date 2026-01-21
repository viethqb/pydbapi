# PHASE 2: Backend API Development – Implementation Plan

> Based on `docs/MIGRATION_PLAN_SQLREST.md`.  
> **Prerequisites:** Phase 1 complete (models, migrations, config).  
> **Note:** The `test`/`preTest` (DataSource) and `debug` (ApiAssignment) APIs require connection/execution; Phase 2 may use a minimal implementation (connect test, debug returns 501) and add full support in Phase 3.

---

## 1. Overview

| Task | Route File | Description |
|------|------------|-------------|
| **2.1** | `api/routes/datasources.py` | DataSource: CRUD, list (POST), types, drivers, test, preTest |
| **2.2** | `api/routes/api_assignments.py` | ApiAssignment + ApiContext: CRUD, list, get, publish, debug |
| **2.3** | `api/routes/modules.py`, `api/routes/groups.py` | ApiModule, ApiGroup: CRUD + list (POST) |
| **2.4** | `api/routes/clients.py` | AppClient: CRUD, list, regenerate secret |
| **2.5** | `api/routes/firewall.py`, `alarm.py`, `topology.py` | FirewallRules, UnifyAlarm, Topology (see §2.5) |
| **2.7** | `api/routes/overview.py` | Dashboard: counts, recent access, etc. |

**Shared structure:**

- Prefix: `/api/v1` (existing `API_V1_STR`).
- Auth: `CurrentUser` (logged-in) for all Phase 2 routes; `get_current_active_superuser` may be used for sensitive operations (to be decided later).
- Schemas: `app/schemas_dbapi.py` (or `app/schemas/dbapi/`) for Pydantic request/response.
- Router registration: `app/api/main.py` → `include_router` for each module.

---

## 2. Implementation Order and Dependencies

```
2.1 DataSources  ──┐
                   ├──► 2.2 ApiAssignments (depends on DataSource, Module)
2.3 Modules      ──┤
    Groups       ──┘
2.4 Clients
2.5 Firewall, Alarm, Topology
2.7 Overview (reads from multiple tables, implement last)
```

**Suggested order:**  
2.1 → 2.3 → 2.2 → 2.4 → 2.5 → 2.7.

---

## 3. Task 2.1: DataSource Management

**File:** `backend/app/api/routes/datasources.py`  
**Route prefix:** `/datasources` (e.g. `/api/v1/datasources/...`)

### 3.1 Endpoints (per Migration Plan)

| Endpoint | Method | Description | Request / Response |
|----------|--------|-------------|--------------------|
| `/datasources/types` | GET | List supported DB types (postgres, mysql) | `["postgres","mysql"]` |
| `/datasources/{type}/drivers` | GET | Driver versions for type | `{"drivers":["default","…"]}` (Phase 2: `["default"]`) |
| `/datasources/list` | POST | List with pagination and filters | Body: `DataSourceListIn` → `DataSourceListOut` |
| `/datasources/create` | POST | Create datasource | Body: `DataSourceCreate` → `DataSourcePublic` |
| `/datasources/update` | POST | Update | Body: `DataSourceUpdate` (includes `id`) → `DataSourcePublic` |
| `/datasources/delete/{id}` | DELETE | Delete | Path: `id` (UUID) → `Message` |
| `/datasources/test/{id}` | GET | Test connection for saved DS | Path: `id` → `{"ok":bool,"message":str}` |
| `/datasources/preTest` | POST | Test before save | Body: `DataSourcePreTestIn` → `{"ok":bool,"message":str}` |

### 3.2 Schemas (Pydantic)

- `DataSourceCreate`: name, product_type, host, port, database, username, password, driver_version?, description?, is_active?
- `DataSourceUpdate`: id + fields to update (optional).
- `DataSourcePublic`: all `DataSource` fields (omit or mask `password`).
- `DataSourceListIn`: `page`, `page_size`, `product_type?`, `is_active?`, `name__ilike?`.
- `DataSourceListOut`: `data: list[DataSourcePublic]`, `total: int`.
- `DataSourcePreTestIn`: same connection fields as create (name etc. not required).

### 3.3 Special Logic

- **`/test/{id}` and `/preTest`:**  
  - Phase 2: real connection via `psycopg2` (postgres) or `pymysql` (mysql), `connect` + `close`; do not use Phase 3 pool.  
  - Add `psycopg2-binary`, `pymysql` to `pyproject.toml` if not already present.  
- **`/update`:** use `id` in body to find record, update provided fields.  
- **`/drivers`:** return `["default"]` per type; Phase 3 can extend.

### 3.4 Dependencies

- `SessionDep`, `CurrentUser`.
- `app.models_dbapi.DataSource`, `ProductTypeEnum`.

---

## 4. Task 2.2: API Assignment Management

**File:** `backend/app/api/routes/api_assignments.py`  
**Prefix:** `/api-assignments`

### 4.1 Endpoints

| Endpoint | Method | Description | Request / Response |
|----------|--------|-------------|--------------------|
| `/api-assignments/list` | POST | List with filters and pagination | `ApiAssignmentListIn` → `ApiAssignmentListOut` |
| `/api-assignments/create` | POST | Create API (+ ApiContext if content provided) | `ApiAssignmentCreate` → `ApiAssignmentPublic` |
| `/api-assignments/update` | POST | Update (+ ApiContext) | `ApiAssignmentUpdate` → `ApiAssignmentPublic` |
| `/api-assignments/delete/{id}` | DELETE | Delete (cascade ApiContext, links, etc.) | `id` → `Message` |
| `/api-assignments/{id}` | GET | API detail (+ context, groups?) | `id` → `ApiAssignmentDetail` |
| `/api-assignments/publish` | POST | Publish | Body: `{ "id": "..." }` → set `is_published=True` → `ApiAssignmentPublic` |
| `/api-assignments/debug` | POST | Run API (SQL/script) for testing | `ApiAssignmentDebugIn` → Phase 2: `501` or `{"error":"Not implemented"}` |

### 4.2 Schemas

- `ApiAssignmentCreate`: module_id, name, path, http_method, execute_engine, datasource_id?, description?, sort_order?, `content?` (→ ApiContext).  
- `ApiAssignmentUpdate`: id + optional fields + `content?`.  
- `ApiAssignmentPublic`: core fields (may omit `api_context.content` in list).  
- `ApiAssignmentDetail`: `ApiAssignmentPublic` + `api_context: ApiContextPublic | None` + `group_ids: list[UUID]` (from `group_links`).  
- `ApiAssignmentListIn`: page, page_size, module_id?, is_published?, name__ilike?, http_method?, execute_engine?.  
- `ApiAssignmentListOut`: `data`, `total`.  
- `ApiAssignmentDebugIn`: `id?` or `content` + `execute_engine` + `datasource_id?`, `params?` (dict).  

### 4.3 Logic

- **Create:** create `ApiAssignment`; if `content` is provided, create `ApiContext` (1–1) with `api_assignment_id`.  
- **Update:** update `ApiAssignment`; if `content` is sent, update or create `ApiContext`.  
- **Publish:** `session.get(ApiAssignment, id)` → `is_published = True` → commit.  
- **Debug:** Phase 2: `raise HTTPException(501, "Debug requires Phase 3 SQL/Script engine")` or response `{"error":"Not implemented"}`.

### 4.4 ApiGroup Linking

- Can be added in Task 2.2 or 2.3:  
  - `POST /api-assignments/{id}/groups` body `{ "group_ids": ["uuid",...] }` → replace `ApiAssignmentGroupLink`.  
  - Or: include `group_ids` in `ApiAssignmentCreate`/`Update` and handle in create/update.

---

## 5. Task 2.3: Module & Group Management

### 5.1 `modules.py` – ApiModule

**Prefix:** `/modules`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/modules/list` | POST | List with pagination and filters (name, is_active) |
| `/modules` | GET | Simple list for dropdowns (no POST required) |
| `/modules/create` | POST | Create module |
| `/modules/update` | POST | Update (body includes `id`) |
| `/modules/delete/{id}` | DELETE | Delete (cascade api_assignments) |
| `/modules/{id}` | GET | Detail (optional) |

**Schemas:**  
`ApiModuleCreate`, `ApiModuleUpdate`, `ApiModulePublic`, `ApiModuleListIn`, `ApiModuleListOut`.

### 5.2 `groups.py` – ApiGroup

**Prefix:** `/groups`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/groups/list` | POST | List with pagination and filters |
| `/groups/create` | POST | Create |
| `/groups/update` | POST | Update |
| `/groups/delete/{id}` | DELETE | Delete |
| `/groups/{id}` | GET | Detail (optionally include list of api_assignment_ids) |

**Schemas:**  
`ApiGroupCreate`, `ApiGroupUpdate`, `ApiGroupPublic`, `ApiGroupListIn`, `ApiGroupListOut`.

---

## 6. Task 2.4: Client Application Management

**File:** `api/routes/clients.py`  
**Prefix:** `/clients`

### 6.1 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/clients/list` | POST | List with pagination and filters (name, is_active) |
| `/clients/create` | POST | Create; generate unique `client_id` and hash `client_secret` |
| `/clients/update` | POST | Update (do not change `client_id`; `client_secret` not updated here, use regenerate) |
| `/clients/delete/{id}` | DELETE | Delete |
| `/clients/{id}` | GET | Detail (optionally omit `client_secret`) |
| `/clients/{id}/regenerate-secret` | POST | Generate new `client_secret`, hash, save; return plain `secret` once (or only a message) |

### 6.2 Schemas / Logic

- `AppClientCreate`: name, description?, is_active?; backend generates `client_id` (e.g. `secrets.token_urlsafe(16)`), hashes plain `client_secret` (e.g. `get_password_hash`) and stores it.  
- `AppClientUpdate`: id + name?, description?, is_active?.  
- `AppClientPublic`: may include `client_id`, exclude `client_secret` (except in regenerate response).

---

## 7. Task 2.5: System Settings (Firewall, Alarm, Topology)

### 7.1 `firewall.py` – FirewallRules

**Prefix:** `/firewall`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/firewall/list` | POST | List with pagination (rule_type, is_active) |
| `/firewall/create` | POST | Create |
| `/firewall/update` | POST | Update |
| `/firewall/delete/{id}` | DELETE | Delete |
| `/firewall/{id}` | GET | Detail |

**Schemas:**  
`FirewallRuleCreate` (rule_type, ip_range, description?, is_active?, sort_order?), `FirewallRuleUpdate`, `FirewallRulePublic`.

### 7.2 `alarm.py` – UnifyAlarm

**Prefix:** `/alarm`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/alarm/list` | POST | List with pagination (alarm_type, is_enabled) |
| `/alarm/create` | POST | Create (name, alarm_type, config, is_enabled?) |
| `/alarm/update` | POST | Update |
| `/alarm/delete/{id}` | DELETE | Delete |
| `/alarm/{id}` | GET | Detail |

**Schemas:**  
`UnifyAlarmCreate` (name, alarm_type, config: dict, is_enabled?), `UnifyAlarmUpdate`, `UnifyAlarmPublic`.

### 7.3 `topology.py` – Topology

**Note:** There is no `topology` table in `models_dbapi`. The Migration Plan only references the `topology.py` file.

**Options:**

- **A (simple):** Read-only "topology" endpoint as an aggregate of existing tables, e.g.:  
  - `GET /topology` → `{ "datasources": count, "modules": count, "apis": count, "groups": count }` or a light "graph" structure (modules → apis, etc.).  
- **B:** Add a new model and migration for "topology config" in a later phase.  

**Recommendation for Phase 2:** Use **A** – `GET /topology` (or `/topology/summary`) returning aggregate/read-only data; extend with dedicated config later if needed.

---

## 8. Task 2.7: Overview / Dashboard

**File:** `api/routes/overview.py`  
**Prefix:** `/overview`

### 8.1 Endpoints (suggested)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/overview/stats` | GET | Counts: datasources, modules, groups, apis (published/total), clients, firewall rules, alarms. |
| `/overview/recent-access` | GET | Latest `AccessRecord` entries (e.g. limit=20). |
| `/overview/recent-commits` | GET | Latest `VersionCommit` entries (optional). |

**Response:**  
- `stats`: `{ "datasources": 0, "modules": 0, ... }`.  
- `recent-access`: `{ "data": [ AccessRecordPublic, ... ] }`.  
- Add `AccessRecordPublic` as needed (minimal sensitive fields; `request_body` inclusion is policy-dependent).

---

## 10. Shared Work (applies to all tasks)

### 10.1 Create `app/schemas_dbapi.py`

- Collect all Pydantic schemas for Phase 2 (by group as above).  
- Split later into `app/schemas/dbapi/datasources.py`, `api_assignments.py`, etc. if the file grows.

### 10.2 Register routers in `app/api/main.py`

```python
from app.api.routes import (
    ...,
    datasources,
    api_assignments,
    modules,
    groups,
    clients,
    firewall,
    alarm,
    topology,
    overview,
)

# After existing include_router calls:
api_router.include_router(datasources.router, prefix="/datasources", tags=["datasources"])
api_router.include_router(api_assignments.router, prefix="/api-assignments", tags=["api-assignments"])
api_router.include_router(modules.router, prefix="/modules", tags=["modules"])
api_router.include_router(groups.router, prefix="/groups", tags=["groups"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(firewall.router, prefix="/firewall", tags=["firewall"])
api_router.include_router(alarm.router, prefix="/alarm", tags=["alarm"])
api_router.include_router(topology.router, prefix="/topology", tags=["topology"])
api_router.include_router(overview.router, prefix="/overview", tags=["overview"])
```

(Note: each `router` may omit `prefix` if it is set in `include_router`; keep this consistent with `APIRouter(prefix=...)` in each file.)

### 10.3 Python dependencies (pyproject.toml)

- `psycopg2-binary` (or `psycopg[binary]`), `pymysql` – for DataSource test/preTest.  
- Other libs (FastAPI, SQLModel, Pydantic, JWT, etc.) as already used.

### 10.4 Auth

- Default: `CurrentUser` for all Phase 2 routes.  
- `get_current_active_superuser`: consider for delete datasource, delete client, firewall, alarm (policy-dependent).

---

## 11. Files to Create or Update

### Create

| File | Notes |
|------|-------|
| `app/schemas_dbapi.py` | All Pydantic schemas for Phase 2 (may split later) |
| `app/api/routes/datasources.py` | Task 2.1 |
| `app/api/routes/api_assignments.py` | Task 2.2 |
| `app/api/routes/modules.py` | Task 2.3 |
| `app/api/routes/groups.py` | Task 2.3 |
| `app/api/routes/clients.py` | Task 2.4 |
| `app/api/routes/firewall.py` | Task 2.5 |
| `app/api/routes/alarm.py` | Task 2.5 |
| `app/api/routes/topology.py` | Task 2.5 (aggregate read-only) |
| `app/api/routes/overview.py` | Task 2.7 |

### Update

| File | Changes |
|------|---------|
| `app/api/main.py` | `include_router` for the above modules |
| `app/api/routes/__init__.py` | Export new routers (if importing from `routes`) |
| `pyproject.toml` | Add `psycopg2-binary`, `pymysql` if missing (for test connection) |

---

## 12. Testing (suggested)

- **Unit:** each route with `TestClient`, mock `get_db`/`CurrentUser` (or use test user from `conftest`).  
- **Integration:** `docker compose` + real DB; call create/list/update/delete in sequence; test `datasources/preTest` with real Postgres/MySQL.  
- **Locations:** `tests/api/routes/test_datasources.py`, `test_api_assignments.py`, etc.

---

## 13. Implementation Checklist

- [ ] **2.1** `schemas_dbapi` (DataSource) + `datasources.py` + test connection (psycopg2, pymysql)  
- [ ] **2.3** `modules.py`, `groups.py` + schemas  
- [ ] **2.2** `api_assignments.py` + schemas (publish; debug → 501)  
- [ ] **2.4** `clients.py` + `regenerate-secret` + hashing  
- [ ] **2.5** `firewall.py`, `alarm.py`, `topology.py` (aggregate)  
- [ ] **2.7** `overview.py`  
- [ ] Register all routers in `api/main.py`  
- [ ] `pyproject.toml`: psycopg2-binary, pymysql  
- [ ] Tests (unit + integration) and update `development.md` if there are new test steps
