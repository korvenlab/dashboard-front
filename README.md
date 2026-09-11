# Korven Dashboard

Frontend TanStack Start do console administrativo centralizado.

## Ambiente

Copie `.env.example` e configure:

- `SUPABASE_URL`: URL do projeto central Korven.
- `SUPABASE_ANON_KEY`: chave pública (Realtime no browser).
- `SUPABASE_SERVICE_ROLE_KEY`: só no servidor — nunca `VITE_` / browser.
- `KORVEN_DASHBOARD_*`: autenticação do painel.

O backend do Korven é o **Supabase** (tabelas + Edge Functions `ingest-product-event`,
`admin-command`, `access-link`, `reconcile`). `WAGOO_API_*` / `TWO_AVENDAS_API_*` são
secrets das Edges para falar com os produtos — não substituem o Supabase.

## Contrato central

O frontend consulta a view `dashboard_unified_users`, as tabelas `user_activity_events`,
`payment_events`, `audit_logs` e `notifications`, a RPC
`dashboard_metrics(period_start, period_end, product_slug)` e as Edge Functions
`admin-command` e `access-link`.

`/monitoramento` (Mercado Pago) usa só dados já ingeridos no Supabase.

As notificações são lidas e alteradas server-side. A chave anon assina mudanças da tabela
`notifications` apenas para disparar refetch.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação:

```bash
npm run lint
npm run build
```

Use Node.js 22.12 ou superior.
