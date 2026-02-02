# Audit: Response format { success, message, data }

Desired format: `{ "success": true|false, "message": str|null, "data": list }`

**Scope:** Applies only to **dynamic APIs** configured in the UI (gateway). Backend APIs serving the frontend (api-assignments CRUD, users, login, clients, modules, groups, …) keep their current format.

---

## 1. Gateway – `/{module}/{path:path}` (GET, POST, PUT, PATCH, DELETE)

| Case                                      | Status | Format                                  | Notes                                      |
| ----------------------------------------- | ------ | --------------------------------------- | ------------------------------------------ |
| **Success** (200)                         | ✅     | `{ success, message, data }`            | `normalize_api_result` + `format_response` |
| **Error 500** (Exception in runner)       | ✅     | `{ success: false, message, data: [] }` | `format_response` applied                  |
| **Error 403** (Forbidden, firewall)       | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |
| **Error 404** (Not Found, module/path)    | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |
| **Error 401** (Unauthorized)              | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |
| **Error 403** (Forbidden, client access)  | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |
| **Error 429** (Too Many Requests)         | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |
| **Error 400** (HTTPException from runner) | ✅     | `{ success: false, message, data: [] }` | `_gateway_error`                           |

## 2. Debug – `POST /api/v1/api-assignments/debug`

| Case                                            | Status | Format                                     | Notes                   |
| ----------------------------------------------- | ------ | ------------------------------------------ | ----------------------- |
| **Success** (200)                               | ✅     | `{ success, message, data }`               | `normalize_api_result`  |
| **Error** (Exception in execute)                | ✅     | `{ success: false, message, data: [...] }` | Returned directly       |
| **Error 404/400** (validation, not found, etc.) | ✅     | `{ success: false, message, data: [] }`    | `_debug_error_response` |

## 3. Backend APIs serving the frontend (out of scope)

api-assignments CRUD, users, login, clients, modules, groups, overview, token, … use their own response models and keep the current format. The envelope `{ success, message, data }` is not applied.

---

## Conclusion

**Gateway + Debug** (dynamic APIs configured in the UI): all success and error responses use the format `{ success, message, data }`.
