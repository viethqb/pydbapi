# pyDBAPI Permission Feature Plan (Superset-style)

> Reference Apache Superset's permission mechanism for building a similar feature in pyDBAPI.
> Last updated: 2025-02

---

## 1. Superset Permission Overview

### 1.1 Superset Architecture

Superset uses **Flask-AppBuilder (FAB)** for RBAC with these components:

| Component          | Description              | Examples                                                        |
| ------------------ | ------------------------ | --------------------------------------------------------------- |
| **Permission**     | Action                   | `can_read`, `can_write`, `database_access`, `datasource_access` |
| **ViewMenu**       | Resource                 | `Database`, `Dataset`, `[db_name].(id:1)`                       |
| **PermissionView** | (Permission, ViewMenu)   | `(datasource_access, [db].[schema].[table])`                    |
| **Role**           | Group of PVM mappings    | Admin, Alpha, Gamma, sql_lab                                    |
| **User**           | User with multiple roles | admin@example.com                                               |

### 1.2 Permission Types in Superset

1. **Action-based (view actions)**
   - `can_read`, `can_list`, `can_add`, `can_edit`, `can_delete`, `can_show`, ...
   - Applied per View (Database, Dataset, Dashboard, Chart, ...)

2. **Resource-based (specific resource permissions)**
   - `database_access` → `[db_name].(id:123)`
   - `schema_access` → `[db].[schema]` or `[db].[catalog].[schema]`
   - `datasource_access` → `[db].[table](id:456)`
   - PVM auto-created when Database/Dataset is created (SQLAlchemy events)

3. **All-access (global permissions)**
   - `all_database_access`, `all_datasource_access`, `all_query_access`

4. **Role hierarchy**
   - **Admin**: Full access
   - **Alpha**: Can create/edit Dashboard, Chart, Import, etc. but cannot manage User/Role
   - **Gamma**: View-only; needs explicit `database_access` / `datasource_access`
   - **sql_lab**: SQL Lab only
   - **Public**: Anonymous, depends on `PUBLIC_ROLE_LIKE`

### 1.3 Access Control

- `can_access(permission_name, view_name)` → checks if user has matching PVM
- `can_access_database(database)` → all_datasource or database_access
- `can_access_datasource(datasource)` → schema/datasource/all_datasource
- `raise_for_access(...)` → raises exception if not allowed
- **Ownership**: Admin or resource owner can edit
- **Row Level Security (RLS)**: Extra SQL conditions (e.g. `region = 'VN'`) per role on table

---

## 2. pyDBAPI Current State

### 2.1 Current Model

- **User**: `id`, `email`, `is_active`, `is_superuser`, `full_name`
- **Missing**: Role, Permission, ViewMenu, User-Role link tables
- **Auth**: JWT via `get_current_user`; `get_current_active_superuser` for admin
- **Resources**: DataSource, ApiModule, ApiGroup, ApiAssignment, ApiMacroDef, AppClient

### 2.2 Current Protection

- Some routes require `CurrentUser` (logged in)
- Some routes require `get_current_active_superuser`
- No resource-scoped permissions (e.g. user A can only edit datasource X)
- No intermediate roles (Alpha/Gamma equivalent)

### 2.3 Resources to Protect

| Resource      | Description             | CRUD to protect                                 |
| ------------- | ----------------------- | ----------------------------------------------- |
| DataSource    | DB connection           | list, create, update, delete, test              |
| ApiModule     | Module for APIs         | list, create, update, delete                    |
| ApiGroup      | API group (for client)  | list, create, update, delete                    |
| ApiAssignment | API definition          | list, create, update, delete, publish, debug    |
| ApiMacroDef   | Jinja/Python macro      | list, create, update, delete, publish           |
| AppClient     | Gateway client          | list, create, update, delete, regenerate-secret |
| Overview      | Dashboard stats         | read                                            |
| User          | User management (admin) | list, create, update, delete                    |

---

## 3. pyDBAPI Permission Design

### 3.1 Data Model (simplified vs FAB)

Not using FAB since pyDBAPI is FastAPI. Proposed schema:

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Role      │     │ user_role_link  │     │     User         │
├─────────────┤     ├─────────────────┤     ├──────────────────┤
│ id          │────<│ user_id         │>────│ id               │
│ name        │     │ role_id         │     │ email            │
│ description │     └─────────────────┘     │ is_superuser     │
└─────────────┘                             └──────────────────┘
       │
       │ 1:N
       ▼
┌─────────────────────┐
│ role_permission_link│
├─────────────────────┤
│ role_id             │
│ permission_id       │
└─────────────────────┘
       │
       │ N:1
       ▼
