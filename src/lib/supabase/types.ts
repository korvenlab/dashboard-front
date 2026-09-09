export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Product = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
};

export type CanonicalUser = {
  id: string;
  email: string | null;
  name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ProductAccount = {
  id: string;
  user_id: string;
  product_id: string | null;
  product_slug?: string | null;
  external_user_id?: string | null;
  status: string | null;
  plan?: string | null;
  last_login_at?: string | null;
  last_synced_at?: string | null;
  metadata?: Json;
};

export type UnifiedUser = {
  id: string;
  email: string | null;
  name: string | null;
  status: string | null;
  created_at: string | null;
  last_login_at: string | null;
  product_accounts: ProductAccount[];
  products: string[];
  plan: string | null;
  payment_status: string | null;
  last_synced_at: string | null;
};

export type UserActivityEvent = {
  id: string;
  user_id: string | null;
  account_id: string | null;
  event_type: string;
  event_id: string;
  occurred_at: string;
  payload: Json;
  created_at: string;
};

export type PaymentEvent = {
  id: string;
  user_id: string | null;
  product_slug: string | null;
  event_type: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  payload: Json;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  product_id: string | null;
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  created_at: string;
};

export type IntegrationCommand = {
  id: string;
  user_id: string | null;
  product_slug: string | null;
  command: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AuditLog = {
  id: string;
  actor_auth_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Json;
  created_at: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string | null;
  level: string | null;
  href: string | null;
  context: Json;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type DashboardMetricRow = Record<string, Json | undefined>;

export type UnifiedUsersQuery = {
  search?: string;
  product?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type UnifiedUsersPage = {
  items: UnifiedUser[];
  page: number;
  limit: number;
  total: number;
};

export type UnifiedUserDetails = {
  user: UnifiedUser;
  activity: UserActivityEvent[];
  payments: PaymentEvent[];
  audit: AuditLog[];
};
