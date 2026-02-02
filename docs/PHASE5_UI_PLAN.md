# PHASE 5: Frontend UI – Design Plan

> Based on `docs/MIGRATION_PLAN_SQLREST.md`.  
> **Excluded:** Topology, MCP (not in tool scope).  
> **Prerequisites:** Phase 1–4 complete; Backend API (`/api/v1/datasources`, `api-assignments`, `modules`, `groups`, `clients`, `overview`) ready.  
> **Note:** Firewall is **disabled** (no API/UI); Alarm is **planned** (model exists, no API/UI yet). System UI currently: Groups, Clients only.

---

## 1. Overview

| Task    | Description                                                                                |
| ------- | ------------------------------------------------------------------------------------------ |
| **5.1** | Layout, sidebar, routing: Dashboard, Connection, System, API Dev, API Repository, About    |
| **5.2** | DataSource: list, create, edit, test, detail                                               |
| **5.3** | API Dev: modules, API list, create/edit (Jinja2 SQL + Python script editor), params, debug |
| **5.4** | System: groups, clients _(firewall disabled; alarm planned — not in current UI)_           |
| **5.5** | API Repository: search, detail (Swagger-like)                                              |
| **5.6** | Dashboard: stats, charts, recent activity                                                  |

**Current stack (keep as-is):**

- **React 19** + **TypeScript**
- **TanStack Router** (file-based), **TanStack Query**
- **shadcn/ui** (Radix) + **Tailwind**
- **lucide-react** (icons)
- **react-hook-form** + **zod** (forms)
- **OpenAPI client** (`@hey-api/openapi-ts`) → `src/client/`

---

## 2. Suggested Directory Structure

```
frontend/src/
├── components/
│   ├── Common/           # Keep: AuthLayout, DataTable, Footer, Logo, ...
│   ├── Sidebar/          # Update: AppSidebar, Main (DBAPI menu)
│   ├── ui/               # Keep shadcn as-is
│   ├── Dashboard/        # 5.6: Stats, Charts, RecentActivity
│   ├── DataSource/       # 5.2: List, Create, Edit, Test, Detail
│   ├── ApiDev/           # 5.3: Modules, ApiList, ApiCreateEdit, Params, Debug
│   ├── System/           # 5.4: Groups, Clients (Firewall disabled; Alarm planned)
│   └── ApiRepository/    # 5.5: Search, Detail (Swagger-like)
├── routes/
│   └── _layout/
│       ├── index.tsx           # Dashboard (/)
│       ├── connection/
│       │   ├── index.tsx       # DataSource list
│       │   ├── create.tsx      # Create DataSource
│       │   ├── $id.tsx         # Detail
│       │   └── $id.edit.tsx    # Edit DataSource
│       ├── api-dev/
│       │   ├── modules/
│       │   │   ├── index.tsx   # Module list
│       │   │   └── $id.tsx     # Module detail (+ API list)
│       │   └── apis/
│       │       ├── index.tsx   # API list (all or filter)
│       │       ├── create.tsx  # Create API
│       │       ├── $id.tsx     # API detail
│       │       └── $id.edit.tsx # Edit API (SQL/Script editor, params, debug)
│       ├── system/
│       │   ├── groups.tsx
│       │   ├── clients.tsx
│       │   # (firewall.tsx, alarm.tsx — not implemented: firewall disabled; alarm planned)
│       ├── api-repository/
│       │   ├── index.tsx       # Search
│       │   └── $id.tsx         # Detail (Swagger-like)
│       ├── about.tsx
│       └── admin.tsx           # Keep (superuser)
├── hooks/
│   └── useDbapi.ts             # (optional) TanStack Query hooks for DBAPI APIs
└── lib/
```

---

## 3. Task 5.1: Layout, Sidebar, Routes

### 3.1 Sidebar menu (AppSidebar)

**Main groups (always visible when logged in):**

| Icon              | Label          | Path                          |
| ----------------- | -------------- | ----------------------------- |
| `LayoutDashboard` | Dashboard      | `/`                           |
| `Database`        | Connection     | `/connection`                 |
| `Code2`           | API Dev        | `/api-dev/modules`            |
| `BookOpen`        | API Repository | `/api-repository`             |
| `Settings`        | System         | `/system/groups` (or submenu) |