┌─────────────────────┐
│   Permission        │
├─────────────────────┤
│ id                  │
│ resource_type       │  -- datasource, module, group, api_assignment, macro_def, client, user
│ action              │  -- read, create, update, delete
│ resource_id         │  -- NULL = all resources of type, else specific UUID
└─────────────────────┘
```

**Notes:**

- **resource_type**: `datasource`, `module`, `group`, `api_assignment`, `macro_def`, `client`, `user`
- **action**: `read`, `create`, `update`, `delete` (can add `publish`, `debug` if needed)
- **resource_id**:
  - `NULL` → permission on **all** resources of `resource_type`
  - Set → permission only on that resource (object-level like Superset)

### 3.2 Default Roles (Superset-like)

| Role         | Description      | Permissions                                                                                              |
| ------------ | ---------------- | -------------------------------------------------------------------------------------------------------- |
| **Admin**    | Full access      | All resource_types, all actions, resource_id = NULL                                                      |
| **Alpha**    | Developer/Editor | datasource, module, group, api_assignment, macro_def, client: read/create/update/delete; user: read only |
| **Gamma**    | Viewer           | datasource, module, group, api_assignment, macro_def, client: read only                                  |
| **Operator** | Run/debug APIs   | api_assignment: read, debug; overview: read                                                              |

### 3.3 Permission Check Logic

```
def has_permission(user, resource_type, action, resource_id=None) -> bool:
    if user.is_superuser:
        return True
    for role in user.roles:
        for perm in role.permissions:
            if perm.resource_type != resource_type or perm.action != action:
                continue
            if perm.resource_id is None:  # all
                return True
            if perm.resource_id == resource_id:
                return True
    return False
