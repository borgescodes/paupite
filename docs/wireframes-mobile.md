# Wireframes mobile-first — PauPite

Documentação de UI/UX apenas. Nenhum componente React, rota ou página foi criado/alterado nesta etapa — isso é a especificação para a etapa de implementação seguinte. Base: `docs/referencia-visual.md` (padrão visual do app de referência) e `docs/mobile-navigation.md` (estrutura de abas). Largura de referência dos wireframes: ~375px (mobile first; adaptação para telas maiores é etapa futura).

> Identidade do app de referência (logo, mascote, nome, paleta exata) **não é reproduzida**. O que segue reproduz fielmente *estrutura, hierarquia, espaçamento, composição e feedback visual*, com a identidade do PauPite (tokens definidos em `docs/component-map.md`).

## Correções de arquitetura aplicadas nesta etapa

1. **Tela principal = Partidas.** É a primeira tela após login (substitui o atual `/home` como destino padrão).
2. **Palpite é inline no card** — não existe navegação para outra tela/modal para palpitar. O stepper de placar vive dentro do próprio card da lista.
3. Cada card de partida tem **dois estados de palpite possíveis**: *Palpite Livre* (sempre disponível) e *Palpite Oficial* (some/aparece conforme o usuário esteja inscrito no Bolão).
4. **Bolão não lista partidas** — é uma tela de status da competição oficial (participantes, meta, valor, premiação, inscrição, pagamento).

---

## 1. Header principal

```
┌─────────────────────────────────────┐
│  (●)  Olá, Borges            🏆  ⓧ   │   <- avatar + saudação | troféu (ranking) | fechar/menu
└─────────────────────────────────────┘
```
- Fixo no topo, altura compacta (não compete com o conteúdo).
- Avatar (placeholder genérico, sem mascote de marca) + nome/apelido do usuário.
- Ícone de troféu como atalho rápido para Ranking (reforça hierarquia: Ranking é destino frequente).
- Sem abas aqui — abas migraram para navegação inferior (ver seção 2). O header de referência tinha abas embutidas; aqui ele fica só identidade + atalho.

## 2. Navegação inferior (bottom nav)

```
┌─────────────────────────────────────┐
│                                     │
│   ⚽        🏆        📊        👤   │
│ Partidas  Bolão   Ranking  Perfil   │
│  ▔▔▔▔                                │   <- indicador da aba ativa
└─────────────────────────────────────┘
```
- 4 itens fixos, ordem fixa: **Partidas, Bolão, Ranking, Perfil**.
- Item ativo: ícone + label em cor de destaque (brand) + indicador (barra/ponto) acima ou abaixo do item; itens inativos em cinza neutro — mesma lógica de contraste "ativo vs. inativo" da referência (lá era cor cheia vs. cinza no segmented control do topo).
- Decisão de arquitetura desta etapa: navegação principal passa do topo (referência) para a base — convenção mobile nativa, alcance pelo polegar. Fidelidade ao padrão de *contraste ativo/inativo* é mantida; a *posição* muda por pedido explícito ("Navegação inferior").

## 3. Seletor horizontal de dias

```
┌─────────────────────────────────────┐
│   21 jun        22 JUN        23 jun │
│ fase de grupos  fase de grupos  ...  │
│   ◦              ━━              ◦   │
└─────────────────────────────────────┘
        (scroll horizontal, dia atual centralizado)
```
- Mesma lógica da referência: dia atual em destaque (maior, negrito, cor de brand), dias adjacentes em cinza/menor.
- Scroll horizontal com o dia ativo sempre centralizado; ao tocar em um dia adjacente, ele assume o centro.
- Legenda de fase da competição abaixo de cada data (ex. "fase de grupos").
- Vive apenas dentro da aba **Partidas** (não existe em Bolão).

## 4. Lista de partidas (aba Partidas)

```
┌─────────────────────────────────────┐
│  [seletor de dia]                    │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  Card de partida #1 (16:00)     │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │  Card de partida #2 (19:00)     │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │  Card de partida #3 (22:00)     │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```
- Lista vertical, um card por partida, **ordenada por horário crescente** dentro do dia selecionado (regra de produto já definida na etapa anterior).
- Espaçamento vertical generoso entre cards (mesma respiração da referência); cards "flutuam" sobre o fundo da tela.
- Scroll infinito vertical dentro do dia; trocar de dia volta o scroll ao topo.

## 5. Card de partida (estrutura base)

