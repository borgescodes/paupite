# Entrega do MVP completo — Pau Pite

## Escopo implementado

- recuperação de acesso por WhatsApp/admin, sem reset por e-mail na UI;
- RBAC final para `player`, `admin` e `superadmin`;
- `/home` lendo `matches`, `teams` e `bets` reais, com palpite persistente e trava no kickoff;
- `/matches` redirecionando para `/home`;
- administração mobile de partidas, resultados e fechamento com recálculo;
- Ranking da Resenha e Ranking do Bolão usando a mesma tabela `bets`;
- inscrição oficial, confirmação manual, pagamentos e recibos;
- checkout InfinitePay, webhook e `payment_check` server-side;
- perfil mobile com nickname, avatar 1:1, estatísticas e badges;
- importação JSON controlada;
- solicitação de prêmio sem payout automático;
- auditoria das ações críticas.

## Migration

Aplicar, depois das migrations anteriores:

`supabase/migrations/20260625030000_paupite_mvp.sql`

Ela é aditiva e preserva dados existentes. Cria/extende:

- `pool_settings`;
- `enrollments`;
- `payments`;
- `profile_badges`;
- `prize_requests`;
- `match_imports`;
- `audit_logs`;
- campos operacionais em `teams` e `matches`;
- views `ranking_free`, `ranking_pool`, `pool_public_summary`;
- bucket `avatars` e policies;
- triggers/policies de integridade de palpites e partidas.

### Aplicação manual

1. Abra Supabase Dashboard > SQL Editor.
2. Confirme que as migrations anteriores do repositório já foram aplicadas.
3. Cole e execute integralmente `20260625030000_paupite_mvp.sql`.
4. Confirme a existência das novas tabelas/views e do bucket `avatars`.
5. Não execute trechos isolados fora de ordem.

## Edge Functions

Novas:

- `admin-manage-user`;
- `admin-save-match`;
- `pool-enrollment`;
- `pool-create-checkout`;
- `infinitepay-webhook`;
- `infinitepay-payment-check`;
- `import-matches`.

Alteradas:

- `admin-create-user`;
- `admin-reset-user-password` (legado, restrito);
- `admin-set-temp-password`;
- `recalculate-match-points`.

Todas validam o usuário no backend. Funções privilegiadas usam `service_role` somente no ambiente seguro da Edge Function.

## Secrets necessários

Supabase fornece automaticamente às Edge Functions:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`.

Configurar:

- `INFINITEPAY_HANDLE`: InfiniteTag sem `$`;
- `APP_PUBLIC_URL`: URL pública HTTPS do app, sem barra final;
- `INFINITEPAY_WEBHOOK_TOKEN`: token aleatório longo, por exemplo gerado com `openssl rand -hex 32`.

Não existe secret InfinitePay no frontend. A documentação oficial atual do Checkout usa `handle`, `order_nsu`, webhook e `payment_check`: <https://www.infinitepay.io/checkout-documentacao>.

## Configuração InfinitePay

1. Defina os três secrets acima no Supabase.
2. Faça deploy de `pool-create-checkout`, `infinitepay-webhook` e `infinitepay-payment-check`.
3. Abra o Bolão como superadmin, defina valor e status `open`.
4. O checkout é criado em `POST https://api.checkout.infinitepay.io/links`.
5. O webhook recebido é protegido por token próprio e sempre confirmado via
   `POST https://api.checkout.infinitepay.io/payment_check`.
6. `amount`, `order_nsu`, `transaction_nsu`, `slug`, pagamento e inscrição são validados no servidor.
7. `redirect_url` apenas inicia uma checagem server-side; nunca ativa a inscrição diretamente.

Sem os secrets, a UI informa que o pagamento automático está pendente e a confirmação manual continua funcionando.

## Roteiro de teste

### Auth

1. Entrar com usuário ativo.
2. Entrar com senha temporária e concluir a troca obrigatória.
3. Abrir “esqueci senha” e confirmar o WhatsApp com mensagem pronta.
4. Confirmar que não há cadastro público nem `resetPasswordForEmail`.

### RBAC

1. Player: abrir `/admin` diretamente e confirmar redirecionamento.
2. Admin: acessar Jogos e Usuários, sem controles de superadmin.
3. Superadmin: criar/editar admin/player e definir senha temporária.
4. Tentar alterar o superadmin protegido.

### Partidas/palpites

1. Importar o JSON ou criar uma partida futura.
2. Palpitar em `/home`, recarregar e confirmar persistência.
3. Tentar alterar depois do kickoff.
4. Abrir `/matches` e confirmar redirecionamento.
5. Lançar resultado, fechar e confirmar recálculo.

### Ranking/bolão

1. Comparar Ranking da Resenha e Ranking do Bolão.
2. Solicitar inscrição sem pagar e confirmar ausência no ranking oficial.
3. Confirmar manualmente e verificar entrada no ranking oficial.
4. Com InfinitePay configurada, criar checkout e testar webhook/payment check.

### Perfil

1. Alterar nickname.
2. Enviar JPEG/PNG/WebP, ajustar zoom e salvar crop 1:1.
3. Selecionar no máximo duas seleções e duas ligas/clubes.
4. Confirmar avatar no ranking.

### Governança

1. Importar JSON inválido e válido.
2. Encerrar o bolão e testar solicitação de prêmio com usuário top 3.
3. Marcar prêmio pago.
4. Conferir registros na Auditoria.

## Validação local

- `npm run lint`: sucesso, com 7 warnings preexistentes de Fast Refresh em componentes compartilhados;
- `npm run build`: sucesso;
- Supabase remoto: não aplicado neste ambiente porque `supabase projects list` não retornou projetos autenticados.

## Riscos/pendências reais

- aplicar a migration e fazer deploy das funções no projeto Supabase/Lovable;
- configurar os secrets InfinitePay e testar com uma transação real de baixo valor;
- HEIC depende do suporte de decodificação do navegador; JPEG/PNG/WebP são o caminho garantido;
- confirmar a regra definitiva de distribuição de prêmio (o MVP usa top 3 após o bolão ser fechado);
- o bundle principal emite warning de chunk acima de 500 kB, sem impedir o build.