**System submenu (or tabs on `/system`):**

- Groups → `/system/groups`
- Clients → `/system/clients`
- _(Firewall and Alarm not in current scope: firewall disabled; alarm planned — see `docs/PHASE_STATUS_REPORT.md`)_

**Footer:**

- About → `/about`
- Admin → `/admin` (only `is_superuser`)

**Suggestion:** Use `SidebarMenuSub` for System; can use `SidebarGroup` to separate **Connection / API Dev / System / API Repository**.

### 3.2 Overall Routes

| Route                    | Layout    | Description                      |
| ------------------------ | --------- | -------------------------------- |
| `/`                      | `_layout` | Dashboard                        |
| `/connection`            | `_layout` | DataSource list                  |
| `/connection/create`     | `_layout` | Create DataSource                |
| `/connection/$id`        | `_layout` | DataSource detail                |
| `/connection/$id/edit`   | `_layout` | Edit DataSource                  |
| `/api-dev/modules`       | `_layout` | Module list                      |
| `/api-dev/modules/$id`   | `_layout` | Module detail + API list         |
| `/api-dev/apis`          | `_layout` | API list (with filter)           |
| `/api-dev/apis/create`   | `_layout` | Create API                       |
| `/api-dev/apis/$id`      | `_layout` | API detail                       |
| `/api-dev/apis/$id/edit` | `_layout` | Edit API (editor, params, debug) |
| `/system/groups`         | `_layout` | ApiGroup CRUD                    |
| `/system/clients`        | `_layout` | AppClient CRUD                   |
| `/system/firewall`       | `_layout` | FirewallRules CRUD               |
| `/system/alarm`          | `_layout` | UnifyAlarm CRUD                  |
| `/api-repository`        | `_layout` | Search APIs                      |
| `/api-repository/$id`    | `_layout` | API detail (Swagger-like)        |
| `/about`                 | `_layout` | About                            |
| `/admin`                 | `_layout` | Admin (superuser)                |

`_layout` keeps `beforeLoad` login check; redirects to `/login` if not logged in.

### 3.3 Common Layout

- Keep **SidebarProvider** + **AppSidebar** + **SidebarInset**.
- Header: **SidebarTrigger** + optional breadcrumb.
- Main: `max-w-7xl`, consistent padding.
- Footer: keep existing **Footer**.

---

## 4. Task 5.2: DataSource UI

### 4.1 List (`/connection`)

- **DataTable** (use pattern similar to Items/Admin): columns `name`, `product_type`, `host`, `database`, `is_active`, `updated_at`.
- Filters: `product_type` (select), `is_active` (select), `name` (search).
- Pagination: `page`, `page_size` (from `DataSourceListIn`).
- Actions: **Create**, **Test** (icon), **Edit**, **Delete**.
- **Test**: call `GET /api/v1/datasources/test/{id}`; toast success/error.

**API:** `POST /api/v1/datasources/list` with `DataSourceListIn`.

### 4.2 Create (`/connection/create`)

- Form: `name`, `product_type` (postgres | mysql), `host`, `port`, `database`, `username`, `password`, `description?`, `is_active?`.
- **Test connection** (PreTest): `POST /api/v1/datasources/preTest` with payload same as create (no `id` needed); show `ok` / `message` in toast.
- Submit: `POST /api/v1/datasources/create` → redirect `/connection` or `/connection/{id}`.

### 4.3 Detail (`/connection/$id`)

- Display DataSource info (mask `password`).
- Actions: **Edit**, **Test**, **Delete**.
- Can add "APIs using this DataSource" (link to `/api-dev/apis?datasource_id=...`) if backend supports filter.

### 4.4 Edit (`/connection/$id/edit`)

- Form similar to Create; load data from `GET` (or from list/detail).
- **Test** uses PreTest with current form values.
- Submit: `POST /api/v1/datasources/update` with `id` in body.

---

## 5. Task 5.3: API Dev UI

### 5.1 Modules

**List (`/api-dev/modules`):**

