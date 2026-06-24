# Navegação mobile — estrutura inicial (documentação, sem implementação)

Este documento define a estrutura de navegação e as regras de conteúdo para a próxima fase de implementação. **Nenhuma tela, rota, componente, Supabase ou fluxo de autenticação foi alterado nesta etapa** — é só especificação.

Mobile first é obrigatório: toda decisão abaixo assume viewport de celular como caso primário; comportamento em telas maiores é uma adaptação posterior, não o ponto de partida.

## Padrão de navegação adotado da referência

Da referência (`docs/referencia-visual.md`, seção 1): header fixo de identidade + barra de abas em "segmented control" abaixo do header + seletor horizontal de dia dentro da aba Partidas. Esse é o padrão a seguir com fidelidade visual (cores/identidade próprias do PauPite, não as da referência).

Abas do PauPite (diferente da referência, que tinha 3 abas "Partidas/Ligas/Perfil"): **Partidas, Bolão, Ranking, Perfil** — 4 abas fixas, sempre visíveis, ordem fixa nessa sequência.

## Aba: PARTIDAS (tela principal / aba padrão ao abrir o app)

- É a aba inicial do app (equivalente à landing pós-login, hoje em `/home` + `/matches` combinadas — decisão de rota fica para a etapa de implementação, não nesta).
- Partidas agrupadas por dia, seguindo o seletor horizontal de dia da referência (dia atual em destaque, navegação lateral entre dias).
- Dentro de cada dia, partidas ordenadas por horário (kickoff), crescente.
- Usuário registra **palpites livres**: ajusta o placar (stepper, como na referência) e confirma.
- **Palpites livres não geram pontuação nem premiação.** Isso é uma regra de produto, não só visual — o card de Partidas reaproveita a estrutura do card de referência (cabeçalho do jogo, bandeiras, placar/stepper, "Editar"/"Enviar palpite") mas **não exibe** os elementos de pontuação oficial da referência (selo de pontos, "CRAVOU O PLACAR!", etc.) — esses pertencem à aba Bolão.
- Pode manter elementos de engajamento "leves" que não impliquem pontuação oficial (ex.: dado social "X% palpitou em Y", card "Oráculo"), já que não comunicam premiação.
- Card visual deve seguir fielmente: tipografia (números grandes em negrito), espaçamento, cores de estado (sem usar verde/laranja/vermelho como indicador de pontuação aqui, já que não há "certo/errado" premiável — usar essas cores só se fizer sentido para outro tipo de feedback, ex. partida em andamento/encerrada).

## Aba: BOLÃO (área oficial da competição)

- É a área que carrega a pontuação e a premiação reais — equivalente ao conceito de "Bolão da Copa" que já existe no projeto (hoje as tabelas `bets`/`score_rules`/`ranking` servem a este conceito, não ao palpite livre de Partidas — a separação palpite-livre vs. bolão-oficial é uma decisão de produto desta etapa que terá implicação de modelagem na implementação, mas isso fica registrado aqui, não decidido no código agora).
- **Antes da abertura do bolão**, a tela deve exibir, no lugar da lista de partidas/pontuação:
  - contador de participantes confirmados;
  - meta mínima de participantes para abrir;
  - valor estimado do prêmio/arrecadação;
  - status "aguardando abertura" (texto/estado claro de que o bolão ainda não começou).
- Regras de pontuação, premiação, fechamento etc. **não devem ser aprofundadas ainda** — esta etapa só define que essa tela existe e qual o estado "pré-abertura"; o estado "pós-abertura" (lista de partidas pontuadas, no padrão visual de referência com selos "+N pontos", "cravou o placar" etc.) fica para uma etapa futura.

## Aba: RANKING

- Ranking oficial do bolão (equivalente ao que já existe hoje via view `ranking`/rota `/ranking`).
- Não recebe novas regras nesta etapa — mantém o conceito atual (lista ordenada por pontos, com posição, nome, pontos, acertos exatos, acertos de resultado, nº de palpites).
- Na nova navegação, passa a ser uma aba de primeiro nível (hoje é um link a partir de `/home`).

## Aba: PERFIL

- Mantém o conceito já existente (edição de nome, apelido, avatar, país favorito — dados não-sensíveis; e-mail/role/status continuam só editáveis por admin, conforme já implementado).
- Sem mudanças de regra nesta etapa.

## Mapeamento provisório com as rotas atuais (apenas referência — rotas não foram alteradas)

| Aba nova | Rota(s) atual(is) relacionada(s) | Observação |
| --- | --- | --- |
| Partidas | `/matches` (+ parte de `/home`) | Hoje sem distinção entre palpite livre e oficial; a separação é conceito novo desta etapa |
| Bolão | (não existe rota dedicada hoje) | Novo conceito de produto; hoje pontuação/`bets` está acoplada a `/matches` |
| Ranking | `/ranking` | Já existe como página própria |
| Perfil | `/profile` | Já existe como página própria |

Decisões de rota (criar `/bolao`, transformar `/_authenticated` em tab navigator, etc.) ficam pendentes para a etapa de implementação — aqui fica só o registro da intenção, conforme pedido ("não criar telas ainda", "não alterar rotas").

## Próximas decisões que dependem de aprovação antes de implementar

- Definir se a separação palpite-livre (Partidas) vs. palpite-oficial (Bolão) implica em nova tabela/coluna no banco (ex. `bets.kind` ou tabela separada) — é mudança de schema, então precisa aprovação explícita antes de qualquer migration (ver `CLAUDE.md`).
- Definir a paleta de cores própria do PauPite que vai substituir o azul/verde/laranja/vermelho/amarelo da referência (a referência define *papéis* de cor — destaque, sucesso, alerta, erro, engajamento —, não os valores hexadecimais a usar).
- Confirmar com referência visual real (vídeo ou interação ao vivo) os pontos da seção 8 de `docs/referencia-visual.md` antes de implementar timings de animação.