```
┌─────────────────────────────────────┐
│  Grupo J · Dallas Stadium · 16:00    │   <- contexto (grupo, local, horário)
│                                       │
│   🇦🇷 ARG        x        AUT 🇦🇹    │   <- bandeiras + sigla
│                                       │
│   [ bloco de estado/palpite ]        │   <- varia por estado (seções 6–10)
│                                       │
│  ─────────────────────────────────   │
│  👥 96% acha que vai vencer ARG      │   <- dado social (opcional, não pontuado)
└─────────────────────────────────────┘
```
- Cabeçalho de contexto sempre presente, igual à referência (texto secundário, cinza, pequeno).
- Bandeiras + sigla dos times sempre no mesmo lugar (maior hierarquia visual depois do bloco de placar).
- O "bloco de estado" troca de conteúdo conforme o status temporal da partida (seções 6–8) e o tipo de palpite disponível (seções 9–10) — é a parte composável do card.
- Dado social no rodapé do card, separado por divisória fina — mantém o padrão da referência, mas reforçado como *informativo*, nunca como prova de pontuação (evita confundir com Bolão).

## 6. Estado: partida futura (ainda não começou)

```
┌─────────────────────────────────────┐
│  Grupo J · Dallas Stadium · 16:00    │
│  ⏱ fecha em 02h 36m                  │
│                                       │
│   🇦🇷 ARG    ↑        ↑    AUT 🇦🇹   │
│              2         0             │
│              ↓        ↓             │
│                                       │
│        [  Enviar palpite  ]          │
└─────────────────────────────────────┘
```
- Badge de contagem regressiva até o fechamento (mesmo padrão da referência).
- Stepper de placar (setas + número grande) **inline no card** — sem abrir tela/modal.
- Botão de confirmação no rodapé do bloco; se já houver palpite salvo, o botão equivalente é "Editar" (estilo neutro) em vez de "Enviar" (estilo de destaque).

## 7. Estado: partida em andamento (live)

```
┌─────────────────────────────────────┐
│  Grupo J · Dallas Stadium · ● EM ANDAMENTO │
│                                       │
│   🇦🇷 ARG     1   x   0    AUT 🇦🇹   │   <- placar real, ao vivo
│                                       │
│   Seu palpite: 2 - 0  (travado)      │
└─────────────────────────────────────┘
```
- Indicador "live" (ponto/badge pulsante — microinteração, ver seção de feedback) substitui o horário estático.
- Placar real em destaque no lugar do stepper — palpite deixa de ser editável (travado), mas continua visível para referência do usuário.
- Sem stepper, sem botão de ação — bloco passa a ser somente leitura.

## 8. Estado: partida encerrada

```
┌─────────────────────────────────────┐
│  Grupo J · Dallas Stadium · encerrada │
│                                       │
│   🇦🇷 ARG     2   x   0    AUT 🇦🇹   │
│                                       │
│   Você palpitou      Resultado foi   │
│  ┌───────────┐      ┌───────────┐    │
│  │   2 - 0   │      │   2 - 0   │    │
│  └───────────┘      └───────────┘    │
└─────────────────────────────────────┘
```
- Duas colunas comparativas (palpite vs. resultado real), igual à referência.
- Borda/cor de feedback (acerto/quase/erro) só aparece quando o palpite em questão é **oficial** (Bolão) — ver seção 10. Para palpite **livre**, mantém-se neutro (sem selo de pontos), conforme regra definida na etapa anterior.

## 9. Estado de palpite: Livre

```
┌─────────────────────────────────────┐
│  PALPITE LIVRE                       │   <- rótulo discreto, cor neutra
│   🇦🇷 ARG    ↑        ↑    AUT 🇦🇹   │
│              2         0             │
│              ↓        ↓             │
│        [  Enviar palpite  ]          │
│  · sem pontuação · sem premiação ·   │
└─────────────────────────────────────┘
```
- Sempre disponível para qualquer partida futura, independente de inscrição no Bolão.
- Rótulo "PALPITE LIVRE" + microtexto explícito "sem pontuação · sem premiação" — clareza de produto para não confundir com o oficial.
- Visual neutro (sem cores de marca/destaque fortes) — é o estado "padrão", de menor prioridade que o oficial quando ambos coexistem no mesmo card.

## 10. Estado de palpite: Oficial (quando inscrito no Bolão)

```
┌─────────────────────────────────────┐
│  ⭐ PALPITE OFICIAL · BOLÃO           │   <- rótulo com selo de destaque (cor de brand)
│   🇦🇷 ARG    ↑        ↑    AUT 🇦🇹   │
│              2         0             │
│              ↓        ↓             │
│        [  Enviar palpite oficial ]   │
└─────────────────────────────────────┘
        (empilhado abaixo do bloco de Palpite Livre, no mesmo card)
```
- Só aparece quando `status da inscrição no Bolão = inscrito` (ver seção 11).
- Visualmente mais destacado que o bloco Livre (selo, cor de brand, peso tipográfico maior) — reflete que é o palpite que realmente pontua/premia.
- Quando a partida encerra e é pontuada, **este** bloco é o único que recebe o selo de resultado da referência ("Cravou o placar! +N pontos" / "Quase!" / "Errou tudo!", cores verde/laranja/vermelho) — o bloco Livre nunca recebe esse selo.
- Composição no card: se o usuário está inscrito no Bolão, o card mostra **os dois blocos empilhados** (Livre acima, Oficial abaixo, ou aba interna alternando entre os dois — decisão fina de implementação, registrada como aberta em `docs/component-map.md`). Se não está inscrito, o card mostra **só** o bloco Livre.

