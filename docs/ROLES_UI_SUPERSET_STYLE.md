# Roles UI – Superset-style

Trang quản lý Roles (`/security/roles`) được thiết kế tham khảo **Superset** (Flask-AppBuilder list views + React list pages như Row Level Security, Database list).

## Layout tham khảo Superset

1. **SubMenu bar (top)**
   - Full-width, nền `bg-muted/50`, có border-bottom.
   - Bên trái: tiêu đề trang **"Roles"** (font semibold, ~18px).
   - Bên phải: nút hành động chính (vd. **Create Role** / Add).

2. **Bảng danh sách**
   - Table trong card có border, nền trắng.
   - Cột: **Name**, **Description**, **Users** (số user có role), **Actions**.
   - Hàng trống: empty state với icon + text hướng dẫn.

3. **Actions (icon-only)**
   - **Edit**: icon bút (Pencil), link tới `/security/roles/$id`, có Tooltip "Edit role".
   - **Delete**: icon thùng rác (Trash2), mở dialog xác nhận, có Tooltip "Delete role".
   - Superset dùng icon-only + Tooltip cho từng action.

4. **Delete confirmation**
   - Dialog: title "Delete role", mô tả (tên role, cảnh báo không hoàn tác), nút Cancel + Delete (destructive).

## Backend hỗ trợ

- `GET /roles/list`: trả về `user_count` cho từng role (để hiển thị cột Users).
- `DELETE /roles/{id}`: xóa role và gỡ mọi liên kết user/permission (204 No Content).

## So sánh nhanh

| Phần        | Superset (FAB / React)      | pyDBAPI (Security > Roles)                   |
| ----------- | --------------------------- | -------------------------------------------- |
| Top bar     | SubMenu, title + Add        | SubMenu-style, title + Create Role           |
| Table       | ListView, sort/filter       | Table, cột Name, Description, Users, Actions |
| Row actions | Icon Edit, Delete + confirm | Icon Edit (link), Delete + confirm dialog    |
| Empty       | Custom empty state          | Icon + text hướng dẫn                        |
