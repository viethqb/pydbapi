# Kiểm tra: path_prefix vs module_name trong API và Frontend

## Kết luận nhanh

| Mục đích                                           | Đang dùng       | Ghi chú                             |
| -------------------------------------------------- | --------------- | ----------------------------------- |
| **Xây dựng URL endpoint / full path**              | **path_prefix** | Đồng bộ backend + frontend          |
| **Hiển thị tên module (cột "Module", breadcrumb)** | **module_name** | Chỉ để hiển thị, không dùng cho URL |

---

## Backend

### Resolver (`app/core/gateway/resolver.py`)

- **path_prefix**: Dùng để suy ra segment URL gateway.
  - `_module_gateway_key(m)`: `raw = (path_prefix or "/").strip("/")`
  - Nếu `raw` khác rỗng → segment = `raw` (ví dụ `/public` → `"public"`).
  - Nếu `raw` rỗng (path_prefix = `/`) → segment = `_slug(module.name)` (chỉ khi gọi dạng `/{segment}/{path}`; nếu gọi dạng `/{path}` thì dùng `resolve_root_module`).
- **Kết luận**: URL gateway được xác định bởi **path_prefix**; **module.name** chỉ dùng làm fallback khi path_prefix = `/` cho kiểu URL `/{segment}/{path}`.

### Gateway (`app/api/routes/gateway.py`)

- Chỉ dùng resolver (path_prefix + root module).
- Không dùng trực tiếp `module_name` cho routing.

### Các route khác

- **overview.py**: `full_path` = `module.path_prefix` (+ api path); nếu prefix rỗng thì `/{api_path}`.
- **permissions.py**: `_full_path(path_prefix, path)` dùng **path_prefix**.
- **modules.py**: Trả về `path_prefix` trong schema.

---

## Frontend

### Xây dựng URL / Full path (request + cột Full Path)

Tất cả đều dùng **path_prefix** (hoặc root):

| File                       | Logic                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `api-dev/apis/$id.tsx`     | `isRootModule` từ `path_prefix === "/"` → URL = `/{path}` hoặc `/{path_prefix_stripped}/{path}` |
| `api-repository/$id.tsx`   | Giống trên                                                                                      |
| `api-repository/index.tsx` | `fullPath` từ `module_path_prefix` (root → `/{apiPath}`, không root → `/{prefix}/{apiPath}`)    |
| `api-columns.tsx`          | Cột "Full Path" từ `module_path_prefix` (cùng logic)                                            |
| `system/groups/$id.tsx`    | `buildApiPath(module, api)` dùng `module.path_prefix`                                           |
| `ClientFormDialog.tsx`     | `getApiFullPath`: `raw = path_prefix`; nếu rỗng → `/{path}`, không thì `/{raw}/{path}`          |

Không có chỗ nào dùng **module_name** để ghép URL/full path.

### Hiển thị (tên module cho người dùng)

Dùng **module_name** (hoặc `module.name`) chỉ để hiển thị:

| File                       | Cách dùng                                                           |
| -------------------------- | ------------------------------------------------------------------- |
| `api-repository/index.tsx` | Cột "Module": `row.original.module_name`                            |
| `api-columns.tsx`          | Cột "Module": `row.original.module_name`                            |
| `api-dev/apis/index.tsx`   | `module_name: moduleMap.get(api.module_id)` (từ `m.name`) cho table |
| `api-dev/apis/$id.tsx`     | Breadcrumb/header: `{module.name}`                                  |
| `api-repository/$id.tsx`   | Tương tự: `{module.name}`                                           |
| `api-dev/modules/$id.tsx`  | Title, delete confirm: `module.name`                                |

---

## Nguồn dữ liệu frontend

- **module_name**: Lấy từ `module.name` (map `module_id` → `m.name`).
- **module_path_prefix**: Lấy từ `module.path_prefix` (map `module_id` → `m.path_prefix`).

Cả hai đều join từ danh sách modules, không mâu thuẫn với backend.

---

## Tóm tắt

- **path_prefix**: Dùng thống nhất cho mọi logic **URL / full path** (backend resolver, gateway, overview, permissions; frontend mọi chỗ build URL và cột Full Path).
- **module_name / module.name**: Chỉ dùng để **hiển thị** (cột Module, breadcrumb, title); không tham gia vào routing hay build URL.

Không cần chỉnh sửa thêm để đồng bộ path_prefix vs module_name; hiện tại đã nhất quán.
