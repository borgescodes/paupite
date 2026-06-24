# Component map — PauPite mobile UI

Mapa de componentes proposto para a implementação seguinte. **Nenhum componente foi criado nesta etapa** — isso é planejamento: o que existe hoje em `src/components/ui`, o que falta criar, e que tokens de design novos são necessários. Wireframes correspondentes em `docs/wireframes-mobile.md`.

## 1. Tokens de design — gaps identificados

`src/styles.css` hoje define um tema neutro (slate/oklch) sem cores semânticas de feedback (acerto/quase/erro) nem uma cor de "brand" vibrante — só `primary` (quase preto/neutro), `secondary`, `muted`, `accent`, `destructive`. A referência depende fortemente de cor para comunicar estado (verde/laranja/vermelho/azul/dourado). Antes de implementar os componentes abaixo, propor (em etapa própria, com aprovação) novos tokens em `@theme inline` / `:root` / `.dark`:

| Token proposto | Papel | Uso |
| --- | --- | --- |
| `--color-brand` / `--color-brand-foreground` | Cor de identidade do PauPite (substitui o azul da referência) | header, nav inferior (ativo), seletor de dia (dia atual), badge "oficial" |
| `--color-success` / `--color-success-foreground` | Acerto exato | borda/selo "Cravou o placar" (só Palpite Oficial) |
| `--color-warning` / `--color-warning-foreground` | Acerto parcial | borda/selo "Quase!" (só Palpite Oficial) |
| `--color-danger` / `--color-danger-foreground` | Erro | borda/selo "Errou tudo" (só Palpite Oficial) — pode reaproveitar `--destructive` existente em vez de criar novo |
| `--color-live` | Indicador "em andamento" | ponto/badge pulsante no card live |

Sem esses tokens, os componentes de feedback (seções 6–10 dos wireframes) não têm como expressar a hierarquia de cor da referência sem usar cores "soltas" fora do design system. Registrar como pendência de decisão de produto, não implementar agora.

## 2. Componentes existentes reaproveitáveis (`src/components/ui`)

| Componente shadcn já instalado | Onde reaproveitar |
| --- | --- |
| `card.tsx` | Base de `MatchCard`, `PoolMetricCard`, `RankingRow` |
| `badge.tsx` | Selo "PALPITE OFICIAL", selo de resultado, badge de countdown, indicador "live" |
| `button.tsx` | "Enviar palpite", "Editar", "Inscrever-se", "Pagar inscrição", "Salvar alterações" |
| `avatar.tsx` | Avatar no header e no Perfil |
| `separator.tsx` | Divisória entre bloco de placar e dado social no card |
| `tabs.tsx` | Possível base para alternância interna Livre/Oficial dentro do card (alternativa ao empilhamento) |
| `input.tsx`, `label.tsx`, `select.tsx` | Formulário da tela de Perfil |
| `skeleton.tsx` | Estado de carregamento da lista de partidas / ranking |
| `progress.tsx` | Barra de "meta mínima" do Bolão (participantes atuais / meta) — alternativa a uma barra tricolor customizada |
| `tooltip.tsx` / `hover-card.tsx` | Detalhe extra em dado social ou em métricas do Bolão, se necessário |

Esses componentes já existem no design system instalado mas **não são usados por nenhuma página hoje** (páginas atuais usam `style` inline) — adotá-los é parte do trabalho de implementação desta nova UI.

## 3. Componentes novos a criar (implementação futura)

### Estrutura / navegação
- `AppHeader` — avatar + saudação + atalho de troféu (ranking). Variante compacta fixa no topo.
- `BottomNav` — 4 itens fixos (Partidas, Bolão, Ranking, Perfil), com indicador de item ativo.
- `DaySelector` — lista horizontal scrollável de dias; props: lista de dias, dia selecionado, callback de seleção; cada item carrega label de fase (“fase de grupos”).

### Partidas / card
- `MatchCard` — componente raiz do card de partida. Props centrais: dados da partida (times, horário, grupo/local, status temporal: `scheduled | live | finished`), dados de palpite livre, dados de palpite oficial (opcional — `null` quando usuário não inscrito no Bolão).
  - Composição interna usa os subcomponentes abaixo conforme o estado.
- `MatchHeader` (subcomponente) — contexto (grupo, local, horário) + bandeiras/sigla dos times.
- `ScoreStepper` — input de placar via setas incremento/decremento, usado tanto no bloco Livre quanto Oficial. Props: valor casa/fora, min/max, disabled.
- `ScoreCompare` — exibição lado a lado "seu palpite vs. resultado real", com variante de cor de borda (`neutral | success | warning | danger`) — variante de cor só é usada quando o bloco é Oficial.
- `LiveScoreIndicator` — placar ao vivo + badge pulsante "EM ANDAMENTO".
- `CountdownBadge` — badge azul/brand com tempo até o fechamento do palpite.
- `GuessSocialProof` — linha "X% acha que Y vai vencer" (rodapé do card).
- `FreeGuessBlock` — bloco "Palpite Livre": rótulo neutro + `ScoreStepper`/`ScoreCompare` + microtexto "sem pontuação · sem premiação".
- `OfficialGuessBlock` — bloco "Palpite Oficial": selo de destaque + `ScoreStepper`/`ScoreCompare` + (quando encerrado) selo de resultado com pontos.

### Bolão
- `PoolStatusHeader` — título + status textual (“aguardando abertura” / “aberto” / “fechado”).
- `PoolMetricCard` — card pequeno de métrica única (participantes, meta mínima, valor estimado, premiação estimada) — grid 2x2.
- `PoolEnrollmentPanel` — estado de inscrição do usuário (não inscrito / inscrito / pagamento pendente / confirmado) + CTA contextual (`Inscrever-se` ou `Pagar inscrição`, este último só quando liberado).

### Ranking
- `RankingRow` — posição, nome, pontos (+ dados secundários); variante "destaque" para top 3 e para a linha do próprio usuário.
- `RankingList` — lista de `RankingRow`, com fixação/scroll automático até a linha do usuário.

### Perfil
- `ProfileHeader` — avatar + nome + apelido, acima do formulário.
- Formulário reaproveita `input`/`label`/`select`/`button` existentes — sem novo componente dedicado além do layout.

## 4. Decisões abertas (não decidir nesta etapa, registrar para aprovação)

- **Composição Livre + Oficial no mesmo card:** wireframes propõem blocos empilhados (Livre acima, Oficial abaixo) como abordagem mais fiel à referência (cards sempre verticais, sem abas internas). Alternativa com `tabs.tsx` (alternância) economiza espaço vertical mas se distancia do padrão visual de referência — recomenda-se manter o empilhamento por fidelidade, mas é uma decisão de produto/UI a confirmar antes da implementação.
- **Fonte dos tokens de cor de feedback:** decidir paleta exata (valores oklch) antes de tocar em `styles.css` — está fora do escopo desta etapa (UI/UX sem alterar design system ainda).
- **Onde o `MatchCard` é renderizado:** a substituição de `/home` por Partidas como tela principal e a fusão do palpite inline implicam mudanças de rota/estrutura de página — registradas aqui como consequência de design, execução fica para a etapa de implementação (que vai precisar de aprovação explícita por tocar em rotas, conforme `CLAUDE.md`).
