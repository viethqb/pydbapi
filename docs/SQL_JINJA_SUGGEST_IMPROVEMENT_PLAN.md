# Plan: Improve code suggestions (autocomplete) for SQL + Jinja2

## 1. Current state

### 1.1 Editor
- **Component**: `frontend/src/components/ApiDev/ApiContentEditor.tsx`
- **Engine**: Monaco Editor, `language: "sql"` when execute engine = SQL
- **Completion provider**: `registerSqlCompletions(monaco, paramNamesRef)` for SQL

### 1.2 What exists
- **SQL keyword** suggestions: SELECT, FROM, WHERE, JOIN, LIMIT, …
- **Param** suggestions as `{{ name }}` and `{{ name | sql_string }}` (only when `paramNames` is passed)
- One snippet: "Jinja2 param (snippet)" → `{{ ${1:name} }}`
- Trigger characters: `{`, `.`, ` ` (space)

### 1.3 Gaps / weaknesses
- **No Jinja tag suggestions**: `{% if %}`, `{% for %}`, `{% where %}`, `{% set %}`, `{# #}`, …
- **Incomplete filter suggestions**: only `sql_string` appears in param suggestions; missing `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `in_list`, `sql_like`, `sql_like_start`, `sql_like_end`, `json`
- **Params** are suggested only when `paramNames` comes from the form; view/detail pages pass `paramNames={[]}` → no param suggestions
- **No snippets** for Jinja blocks (if/for/where), so typing by hand is error-prone
- Suggestions **do not trigger well** when typing `{{` or `{%` (trigger has `{` but “inside Jinja” context is not handled clearly)

---

## 2. Goals

1. **Suggest all Jinja tags** used in SQL: `if/endif`, `for/endfor`, `where/endwhere`, `set`, comment `{# #}`.
2. **Suggest all filters** matching the backend: `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`, `in_list`, `sql_like`, `sql_like_start`, `sql_like_end`, `json`.
3. **Stable param suggestions**: from the form when available, and/or from template content (backend already has `parse_parameters`) so suggestions work when viewing an API.
4. **Snippets** for common Jinja blocks: `{% where %}`, `{% if %}`, `{% for %}`, `{{ param | filter }}`.
5. **Better trigger and context**: suggestions appear when typing `{`, `%`, `|`, and (optionally) when the cursor is inside `{{ }}` or `{% %}`.

---

## 3. Data sources (aligned with backend)

- **Filters**: `backend/app/engines/sql/filters.py` → `SQL_FILTERS` (filter names + docstrings if needed).
- **Extensions (tags)**: `backend/app/engines/sql/extensions.py` → `WhereExtension` → tag `{% where %} ... {% endwhere %}`.
- **Jinja built-in**: `if/endif`, `for/endfor`, `set`, `else`, `elif`; comment `{# ... #}`.

---

## 4. Implementation items

### 4.1 Jinja tags – completion + snippets (high priority)

- **Completion items** (when typing `{%` or on trigger `%`):
  - `{% if %} ... {% endif %}`
  - `{% for %} ... {% endfor %}`
  - `{% where %} ... {% endwhere %}` (custom)
  - `{% set x = value %}`
  - `{% else %}`, `{% elif %}`
  - `{# comment #}`
- **Snippets** (insert with placeholders):
  - `{% if ${1:param} %}\n  $0\n{% endif %}`
  - `{% for ${1:item} in ${2:items} %}\n  $0\n{% endfor %}`
  - `{% where %}\n  {% if ${1:param} %}${2:condition}$0\n  {% endif %}\n{% endwhere %}`
  - `{# $0 #}`

**File**: extend `registerSqlCompletions` in `ApiContentEditor.tsx`, or add a separate `registerJinjaCompletions(monaco)` and call it in `onMount`.

### 4.2 Jinja filters – completion (high priority)

- Fixed list (matching `SQL_FILTERS`):
  - `sql_string`, `sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`
  - `in_list`, `sql_like`, `sql_like_start`, `sql_like_end`, `json`
- Suggest when:
  - User types `|` after `{{ param` → suggest filters (e.g. `param | sql_int`).
  - Or when inside `{{ ... }}` and trigger `|` or space.
- Each item: `label`, `insertText` (filter name), `detail` (short description; can come from backend or a hardcoded map in the frontend).

**File**: same as `registerSqlCompletions` / `registerJinjaCompletions` in `ApiContentEditor.tsx`.

### 4.3 Params – ensure source and trigger (medium priority)

- **Source 1**: Keep `paramNames` from the form (create/edit) – already have `paramNamesForContentSuggestions`.
- **Source 2 (optional)**: On API view/detail, call API (or use already-loaded data) to get “API params” (from assignment params or backend `parse_parameters`) and pass them as `paramNames` instead of `[]`.
- **Trigger**: When typing `{{` or `{{ ` → prioritize param suggestions + snippet `{{ param }}`; when already `{{ param |` → suggest filters.

**File**:
- `ApiContentEditor.tsx`: suggestion logic (already present; ensure trigger behavior).
- `$id.tsx` (view): pass `paramNames` from API detail if backend/state provides it.

### 4.4 Improve trigger and context (medium priority)

- **Trigger characters**: Add `%`, `|`, `#` (for comment) to the SQL completion provider.
- **Context** (optional): Before building the suggestion list, read the line/word at `position`:
  - If inside `{{ ... }}` → prioritize params + filters.
  - If after `{%` → prioritize tags (if, for, where, set, else, elif, end*, {#).
- **Sort/priority**: Jinja tags and snippets first when context is Jinja; SQL keywords when typing plain SQL.

**File**: `ApiContentEditor.tsx` – inside `provideCompletionItems`.

### 4.5 Additional snippets (low priority)

- `{{ ${1:param} | sql_int }}`
- `{{ ${1:param} | in_list }}` (for IN (...))
- `{{ ${1:param} | sql_like_start }}` (for LIKE '...%')

**File**: same place as other Jinja snippets in `ApiContentEditor.tsx`.

---

## 5. Suggested implementation order

| Step | Item | Short description |
|------|------|-------------------|
| 1 | 4.1 Jinja tags | Completion + snippets for `{% if %}`, `{% for %}`, `{% where %}`, `{% set %}`, `{# #}`. |
| 2 | 4.2 Jinja filters | List of filters matching backend; suggest on typing `\|`. |
| 3 | 4.4 Trigger & context | Add triggers `%`, `\|`, `#`; prioritize Jinja when inside `{{ }}` / `{% %}`. |
| 4 | 4.3 Params | Pass `paramNames` on view/detail; keep create/edit behavior. |
| 5 | 4.5 Additional snippets | Snippets for `param | sql_int`, `in_list`, `sql_like_start` if needed. |

---

## 6. Files to change

| File | Change |
|------|--------|
| `frontend/src/components/ApiDev/ApiContentEditor.tsx` | Extend `registerSqlCompletions`: add Jinja tags, filters, snippets; add triggers `%`, `\|`, `#`; (optional) read context to prioritize Jinja. |
| `frontend/src/routes/_layout/api-dev/apis/$id.tsx` | (Optional) Get param list from API detail and pass `paramNames={...}` to `ApiContentEditor` instead of `[]`. |

No backend changes required; the frontend only needs to suggest the same filter/tag names that exist in the backend.

---

## 7. Verification after implementation

- Type `{%` → see suggestions: `if`, `for`, `where`, `set`, `else`, `elif`, `endif`, `endfor`, `endwhere`, `{#`.
- Type `{{ name |` → see suggestions: `sql_string`, `sql_int`, `sql_float`, … (all 11 filters).
- Type `{{` → see param suggestions (when `paramNames` is set) and snippet `{{ name }}`.
- Choose snippet `{% if %}...{% endif %}` → block is inserted with placeholders.
- On API view (if 4.3 is done): param suggestions match edit screen when opening content.

---

## 8. References in repo

- Backend filters: `backend/app/engines/sql/filters.py`
- Backend extensions (where tag): `backend/app/engines/sql/extensions.py`
- Params/Jinja usage: `docs/PARAMS_USAGE.md`, `docs/MIGRATION_PLAN_SQLREST.md` (section 3.2)
- UI plan (Monaco): `docs/PHASE5_UI_PLAN.md`
- SQL Jinja user guide: `frontend/src/routes/_layout/about.sql-jinja.tsx` (if-conditions cheat sheet)

Next step: implement steps 1→2→3 in `ApiContentEditor.tsx` and test on the create/edit API form.