## 11. Tela do Bolão

```
┌─────────────────────────────────────┐
│  [header principal]                  │
│                                       │
│         🏆  BOLÃO DA COPA            │
│      status: aguardando abertura     │
│                                       │
│   ┌─────────────┐  ┌─────────────┐   │
│   │ Participantes│  │ Meta mínima │   │
│   │     128       │  │    200      │   │
│   └─────────────┘  └─────────────┘   │
│   ┌─────────────┐  ┌─────────────┐   │
│   │Valor estimado│  │  Premiação  │   │
│   │  R$ 1.280     │  │  R$ 1.000   │   │
│   └─────────────┘  └─────────────┘   │
│                                       │
│   Sua inscrição: não inscrito        │
│        [  Inscrever-se  ]            │
│                                       │
│   (quando liberado) [ Pagar inscrição ] │
│                                       │
│  [nav inferior]                      │
└─────────────────────────────────────┘
```
- **Não lista partidas.** É uma tela de status/painel da competição oficial.
- Blocos de métrica (participantes, meta mínima, valor estimado, premiação estimada) em grid 2x2 de cards pequenos — reaproveita o componente "card de métrica", não o card de partida.
- Estado de inscrição do usuário sempre visível (não inscrito / inscrito / pagamento pendente / confirmado).
- Ação de pagamento só aparece **quando liberado** (estado condicional, sem detalhar regra de cobrança nesta etapa — é só o placeholder de UI).
- Regras de pontuação/premiação detalhadas ficam para etapa futura (conforme já registrado em `docs/mobile-navigation.md`).

## 12. Tela de Ranking

```
┌─────────────────────────────────────┐
│  [header principal]                  │
│   RANKING OFICIAL · BOLÃO            │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │ 1º  🥇 Pedro B.        320 pts  │ │
│  ├─────────────────────────────────┤ │
│  │ 2º     Maria S.        301 pts  │ │
│  ├─────────────────────────────────┤ │
│  │ 3º     João T.         298 pts  │ │
│  ├─────────────────────────────────┤ │
│  │ ...                              │ │
│  ├─────────────────────────────────┤ │
│  │ 14º    (você)           140 pts │ │   <- linha do usuário sempre destacada
│  └─────────────────────────────────┘ │
│  [nav inferior]                      │
└─────────────────────────────────────┘
```
- Mantém o conceito já existente (view `ranking`): posição, nome, pontos, e os dados de apoio (acertos exatos, acertos de resultado, nº de palpites) disponíveis ao expandir uma linha ou em colunas secundárias, conforme espaço mobile permitir.
- Top 3 com destaque visual leve (medalha/cor), linha do próprio usuário sempre visível e destacada mesmo se a posição estiver fora da viewport inicial (ex. fixada no rodapé da lista ou com scroll automático).

## 13. Tela de Perfil

```
┌─────────────────────────────────────┐
│  [header principal]                  │
│                                       │
│           (  avatar  )               │
│           Pedro Borges               │
│           @apelido                   │
│                                       │
│   Nome de exibição     [___________] │
│   Apelido               [___________] │
│   Avatar (url)          [___________] │
│   País favorito         [  BR  ▾  ]  │
│                                       │
│        [  Salvar alterações  ]       │
│                                       │
│   e-mail, role e status são          │
│   gerenciados por um admin           │
│  [nav inferior]                      │
└─────────────────────────────────────┘
```
- Mantém o conceito já existente (edição de dados não sensíveis; e-mail/role/status só por admin).
- Reorganizado em layout mobile-first de formulário vertical com cabeçalho de identidade (avatar + nome + apelido) acima do formulário — sem mudança de regra, só de composição visual.

---

## Feedback visual e microinterações (resumo aplicado aos estados acima)

- **Cores de resultado** (verde/laranja/vermelho) reservadas exclusivamente ao bloco **Palpite Oficial** encerrado — nunca aparecem no bloco Livre.
- **Badge de contagem regressiva** (partida futura) e **indicador "live"** (partida em andamento) seguem o padrão de urgência/atenção da referência.
- **Microinterações esperadas** (a confirmar em implementação, ver `docs/referencia-visual.md` seção 8): incremento numérico ao tocar nas setas do stepper, transição suave ao expandir bloco oficial, pulso no indicador "live", troca de dia com destaque animado no seletor horizontal.
