/**
 * Resource / action matrix for role permissions.
 * - Menu: can access = show in sidebar.
 * - Resources: can view (read), can edit (create/update), can delete.
 */

export type ResourceActionRow = {
  resource: string
  label: string
  access?: string // permission code for menu access (e.g. menu:dashboard)
  view?: string
  edit?: string
  delete?: string
}

export const PERMISSION_MATRIX: ResourceActionRow[] = [
  {
    resource: "menu",
    label: "Dashboard (menu)",
    access: "menu:dashboard",
  },
  {
    resource: "menu",
    label: "Connection (menu)",
    access: "menu:connection",
  },
  {
    resource: "menu",
    label: "API Dev (menu)",
    access: "menu:api_dev",
  },
  {
    resource: "menu",
    label: "API Repository (menu)",
    access: "menu:api_repository",
  },
  {
    resource: "menu",
    label: "System (menu)",
    access: "menu:system",
  },
  {
    resource: "menu",
    label: "Admin (menu)",
    access: "menu:admin",
  },
  { resource: "dashboard", label: "Dashboard", view: "dashboard:view" },
  {
    resource: "connection",
    label: "Connection",
    access: "connection:access",
    view: "connection:view",
    edit: "connection:edit",
    delete: "connection:delete",
  },
  {
    resource: "modules",
    label: "Modules",
    view: "modules:view",
    edit: "modules:edit",
    delete: "modules:delete",
  },
  {
    resource: "api_assignments",
    label: "API assignments",
    view: "api_assignments:view",
    edit: "api_assignments:edit",
    delete: "api_assignments:delete",
  },
  {
    resource: "macro_defs",
    label: "Macro definitions",
    view: "macro_defs:view",
    edit: "macro_defs:edit",
    delete: "macro_defs:delete",
  },
  {
    resource: "groups",
    label: "Groups",
    view: "groups:view",
    edit: "groups:edit",
    delete: "groups:delete",
  },
  {
    resource: "clients",
    label: "Clients",
    view: "clients:view",
    edit: "clients:edit",
    delete: "clients:delete",
  },
  {
    resource: "users",
    label: "Users (admin)",
    view: "users:view",
    edit: "users:edit",
    delete: "users:delete",
  },
  { resource: "utils", label: "Utils", view: "utils:view" },
]