```

- `resource_id=None` for full resource type; `resource_id=<uuid>` restricts to that object.
- **Updated 2026-02-03:** New modules auto-create CRUD + execute permissions scoped by `module.id`; deleting a module removes its object-level permissions.

### 3.4 Ownership (optional)

- Add `created_by_id` (FK User) to DataSource, ApiModule, ApiGroup, ApiAssignment, ApiMacroDef, AppClient
- Without full permission: user can update/delete if owner
- Similar to Superset `is_owner()`

---

## 4. Row Level Security (RLS) – Later Phase

Superset uses RLS to filter query results:

- Table `row_level_security_filter`: `name`, `filter_type`, `tables`, `roles`, `clause` (SQL)
- When user queries a dataset, `clause` (e.g. `region = 'VN'`) is applied for their role

**For pyDBAPI:**

- API assignments run SQL: can inject extra WHERE conditions based on role/user
- RLS rules: (api_assignment or datasource, role, clause)
- **High complexity** → Phase 2 priority

---

## 5. Implementation Plan (Phases)

### Phase 1: Foundation – Role & Permission (2–3 days)

| Task | Description                                                                  | Files                                              |
| ---- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| 1.1  | Create models `Role`, `Permission`, `user_role_link`, `role_permission_link` | models.py, models_permission.py (or extend models) |
| 1.2  | Alembic migration                                                            | alembic/versions/007_add_permission_tables.py      |
| 1.3  | Seed default roles: Admin, Alpha, Gamma, Operator                            | initial_data.py or migration                       |
| 1.4  | Seed default permissions per resource_type + action                          | initial_data.py                                    |
| 1.5  | Assign Admin role to users with `is_superuser=True`                          | migration or initial_data                          |

### Phase 2: Permission Service & Deps (1–2 days)

| Task | Description                                                                              | Files                  |
| ---- | ---------------------------------------------------------------------------------------- | ---------------------- |
| 2.1  | Service `PermissionService`: `has_permission(user, resource_type, action, resource_id?)` | app/core/permission.py |
| 2.2  | Dependency `require_permission(resource_type, action)` for routes                        | app/api/deps.py        |
| 2.3  | Dependency `require_permission_or_owner(...)` for ownership                              | app/api/deps.py        |
| 2.4  | Update User model: relationship `roles` via `user_role_link`                             | models.py              |
| 2.5  | API `GET /users/me/permissions` returning current user's permissions                     | routes/users.py        |

### Phase 3: Apply to Routes (2–3 days)

| Task | Description                                                                                   | Files                 |
| ---- | --------------------------------------------------------------------------------------------- | --------------------- |
| 3.1  | datasources: list/read → `require_permission("datasource","read")`; create/update/delete same | routes/datasources.py |
| 3.2  | modules, groups, macro_defs, api_assignments, clients: same pattern                           | routes/\*.py          |
| 3.3  | overview: read → `require_permission("overview","read")` or fold into `api_assignment.read`   | routes/overview.py    |
| 3.4  | users: Admin only (`is_superuser` or Admin role)                                              | routes/users.py       |
| 3.5  | Keep `get_current_active_superuser` for admin-only routes (users CRUD)                        | deps.py               |

### Phase 4: Role & Permission APIs (2 days)

| Task | Description                                                        | Files                 |
| ---- | ------------------------------------------------------------------ | --------------------- |
| 4.1  | `GET /roles/list`, `GET /roles/{id}`                               | routes/roles.py       |
| 4.2  | `PUT /roles/{id}` – update role permissions (Admin only)           | routes/roles.py       |
| 4.3  | `GET /permissions/list` – list permissions (resource_type, action) | routes/permissions.py |
| 4.4  | `PUT /users/{id}/roles` – assign roles to user (Admin only)        | routes/users.py       |

### Phase 5: Frontend – Permission Management (3–4 days)

| Task | Description                                                            | Files    |
| ---- | ---------------------------------------------------------------------- | -------- |
| 5.1  | Security > Roles: list roles, edit permissions                         | frontend |
| 5.2  | Users: add roles column/select when creating/editing user              | frontend |
| 5.3  | UI visibility by permission: hide Create/Edit/Delete when unauthorized | frontend |
| 5.4  | Security menu (Roles, Permissions) visible to Admin only               | frontend |

### Phase 6 (Optional): Object-level Permission & RLS

| Task | Description                                                   |
| ---- | ------------------------------------------------------------- | ----------------------- |
| 6.1  | Support `resource_id` in Permission: grant per datasource/api | Backend + UI            |
| 6.2  | RLS: table `rls_filter` (datasource_id, role_id, clause)      | Backend                 |
| 6.3  | Executor injects clause when running SQL                      | engines/sql/executor.py |

**Module object permissions (completed 2026-02-03):**

- Helpers `ensure_resource_permissions` / `remove_resource_permissions` manage scoped module permissions.
- `require_permission_for_resource` falls back to `resource_id` after global check.
- Module CRUD endpoints call these helpers to provision and revoke permissions automatically.

---

## 6. Migration Path

1. **Backward compatible**: Existing users without role → treat as **Gamma** (read-only) or **Alpha** per config
2. Migration: create new tables, seed roles/permissions; no User schema change if using link tables
3. Optional `default_role_id` in config for new users
4. `is_superuser` still overrides all (like Superset Admin)

---

## 7. Comparison with Superset

| Aspect         | Superset                                          | pyDBAPI (proposed)                              |
| -------------- | ------------------------------------------------- | ----------------------------------------------- |
| RBAC framework | Flask-AppBuilder                                  | Custom (FastAPI + SQLModel)                     |
| Permission     | Permission + ViewMenu + PVM                       | Permission (resource_type, action, resource_id) |
| Roles          | Admin, Alpha, Gamma, sql_lab                      | Admin, Alpha, Gamma, Operator                   |
| Object-level   | database_access, schema_access, datasource_access | resource_id in Permission                       |
| RLS            | Yes (row_level_security_filter)                   | Phase 6 (optional)                              |
| Ownership      | Yes (owners on dashboard/chart)                   | Phase 2–3 (created_by_id)                       |
| Guest token    | Yes (embedded)                                    | No (gateway uses AppClient)                     |

---

## 8. References

- Superset security: `superset/security/manager.py`
- Superset RLS: `superset/row_level_security/`
- Flask-AppBuilder: https://flask-appbuilder.readthedocs.io/

---

## 9. Implementation Checklist

- [x] Phase 1: Models + Migration + Seed (done; Role/Permission use link tables instead of Relationship link_model to avoid SQLModel/SQLAlchemy annotation issues; queries via UserRoleLink, RolePermissionLink)
- [x] Phase 2: PermissionService + Deps + /users/me/permissions (done: app/core/permission.py, require_permission/require_permission_or_owner in deps.py, GET /users/me/permissions)
- [x] Phase 3: Apply require_permission to all routes (datasources, modules, groups, macro_defs, api_assignments, clients, overview; users: superuser for CRUD, read by id = self or user read or superuser)
- [x] Phase 4: API roles, permissions, user-roles (GET /roles/list, GET /roles/{id}, PUT /roles/{id}; GET /permissions/list; PUT /users/{id}/roles; Admin only)
- [x] Phase 5: Frontend Security (Roles, User roles)
- [ ] Phase 6 (optional): Object-level + RLS
- [x] Module-level scoped permissions (auto-provision + enforcement) for resource `module`

---

## 10. Smoke Test: Module-scoped Permissions

1. Create 2 modules (e.g. Module A, Module B).
2. Create new role `ModuleA Editor`, assign permission `module:update` with `resource_id = Module A`.
3. Assign this role to a non-superuser user.
4. Log in as that user:
   - Update Module A → succeeds (`200 OK`).
   - Update Module B → blocked (`403 Forbidden`).
5. Delete Module A → verify `permission` table and role editor UI no longer have `module:*` entries for Module A's `resource_id`.
