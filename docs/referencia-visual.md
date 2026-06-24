# Referência visual

Fonte: `references.zip` (raiz do repo) — 5 screenshots do app **iFood — Bolão da Copa** (`br.com.brainweb.ifood`), capturados em 2026-06-23. Os arquivos não foram extraídos para o repositório (ficaram apenas em ambiente temporário de análise); se quiser versionar as imagens originais, decidir isso como uma etapa própria.

> **Observação importante:** a referência é usada para extrair *padrão de UX/estrutura/hierarquia visual* (grid, tipografia, espaçamento, tipos de card, fluxo). Marca, logo, mascote, nome "ifood"/"clube ifood" e identidade de cores específica da marca iFood **não devem ser copiados literalmente** — isso é identidade de outra empresa. A fidelidade pedida deve ser de **padrão de interface e interação**, adaptada à identidade visual própria do PauPite.

## 1. Estrutura de navegação

- Header fixo no topo: avatar do usuário + nome + selo de clube/status, ícone de troféu (ranking/prêmios), ícone de ajuda, ícone de fechar.
- Abaixo do header, uma barra de navegação por abas (3 abas no app de referência: **PARTIDAS / LIGAS / PERFIL**), estilo "segmented control": aba ativa com fundo azul preenchido e texto branco em caixa alta; abas inativas com texto cinza em caixa alta, sem preenchimento.
- Abaixo das abas, um seletor horizontal de dias: 3 datas visíveis por vez (dia anterior e seguinte pequenos/cinza, dia atual grande/azul/negrito), cada uma com legenda da fase da competição ("Fase de grupos"). Comportamento sugere scroll horizontal centrado no dia atual.
- Conteúdo principal é uma lista vertical de cards, um por partida, na ordem cronológica do dia selecionado.

## 2. Hierarquia visual

1. Identidade do usuário (header) — menor prioridade visual no dia a dia, mas sempre visível.
2. Navegação por abas — segunda camada, fixa.
3. Seletor de dia — terceira camada, controla o filtro principal de conteúdo.
4. Card de partida — unidade central de conteúdo; concentra a maior densidade de informação e contraste (números grandes, cores de feedback).
5. CTA secundário (compartilhar) — inserido entre cards, com cor de destaque própria (amarelo/dourado), para não competir com o conteúdo principal.

## 3. Tipos de card identificados

- **Card de palpite já resolvido (partida encerrada e pontuada).**
  Título "PALPITE O PLACAR" + subtítulo (grupo, estádio, horário) + bandeiras/sigla dos times + duas colunas ("Você palpitou" vs "O placar foi") com números grandes em caixas; borda da caixa do palpite colorida conforme resultado (verde = exato, laranja = quase, vermelho = errou). Abaixo: selo de resultado + pontos ganhos (pill colorida) e um dado social ("96% votou em X").
- **Card de partida encerrada, ainda não pontuada.**
  Mesmo cabeçalho de bandeiras/placar, mas com aviso neutro em cinza "Pontuação será atualizada em breve" no lugar do feedback de pontos.
- **Card de partida aberta para palpite (ainda não começou).**
  Título + badge de contagem regressiva azul ("EXPIRA EM 02H.36M.40S"). Em vez de duas colunas, usa um **stepper**: bandeira — seta ↑ — número grande — seta ↓ — número grande — seta ↑/↓ — bandeira, permitindo ajustar o placar palpitado diretamente no card.
- **Card expansível "O Oráculo diz" (insight/previsão).**
  Cabeçalho com ícone + título + chevron (colapsa/expande). Conteúdo: barra horizontal tricolor (verde/cinza/vermelho) representando % de chance de cada resultado (vitória casa / empate / vitória visitante), nomes dos times e percentuais abaixo, e opcionalmente um parágrafo de texto analítico.
- **Botão de ação dentro do card:** "Editar" (cinza, neutro) quando já existe palpite editável; "Enviar palpite" (laranja/vermelho, full-width) quando ainda não enviado.
- **Banner de CTA secundário:** faixa horizontal amarela/dourada "Compartilhar essa experiência", inserida solta entre cards (não é parte do card de partida).

## 4. Espaçamentos

- Padding interno generoso nos cards (aprox. 16–20px nas laterais, 16–24px verticalmente entre blocos internos).
- Espaço vertical claro entre cards (cards "flutuam" sobre um fundo em gradiente azul, reforçando a separação).
- Divisórias finas (linha cinza clara, 1px) usadas dentro do card para separar o bloco de placar do bloco de feedback/dado social — não usadas para separar cards entre si (a separação entre cards é por espaçamento + sombra/elevação implícita do card branco sobre fundo azul).
- Cantos arredondados consistentes em cards, badges e botões (raio médio, ~8–12px).

