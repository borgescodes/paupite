# CLAUDE.md — PauPite

Guia de trabalho para quem (humano ou agente) for desenvolver neste repositório.

## Stack identificada

- **Frontend:** TanStack Start (React 19), file-based routing (`src/routes`), SSR via Nitro (target Cloudflare no build).
- **Estilo:** Tailwind v4 + componentes shadcn/radix já instalados em `src/components/ui` (ainda não usados pelas páginas — páginas atuais são placeholders com `style` inline).
- **Dados/Backend:** Supabase (Postgres + Auth + Edge Functions), client em `src/integrations/supabase`.
- **Gerenciamento de projeto:** [Lovable](https://lovable.dev) — o repositório é sincronizado via git push com o editor Lovable. Ver aviso em `AGENTS.md`: não reescrever histórico já publicado (sem force-push, rebase/amend/squash de commits publicados).
- **Outros:** TanStack React Query, React Hook Form + Zod, date-fns, recharts.

## Rotas existentes

| Rota | Arquivo | Descrição |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` | Redireciona para `/auth` ou `/home` conforme sessão |
| `/auth` | `src/routes/auth.tsx` | Login + "esqueci minha senha" |
| `/reset-password` | `src/routes/reset-password.tsx` | Primeiro acesso / redefinição de senha (`?mode=first-access\|reset`) |
| `/_authenticated/*` | `src/routes/_authenticated/route.tsx` | Layout guard: exige sessão ativa, redireciona para `/reset-password` se `must_change_password` ou status `invited` |
| `/home` | `_authenticated/home.tsx` | Painel inicial, navegação |
| `/matches` | `_authenticated/matches.tsx` | Lista de partidas + palpites (realtime via `postgres_changes`) |
| `/ranking` | `_authenticated/ranking.tsx` | Lê a view `ranking` |
| `/profile` | `_authenticated/profile.tsx` | Edição de dados próprios (não-sensíveis) |
| `/admin` | `_authenticated/admin.tsx` | CRUD de usuários/times/partidas, ações administrativas via Edge Functions |

## Estrutura Supabase/Auth

- **Tabelas:** `profiles`, `teams`, `matches`, `bets`, `competitions`, `score_rules`.
- **View:** `ranking`.
- **RPCs:** `admin_recalculate_match_points`, `calc_bet_points`.
- **Hierarquia de papéis:** `superadmin > admin > player`, aplicada em três camadas que precisam ficar consistentes: RLS (funções `private.is_active_admin`, `private.is_active_superadmin`, `private.can_select_profile`), Edge Functions (`canCreateRole`, `canResetRole`, `canSetPassword`) e frontend (`canManageProfile`, `canResetPassword` em `admin.tsx`).
- **Edge Functions** (`supabase/functions/`, todas com `verify_jwt = false` e validação manual do bearer token): `admin-create-user`, `admin-reset-user-password`, `admin-set-temp-password`, `complete-password-change`, `recalculate-match-points`.
- **Fluxo de senha:** convite → `invited` + `must_change_password=true` → usuário define senha em `/reset-password` → `complete-password-change` marca `status=active`. Admins podem forçar senha temporária ou gerar link de reset.
- Migrations em `supabase/migrations/` (SQL puro). Não há Supabase CLI instalado localmente — não é possível aplicar/testar migrations contra o banco remoto neste ambiente.

## Regras de trabalho

1. **Não alterar auth, RLS ou Edge Functions sem aprovação explícita.** É a área mais instável do projeto (commits recentes consecutivos de correção). Qualquer mudança ali deve ser proposta antes de ser feita.
2. **Não alterar layout final sem referência visual aprovada.** As páginas atuais são placeholders intencionais; não fazer redesign sem pedido explícito e referência.
3. **Não mexer em `.env`, secrets ou histórico git** (sem force-push, rebase/amend/squash de commits publicados — ver `AGENTS.md`).
4. **Trabalhar em mudanças pequenas.** Preferir incrementos revisáveis a refatorações grandes de uma vez.
5. **Mostrar os arquivos que serão alterados antes de alterar.** Sempre listar o que será tocado e esperar confirmação antes de editar, quando a mudança for sensível ou não tiver sido pedida explicitamente arquivo a arquivo.
6. Ações que dependem do Lovable Cloud (aplicar migration remota, deploy de Edge Function, configuração de projeto Supabase/Lovable) ficam registradas em `docs/pendencias-lovable.md`, não são executadas localmente.

Diagnóstico detalhado: ver `docs/diagnostico-inicial.md`. Pendências externas: ver `docs/pendencias-lovable.md`.
