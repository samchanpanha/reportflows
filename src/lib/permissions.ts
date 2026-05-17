export type Role = "SUPERADMIN" | "ORG_ADMIN" | "EDITOR" | "VIEWER"

export const PERMISSIONS = {
  // Global permissions
  canManageSystem: (role: string) => role === "SUPERADMIN",
  
  // Organization level permissions
  canManageUsers: (role: string) => ["SUPERADMIN", "ORG_ADMIN"].includes(role),
  canEditData: (role: string) => ["SUPERADMIN", "ORG_ADMIN", "EDITOR"].includes(role),
  canViewData: (role: string) => ["SUPERADMIN", "ORG_ADMIN", "EDITOR", "VIEWER"].includes(role),
}

export function hasPermission(role: string, action: keyof typeof PERMISSIONS) {
  return PERMISSIONS[action](role)
}