## 5. Tipografia

- Fonte sans-serif arredondada/grotesca, uso pesado de **negrito** e **caixa alta** para títulos de card e estados ("PALPITE O PLACAR", "CRAVOU O PLACAR!", "ERROU TUDO!").
- Números de placar em peso extra-bold, tamanho bem maior que qualquer outro texto do card — são o elemento de maior destaque visual da tela.
- Textos de apoio (subtítulo do jogo, "Você palpitou:", dado social) em peso regular, cinza médio, tamanho pequeno — contraste claro entre conteúdo "número" (alto destaque) e "contexto" (baixo destaque).
- Datas do seletor de dia usam escala de tamanho/peso/cor para indicar foco: dia atual grande + azul + negrito; dias adjacentes pequenos + cinza.

## 6. Uso de cores

- Azul forte como cor de marca/navegação (header, fundo gradiente, aba ativa, badge de contagem regressiva, dia atual).
- Branco como fundo de card (conteúdo principal sempre em superfície clara sobre fundo azul).
- Verde = acerto/positivo (placar exato, fatia "vitória" da barra do oráculo).
- Laranja = "quase"/aviso/CTA principal de envio de palpite.
- Vermelho = erro/urgência (placar errado, fatia "derrota" da barra do oráculo).
- Cinza = neutro/inativo/aguardando (estados sem feedback ainda, texto secundário, botão "Editar").
- Amarelo/dourado = engajamento secundário (compartilhar), claramente distinto das cores de feedback de resultado.

## 7. Padrões de interação

- Troca de dia por toque no seletor horizontal (filtra a lista de cards abaixo).
- Ajuste de palpite por steppers (incremento/decremento direto no card, sem abrir modal).
- Cards de palpite em aberto mostram contagem regressiva até o fechamento (urgência).
- Card "Oráculo" é colapsável (toque no chevron expande/recolhe insight).
- Palpite já enviado pode ser editado ("Editar") até o fechamento da partida.
- Após o resultado, o card "vira" para o modo de comparação (palpite vs. real) com feedback imediato de pontos.
- CTA de compartilhar aparece de forma intercalada, como ação social opcional, não bloqueando o fluxo principal.

## 8. Animações percebidas

As imagens são estáticas — o que segue é **inferência razoável a partir dos elementos de UI**, não confirmação de movimento real. Validar/ajustar quando houver referência em vídeo ou ao implementar:

- Contagem regressiva com atualização contínua de segundos (badge "EXPIRA EM").
- Expandir/recolher do card "Oráculo" (transição de altura + rotação do chevron).
- Possível transição de destaque ao trocar o dia selecionado (crossfade/escala no texto do dia ativo).
- Possível micro-feedback ao tocar nas setas do stepper (incremento numérico) e ao confirmar envio do palpite (estado de sucesso).

## 9. Fluxo principal do usuário

1. Usuário abre o app e cai na aba **Partidas** (aba padrão).
2. Usuário escolhe o dia desejado no seletor horizontal.
3. Usuário rola verticalmente pelos cards de partidas daquele dia, em ordem de horário.
4. Para uma partida ainda aberta: ajusta o placar via stepper, opcionalmente consulta o "Oráculo", e envia o palpite antes do prazo (contagem regressiva).
5. Para uma partida com palpite já enviado e ainda não iniciada: pode editar até o fechamento.
6. Para uma partida finalizada mas não pontuada: vê aviso neutro de "pontuação em breve".
7. Para uma partida finalizada e pontuada: vê comparação palpite vs. resultado real, pontos ganhos, e um dado social de quantos% acertaram a mesma tendência.
8. Opcionalmente, compartilha o resultado pelo banner de CTA.

## 10. Relação com a estrutura do PauPite

O padrão visual de card (cabeçalho do jogo, bandeiras, placar/stepper, feedback, dado social, oráculo) é a referência de fidelidade visual para a tela **Partidas**. Como a tela Partidas do PauPite registra **palpites livres sem pontuação/premiação** (ver `docs/mobile-navigation.md`), o card deve reaproveitar a estrutura visual (cabeçalho, bandeiras, stepper, layout) mas **sem** os elementos exclusivos de pontuação oficial (selo "+N PONTOS", "CRAVOU O PLACAR!") — esses elementos de feedback de pontuação fazem mais sentido na aba **Bolão**, que é a competição oficial pontuada.
