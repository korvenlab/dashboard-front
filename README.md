# Korven Dashboard

Frontend TanStack Start do console administrativo centralizado.

## Ambiente

Copie `.env.example` e configure:

- `SUPABASE_URL`: URL do projeto central.
- `SUPABASE_ANON_KEY`: chave pública usada apenas para o canal Realtime no browser.
- `SUPABASE_SERVICE_ROLE_KEY`: chave privilegiada exclusiva do servidor.
- `KORVEN_DASHBOARD_*`: autenticação legada do dashboard, preservada durante a transição.

Não prefixe a service role com `VITE_` e não a serialize em loaders ou componentes. Listagens,
detalhes, mutações e Edge Functions passam por server functions protegidas pela sessão atual.

## Contrato central

O frontend consulta a view `dashboard_unified_users`, as tabelas `user_activity_events`,
`payment_events`, `audit_logs` e `notifications`, a RPC
`dashboard_metrics(period_start, period_end, product_slug)` e as Edge Functions
`admin-command` e `access-link`.

As notificações são lidas e alteradas server-side. A chave anon assina mudanças da tabela
`notifications` apenas para disparar refetch; o projeto Supabase precisa publicar a tabela no
Realtime e permitir a assinatura via política apropriada.

As métricas usam primeiro a RPC central. Stripe permanece identificado como
`stripe-legacy` quando acionado como fallback.

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

Use Node.js 22.12 ou superior, exigido pelas versões atuais de TanStack Start e Supabase.
