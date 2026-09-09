/**
 * @deprecated Prefer `@/lib/central-http` — rotas HTTP `/api/dashboard/central/*`.
 * Mantido apenas para compatibilidade de imports legados.
 */
export {
  createCentralAccessLinkHttp as createCentralAccessLink,
  executeCentralAdminCommandHttp as executeCentralAdminCommand,
  fetchNotificationsHttp as fetchNotifications,
  fetchSupabasePublicConfigHttp as fetchSupabasePublicConfig,
  fetchUnifiedUserDetailsHttp as fetchUnifiedUserDetails,
  fetchUnifiedUsersHttp as fetchUnifiedUsers,
  mutateNotificationHttp as mutateNotification,
} from "@/lib/central-http";
