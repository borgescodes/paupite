# Diagnóstico inicial

Data: 2026-06-23. Snapshot do estado do projeto no momento da análise — para histórico de mudanças, usar `git log`, não este documento.

## Resumo da stack

- TanStack Start (React 19) com file-based routing e SSR via Nitro.
- Tailwind v4 + componentes shadcn/radix instalados em `src/components/ui`, ainda não adotados pelas páginas atuais (que usam `style` inline como placeholder visual).
- Supabase JS (`@supabase/supabase-js`) para Auth, Postgres e Edge Functions.
- TanStack React Query, React Hook Form + Zod, date-fns, recharts já instalados como dependências (uso pontual ou ainda não adotado nas páginas existentes).
- Projeto gerenciado via Lovable (sync por git push; ver `AGENTS.md`).
- Gerenciador de pacotes: bun (`bun.lock`, `bunfig.toml`).

## Rotas

Ver tabela completa em `CLAUDE.md`. Resumo:
- Públicas: `/`, `/auth`, `/reset-password`.
- Protegidas (`/_authenticated`): `home`, `matches`, `ranking`, `profile`, `admin`.
- Guard em `_authenticated/route.tsx` redireciona usuários sem sessão para `/auth`, e usuários com `status=invited` ou `must_change_password=true` para `/reset-password`.
- Guard de `/admin` é duplicado dentro do próprio `admin.tsx` (`beforeLoad` verifica `role`/`status` de novo).

## Banco

Tabelas: `profiles`, `teams`, `matches`, `bets`, `competitions`, `score_rules`.
View: `ranking` (pontuação agregada por usuário).
RPCs: `admin_recalculate_match_points(_match_id)`, `calc_bet_points(...)`.
Enum: `app_role` (`superadmin`, `admin`, `player`).

Campos sensíveis em `profiles`: `role`, `status`, `must_change_password`, `first_access_completed_at`, `last_password_reset_at`, `temporary_password_set_at` — protegidos por RLS (`profiles_update_own_visual` permite usuário editar só campos visuais, validado por `private.profile_self_update_is_safe`).

## Edge Functions

Todas em `supabase/functions/`, todas com `verify_jwt = false` (validam o token manualmente contra o client anon antes de usar service role):

| Função | Responsabilidade | Quem pode chamar |
| --- | --- | --- |
| `admin-create-user` | Cria usuário (Auth Admin API) + profile `invited` + link de primeiro acesso | admin/superadmin ativos, respeitando hierarquia |
| `admin-reset-user-password` | Gera link de reset e marca `must_change_password` | admin/superadmin ativos, respeitando hierarquia |
| `admin-set-temp-password` | Define senha temporária diretamente, força troca | admin/superadmin ativos, respeitando hierarquia |
| `complete-password-change` | Marca profile como `active` após troca de senha | o próprio usuário autenticado |
| `recalculate-match-points` | Recalcula pontos via RPC e fecha a partida | admin/superadmin ativos |

## Riscos técnicos

1. **Área de auth/RLS instável.** Os 5 commits mais recentes do repositório são todos correções nesse fluxo (recursão de policy em `profiles`, CORS de edge function, contexto de migration, primeiro acesso, senha temporária). Indica fragilidade ainda não totalmente estabilizada.
2. **Lógica de permissão duplicada em 3 camadas** (RLS em SQL, validação em cada Edge Function, e funções `canManageProfile`/`canResetPassword`/`canCreateRole` no frontend). Mudar a regra de hierarquia em um lugar sem replicar nos outros cria inconsistência entre o que a UI permite e o que o banco/função realmente aceita.
3. **Sem Supabase CLI local / sem projeto linkado.** Não é possível aplicar, testar ou fazer rollback de migrations localmente; toda validação de banco depende do ambiente remoto via Lovable.
4. **Fallbacks de compatibilidade no frontend** (`_authenticated/route.tsx` e `admin.tsx`) fazem uma segunda query mais simples caso a primeira falhe por coluna inexistente — sinal de que o código no repo já rodou contra um schema remoto desatualizado em algum momento. Esses fallbacks devem ser removidos só depois de confirmar que o schema remoto está 100% alinhado com as migrations do repo.
5. **Páginas com estilo inline, sem componentes shadcn.** Não é um risco funcional, mas qualquer trabalho futuro de UI precisa decidir explicitamente se vai migrar essas páginas para os componentes já instalados — não fazer isso silenciosamente junto de outra mudança.

## Pontos sensíveis (não alterar sem aprovação)

- Migrations existentes em `supabase/migrations/`.
- Código das Edge Functions em `supabase/functions/`.
- Fluxo de autenticação/senha (`auth.tsx`, `reset-password.tsx`, `_authenticated/route.tsx`, hooks/`use-auth.ts`).
- `.env` e quaisquer credenciais/segredos.
- Histórico git já publicado (sem rebase/amend/force-push).
- Layout final das páginas, sem referência visual aprovada.

Detalhamento de pendências externas: ver `docs/pendencias-lovable.md`.
