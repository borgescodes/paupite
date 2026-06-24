# Pendências — Lovable Cloud

Itens que existem no repositório mas **dependem de execução/validação no Lovable Cloud** (banco remoto, deploy de funções, configuração de projeto). Nada aqui foi executado; é apenas o registro do que falta confirmar/aplicar remotamente.

## Migrations a confirmar como aplicadas no remoto

Arquivos em `supabase/migrations/` (ordem cronológica). Não há Supabase CLI linkado localmente, então não é possível confirmar por aqui se cada uma já foi aplicada no projeto remoto (`pvsysbrejmuryszsbdhk`) — confirmar no painel/editor Lovable:

- `20260623022403_fa34cc15-fee3-44b8-bf25-217256e17f8b.sql`
- `20260623030617_1df722d7-86a4-49b7-91c0-6c1b6af9f693.sql`
- `20260623030709_01861a4e-6aa6-415b-8bb6-d66868689ace.sql`
- `20260623032748_29f24eca-913a-4619-9253-b80a7a0d5a24.sql`
- `20260623032828_4475ba81-658a-4936-baca-72889aa9b739.sql`
- `20260623032931_657a5407-83b7-41ad-aa68-463123c8cfc2.sql`
- `20260623033223_dfb2c443-71df-4321-a969-f9e2de7f94be.sql`
- `20260623033248_c350ec51-7241-4824-8472-6e64bc0021e5.sql`
- `20260623033437_95149fb1-59a0-4bbb-8757-a8d48be7e7f1.sql`
- `20260623040000_password_access_flow.sql`
- `20260623050000_security_hardening.sql`
- `20260623053000_fix_profiles_policy_recursion.sql` (mais recente — corrige recursão de policy em `profiles`)

> Quando uma nova migration for criada localmente neste projeto, adicionar o nome dela aqui até que se confirme a aplicação no remoto.

## Deploy de Edge Functions

As 5 funções abaixo existem como código em `supabase/functions/` mas o deploy/atualização no projeto remoto precisa ser confirmado/feito via Lovable Cloud:

- `admin-create-user`
- `admin-reset-user-password`
- `admin-set-temp-password`
- `complete-password-change`
- `recalculate-match-points`

Todas configuradas com `verify_jwt = false` em `supabase/config.toml` — essa configuração também precisa estar refletida no projeto remoto.

## Configurações Supabase/Lovable

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` (e equivalentes `VITE_*`) estão em `.env` local — confirmar que correspondem ao projeto remoto correto e que segredos de produção (service role key, etc.) só existem no ambiente do Lovable/Supabase, nunca neste repositório.
- `redirectTo` usado nos links de convite/reset (`admin-create-user`, `admin-reset-user-password`) depende da URL pública do app estar corretamente configurada nas allowed redirect URLs do projeto Supabase.

## Validação que não pode ser feita localmente

- Testar end-to-end o fluxo de convite/primeiro acesso/reset de senha (depende de envio de e-mail e link gerado pelo projeto remoto).
- Testar RLS reais contra dados de produção/staging (as policies só existem no banco remoto; não há banco local).
- Testar realtime (`postgres_changes`) de `matches`/`bets`, que depende da conexão com o projeto remoto.
