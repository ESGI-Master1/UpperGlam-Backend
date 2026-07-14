export function canAccessAdminArea(hasAdminRole: boolean) {
  return hasAdminRole
}

export function canAccessProviderArea(hasProviderRole: boolean, hasProviderProfile: boolean) {
  return hasProviderRole && hasProviderProfile
}