- DataTable: `name`, `path_prefix`, `sort_order`, `is_active`, `updated_at`.
- Actions: Create, Edit, Delete.
- Click row or "View" → `/api-dev/modules/$id`.

**API:** `GET /api/v1/modules` (list) or `POST /api/v1/modules/list` if backend uses POST list.

**Create/Edit module:**

- Form: `name`, `path_prefix`, `description?`, `sort_order?`, `is_active?`.
- **API:** `POST /api/v1/modules/create`, `POST /api/v1/modules/update`.

**Module detail (`/api-dev/modules/$id`):**

- Module info.
- **API list** in module: DataTable `name`, `path`, `http_method`, `execute_engine`, `is_published`, `datasource_id` (or name).
- Actions: Create API → `/api-dev/apis/create?module_id=...`, Edit, Delete, Publish.

### 5.2 API list (`/api-dev/apis`)

- DataTable: `name`, `module`, `path`, `http_method`, `execute_engine`, `datasource`, `is_published`, `updated_at`.
- Filters: `module_id`, `is_published`, `http_method`, `execute_engine`, `name` search.
- Pagination.
- **API:** `POST /api/v1/api-assignments/list` with `ApiAssignmentListIn`.

### 5.3 Create / Edit API (`/api-dev/apis/create`, `/api-dev/apis/$id/edit`)

**Common form fields:**

- `module_id` (select), `name`, `path` (e.g. `users`, `users/{id}`), `http_method`, `execute_engine` (SQL | SCRIPT), `datasource_id` (select), `description?`, `sort_order?`.
- **Groups:** multi-select `group_ids` (from `GET /api/v1/groups` or list).

**Content editor (ApiContext):**

- **SQL:** textarea or **code editor** (Monaco / CodeMirror) with **Jinja2 + SQL** syntax highlight.
- **SCRIPT:** code editor with **Python** syntax highlight.
- Show only one type based on `execute_engine`.

**Params (optional):**

- Display `parse_parameters(template)` from backend if endpoint supports; or manual "params" form to send **Debug**.

**Debug:**

- "Debug" panel: input `params` (JSON or key-value), call `POST /api/v1/api-assignments/debug` with `ApiAssignmentDebugIn` (e.g. `id` + `params`).
- Display response (JSON) or error.

**API:**

- Create: `POST /api/v1/api-assignments/create` (include `content` → ApiContext).
- Update: `POST /api/v1/api-assignments/update`.
- Detail: `GET /api/v1/api-assignments/{id}` → `ApiAssignmentDetail` (has `api_context`, `group_ids`).

### 5.4 Publish

- **Publish** button on list or detail: `POST /api/v1/api-assignments/publish` with `{ "id": "..." }`.

---

## 6. Task 5.4: System UI (Groups, Clients, Firewall, Alarm)

### 6.1 Groups (`/system/groups`)

- DataTable: `name`, `description`, `is_active`, `updated_at`.
- CRUD: Create, Edit, Delete, List.
- **API:** `POST /api/v1/groups/list`, `create`, `update`, `DELETE /api/v1/groups/delete/{id}`, `GET /api/v1/groups/{id}`.

### 6.2 Clients (`/system/clients`)

- DataTable: `name`, `client_id`, `description`, `is_active`, `updated_at`.
- **Regenerate secret:** action calls `POST /api/v1/clients/{id}/regenerate-secret`; display new `client_secret` (copy, show only once).
- **API:** `POST /api/v1/clients/list`, `create`, `update`, `delete`, `regenerate-secret`, `GET /api/v1/clients/{id}`.

### 6.3 Firewall (`/system/firewall`)

- DataTable: `rule_type` (allow/deny), `ip_range`, `description`, `sort_order`, `is_active`, `updated_at`.
- CRUD similar.
- **API:** `POST /api/v1/firewall/list`, `create`, `update`, `DELETE /api/v1/firewall/delete/{id}`, `GET /api/v1/firewall/{id}`.

### 6.4 Alarm (`/system/alarm`)

- DataTable: `name`, `alarm_type`, `config` (JSON preview), `is_enabled`, `updated_at`.
- CRUD; form may have JSON editor for `config`.
- **API:** `POST /api/v1/alarm/list`, `create`, `update`, `DELETE /api/v1/alarm/delete/{id}`, `GET /api/v1/alarm/{id}`.

