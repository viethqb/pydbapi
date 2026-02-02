# Audit: Response format { success, message, data }

Format mong muốn: `{ "success": true|false, "message": str|null, "data": list }`

**Phạm vi:** Chỉ áp dụng cho **các API động** được config trên UI (gateway). Các API backend phục vụ frontend (api-assignments CRUD, users, login, clients, modules, groups, …) giữ nguyên format hiện tại.

---

## 1. Gateway – `/{module}/{path:path}` (GET, POST, PUT, PATCH, DELETE)

| Case | Status | Format | Ghi chú |
|------|--------|--------|---------|
| **Success** (200) | ✅ | `{ success, message, data }` | `normalize_api_result` + `format_response` |
| **Error 500** (Exception trong runner) | ✅ | `{ success: false, message, data: [] }` | `format_response` áp dụng |
| **Error 403** (Forbidden, firewall) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |
| **Error 404** (Not Found, module/path) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |
| **Error 401** (Unauthorized) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |
| **Error 403** (Forbidden, client access) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |
| **Error 429** (Too Many Requests) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |
| **Error 400** (HTTPException từ runner) | ✅ | `{ success: false, message, data: [] }` | `_gateway_error` |

## 2. Debug – `POST /api/v1/api-assignments/debug`

| Case | Status | Format | Ghi chú |
|------|--------|--------|---------|
| **Success** (200) | ✅ | `{ success, message, data }` | `normalize_api_result` |
| **Error** (Exception trong execute) | ✅ | `{ success: false, message, data: [...] }` | Return trực tiếp |
| **Error 404/400** (validation, not found, etc.) | ✅ | `{ success: false, message, data: [] }` | `_debug_error_response` |

## 3. Các API backend phục vụ frontend (ngoài phạm vi)

api-assignments CRUD, users, login, clients, modules, groups, overview, token, … dùng response model riêng và giữ nguyên format hiện tại. Không áp dụng envelope `{ success, message, data }`.

---

## Kết luận

**Gateway + Debug** (API động config trên UI): tất cả success và error trả đúng format `{ success, message, data }`.