---

## 7. Task 5.5: API Repository

### 7.1 Search (`/api-repository`)

- Search box: by `name`, `path`, `module`.
- Filters: `module_id`, `http_method`, `is_published`.
- Results: API list (card or table) with `name`, `path`, `method`, `module`; click → detail.

**API:** use `POST /api/v1/api-assignments/list` (only `is_published=true` if desired).

### 7.2 Detail (`/api-repository/$id`) – Swagger-like

- **Meta:** name, path, method, module, description.
- **Parameters:** from `parse_parameters` or manual description (can add later).
- **Try it:** form input params, call Gateway (Bearer/Basic/X-API-Key) and display response.
- **Curl / Fetch snippet** (optional).

**Note:** Gateway is `GET/POST/... /api/{module}/{path}`; requires **client_id / client_secret** or **token** (from `POST /api/token/generate`). "Try it" UI needs to select auth and input credentials.

---

## 8. Task 5.6: Dashboard

### 8.1 Stats (`/`)

- Call `GET /api/v1/overview/stats` → display:
  - Counts: DataSource, Module, API (published), Client, …
- Layout: **Card** or **Stat** components.

### 8.2 Charts (optional)

- Can add charts (e.g. **Recharts**): requests by day, by API, … if backend has corresponding endpoint.
- Phase 5 may only create **placeholder** if API not available.

### 8.3 Recent activity

- `GET /api/v1/overview/recent-access` → **recent access** table (path, ip, status, time).
- `GET /api/v1/overview/recent-commits` → **recent commits** (version, message, time).

---

## 9. Code Editor for SQL / Script

### 9.1 Options

- **Monaco Editor** (VS Code engine): SQL + Jinja2, Python; strong formatting, suggestions; larger bundle.
- **CodeMirror 6**: lighter; use `@codemirror/lang-sql`, `@codemirror/lang-python`, can add Jinja2 highlight (custom or extension).

**Suggestion:** CodeMirror 6 for smaller bundle; Monaco if IDE-like experience needed.

### 9.2 Minimum Features

- Syntax highlight (SQL, Python).
- Line numbers, scroll.
- Hook `onChange` → form state (`content`).

---

## 10. OpenAPI Client & Auth

### 10.1 DBAPI Endpoints

- Ensure **OpenAPI** backend includes `/api/v1/datasources`, `api-assignments`, `modules`, `groups`, `clients`, `firewall`, `alarm`, `overview`.
- Run **generate-client** (e.g. `bun run generate-client`) to update `src/client/`.

### 10.2 Auth

- DBAPI routes use **CurrentUser** (JWT web login). Keep current flow: login → token → send with request.
- **Gateway** ("Try it" in API Repository) uses **client credentials** or **token** from `/api/token/generate`; needs separate form in Try it screen.

---

## 11. Suggested Implementation Order

1. **5.1** – Update **sidebar** + **routes** (placeholder components).
2. **5.6** – **Dashboard** (stats, recent access, recent commits).
3. **5.2** – **DataSource** (list → create → edit → detail, test, preTest).
4. **5.4** – **System** (groups → clients → firewall → alarm).
5. **5.3** – **API Dev** (modules → API list → create/edit + editor, params, debug).
6. **5.5** – **API Repository** (search → detail, Try it).

---

## 12. Implementation Checklist

- [ ] **5.1** Sidebar + routes (Dashboard, Connection, API Dev, System, API Repository, About).
- [ ] **5.6** Dashboard: stats, recent access, recent commits.
- [ ] **5.2** DataSource: list, create, edit, detail, test, preTest.
- [ ] **5.4** System: groups, clients, firewall, alarm (CRUD + regenerate secret).
- [ ] **5.3** API Dev: modules CRUD, API list, create/edit, code editor (SQL/Python), params, debug, publish.
- [ ] **5.5** API Repository: search, detail (Swagger-like), Try it (Gateway + auth).
- [ ] OpenAPI client has all DBAPI operations.
- [ ] (Optional) Code editor: CodeMirror or Monaco for SQL + Script.

---

_This document is for Phase 5 frontend; excludes Topology and MCP._
