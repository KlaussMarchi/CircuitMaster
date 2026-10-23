# PROGRESSO

Memória do trabalho do plano `FRIZING_KICAD.md` (pasta acima do repositório). Ler ao começar; atualizar ao fim de
cada item.

**Fase atual: 5 — bibliotecas do KiCad como peças** (a fase 4 terminou em 2026-10-23, commit `34fd68b`; os pedidos do usuário de 2026-10-23 em `ca2feb3` e `82bb7ed`; seções no fim do arquivo).

## Fase 0 — base de testes e auditoria (fechada em 2026-10-21)

### Feito

- Playwright (`@playwright/test` 1.64.1, Apache-2.0; usa o Chromium 1248 que já estava em `~/.cache/ms-playwright`
  e o Firefox 1555 baixado por `npx playwright install firefox`). `playwright.config.ts` com os projetos
  `chromium` e `firefox` (o Vite sobe sozinho na porta 5210) e `playwright.perf.config.ts` para o desempenho.
- `e2e/Fixtures`: o fixture `app` abre o app, expõe o store carregado pela página em `window.cm` e reprova o teste
  com qualquer erro ou aviso de console, erro de página, requisição falha ou resposta HTTP ≥ 400.
- E2E verdes no Chromium: `circuit` (esquemático → fios → três vistas → simular → teste Degrau e Onda quadrada →
  salvar → reabrir), `samples` (124 exemplos nas três vistas, exportando o netlist), `edit` (menus Editar, Peça e
  Exibir, menus de contexto de peça e fio, atalhos, arrastar, pan, roda, seletor de área), `pcb` (criar placa e
  rotear, DRC, preenchimentos e sementes, trilhas, faces, dobra ↔ via, várias placas).
- Matriz: três auditorias em `scratchpad/matrix/` (Fritzing 251 linhas, KiCad esquemático/comuns 404, KiCad
  PCB/3D/GerbView/calculadora 421, mais as seções dos manuais), a juntar em `docs/specs/00-MATRIZ.md`.

### Bugs achados e corrigidos

1. **PCB: clique dentro da placa ia para a placa.** Cada camada da peça é um `<image>` que recebe clique na caixa
   inteira, e a serigrafia da placa fica acima das peças e trilhas. Agora só a camada mais baixa de cada peça recebe
   clique (`PartItem.hit`, `engine/Drawing`; regra refeita no item 8). Teste: `tests/engine.test.ts` e
   `e2e/pcb.spec.ts` (clique na peça dentro da placa a seleciona).

### Decisões

- A "Fonte DC" curada (`power_supply_dc_5.fzp`) só existe no esquemático, como no Fritzing: não tem porta na
  protoboard nem na PCB, então suas ligações não aparecem lá. Os testes conferem a vista cruzada com peças das três.
- Colar com o alinhamento à grade ligado encaixa o conjunto na grade depois do deslocamento de (20, −20) px; a spec
  02 §10.3 passa a dizer isso.

### Retomada (2026-10-21, segunda sessão)

- `selectAll` (`ui/Store`) seleciona só o que `Scene.isShown` mostra na vista; o E2E "Selecionar tudo pega só o
  que aparece na vista" falha sem a correção e passa com ela (a asserção antiga procurava `kind === 'board'`, mas
  a placa criada é `resizableBoard`).
- Fixture: `watch()` separado de `open()` (o teste de desempenho usa só o `watch`); requisições canceladas pela
  própria navegação (`net::ERR_ABORTED`, `NS_BINDING_ABORTED` durante `goto`) deixam de reprovar; `actionTimeout`
  de 15 s para um clique em item desabilitado falhar na hora em vez de esgotar os 3 min do teste.
- `playwright.perf.config.ts` + `e2e/perf.spec.ts`: build de produção no `vite preview` (porta 5211), grade
  sintética de 1.000 peças montada com o `core` (`build/perf/grade-1000.fzz`), relatório em
  `build/perf-report.txt`. `npm run e2e` roda os dois navegadores; `npm run perf` faz o build antes.
- Spec 02 §10.3 (colar encaixa na grade; Ctrl+A só a vista) e §10.4 (menus como estão no código: Preenchimento de
  cobre ▸ … Limpar sementes de terra; sementes no menu do conector; 100% em Shift+Ctrl+0), §4.10 (a cadeia do fio
  cortado sai inteira). Spec 01 §8A.5 (peça sem `variant` ganha `variant N`). README e `CLAUDE.md` com os comandos
  novos e as regras dos E2E.
- Matriz: F-037 feita (bug corrigido), KC-034 volta a falta (fase 2); toda linha "feita" aponta para um teste que
  existe (conferido por script).

### Bugs achados e corrigidos (continuação)

5. **Fio por cliques: Backspace tirava um vértice, não a última dobra.** No esquemático (fios ortogonais) um clique
   acrescenta o cotovelo e o ponto; o Backspace tirava só o ponto e o caminho mudava. O `Wiring` guarda o estado
   anterior (`previous`) e o Backspace volta a ele (`ui/Canvas`). Teste: `e2e/circuit.spec.ts` "Fio por cliques"
   (o traço depois do Backspace é igual ao de antes da segunda dobra; falha sem a correção).
6. **Apagar linha de ratsnest deixava trechos soltos.** O corte mínimo apagava só o trecho cortado de um fio com
   dobras; agora sai a cadeia direta inteira, como o `collectChained` do Fritzing (`engine/Edit.deleteRatsnest`).
   Teste: `tests/edit.test.ts` "apagar a linha de ratsnest leva a cadeia inteira".
7. **Peça sem `variant` gravada pelo editor ficava sem `variant`.** O editor do Fritzing dá `variant N` à peça que
   não tem (`pemainwindow.cpp`); `PartDraft.ensureVariant` faz o mesmo. Teste: `tests/partdraft.test.ts`.
8. **PCB: depois do preenchimento de cobre o clique na peça ia para o preenchimento.** A correção 1 deixava cada
   peça clicável só pela camada mais baixa (cobre de baixo), que fica sob o preenchimento de cima. Agora a placa
   recebe clique pela camada de baixo e as outras peças pela camada de cobre mais alta: acima do preenchimento,
   abaixo das trilhas de cima (`engine/Drawing`). Teste: `tests/engine.test.ts` (regra em todos os exemplos) e
   `e2e/pcb.spec.ts` "regras gravadas" (menu da peça sobre o preenchimento).
9. **Placa nova não nascia sticky.** No Fritzing (`applyBoardCreationDefaults`) a placa colocada na PCB nasce
   sticky; `createInstance` faz o mesmo para placas com camada sticky. Teste: `tests/edit.test.ts` e
   `e2e/edit.spec.ts` (a placa leva o resistor apoiado; sem sticky, não leva).

### Testes corrigidos (o teste estava errado, o app certo)

- Atalhos com Shift em símbolo: o teclado real manda `}`, `{` e `)` com Ctrl+Shift; o Playwright com
  `Control+Shift+]` manda `]`. Os testes passam a usar `Control+}`, `Control+{` e `Control+)`.
- Adicionar nota é assíncrono (carrega a peça da nota): o teste espera a seleção.
- Atribuir um conector no editor de peças renomeia o elemento para `connectorNpin`, como no Fritzing.
- A contagem do histórico do editor esperava o painel abrir (o resistor tem uma entrada sintética de `<date>` e
  `<author>`).
- A protoboard do Fritzing 1.0.8 não tem camada sticky (só as placas de PCB): o teste do Sticky passa para a PCB.
- O osciloscópio colocado com o zoom do circuito de teste (347%) ficava com os terminais fora da tela: o teste
  reduz o zoom antes e enquadra depois.

### Decisões (continuação)

- Placa nova nasce sticky, mas não travada: o Fritzing 1.0.8 também liga a trava de movimento, e aqui arrastar a
  placa com as peças é o que o iniciante espera; travar fica a um clique no menu de contexto.
- O desempenho é medido no build de produção, não no servidor de desenvolvimento.

10. **Firefox: o indexador morria com "InternalError: too much recursion".** Com vários Firefox em paralelo, o
    SpiderMonkey acusa estouro de pilha numa regex do xmldom (`normalizeLineEndings`) dentro do worker, com a pilha
    de 9 quadros; a mesma chamada repetida passa. O `index()` rejeitava, toda busca e todo `locate` ficavam presos
    e o app ficava sem peças. O worker repete uma vez a leitura e a busca quando o erro é esse `InternalError`
    (`workers/Indexer`). Teste: 20 abas do Firefox em paralelo indexando sem falha; a suíte do Firefox inteira verde.
11. **Editar um `.md` recarregava o app no servidor de desenvolvimento.** O Tailwind v4 varria o projeto inteiro
    (specs, README) atrás de classes e, a cada mudança, mandava recarregar a página. `@import "tailwindcss"
    source("./")` limita a busca a `src/` (`src/index.css`); o CSS gerado não mudou. Visto nos E2E: testes em
    andamento perdiam o `window.cm`.
12. **DIP 8 e barras de pinos do bin Core sumiam.** O bin Core do Fritzing cita peças geradas sem `.fzp` em disco
    (`generic_ic_dip_8_300mil`, `generic_female_pin_header_2_100mil`, `generic_shrouded_pin_header_10_100mil`); o
    indexador as descartava. Agora entram no índice pela raiz `generated` (o `locate` não as devolve, e a `Library`
    cai em `generateFzp`), aparecem no bin e na busca com o ícone gerado. Teste: `e2e/parts.spec.ts` "Peças
    geradas do bin Core". O Core passa de 197 para 200 peças.

13. **No clone limpo os testes de preenchimento e de fontes falhavam com ENOENT.** Vários testes gravam relatórios em
    `build/` e só passavam porque outro teste criava a pasta antes. `writeReport` (`tests/Fixtures`) cria a pasta;
    achado pelo `npm run verify` no clone em `build/clean/`.

Fechamento: `npm run verify` verde na pasta de trabalho e num clone limpo em `build/clean/` (`npm ci`,
`FRITZING_ROOT` apontando para o acervo): Vitest 109 + 2 pulados (ngspice nativo ausente), 122 E2E nos dois
navegadores, desempenho dentro dos orçamentos. Commits `cd1e153` e `757f3f0`.

### Desempenho (primeiro relatório, `build/perf-report.txt`)

Build de produção no `vite preview`, Chromium 156, i5-13450HX, 16 GB:

| Medida | Valor | Orçamento |
|---|---|---|
| Abertura com o cache vazio (até o Simular) | 445 ms | ≤ 3000 |
| Indexação do acervo do Fritzing (cache vazio) | 2,6 s | — |
| Segunda abertura | 64 ms | ≤ 3000 |
| Busca (pior de 6 termos) | 14 ms | ≤ 50 |
| Pan e zoom na PCB com 1.000 footprints | 59,3 e 60,0 fps; quadro mais longo 33 ms | ≥ 55 fps |
| Abrir a grade de 1.000 peças | 704 ms, tarefa mais longa 247 ms | ≤ 50 na fase 7 |
| Trocar para a PCB com 1.000 peças | tarefa mais longa 169 ms | ≤ 50 na fase 7 |
| Memória (heap JS) com 1.000 peças | 25 MB | ≤ 1024 |
| Crescimento ao reabrir um exemplo 10 vezes | 0 MB | ≤ 20 |
| JavaScript inicial | 693 KB (233 KB gzip) | ≤ 710 (não crescer) |

### Bugs e pendências abertos

- Aviso do React "Cannot update a component (`Rail`) while rendering a different component" apareceu duas vezes
  em rodadas completas (com `Canvas` e com `Icon` como componente em render), depois da última asserção de algum
  teste; não reproduziu em três rodadas instrumentadas. O fixture agora espera 300 ms antes de conferir os erros e
  anexa a pilha a esse aviso. Na rodada do `verify` voltou só no log do Vite, no Firefox, durante os testes de
  `ui.spec.ts` que recarregam a página (Layout, Fotos): vem do documento que está saindo, que o Playwright já não
  reporta; isolado (12 repetições) não aparece. Só no modo de desenvolvimento; investigar com o log completo do
  Vite (que mostra a pilha anexada) na fase 1.
- O índice do acervo só vai para o IndexedDB no fim: recarregar durante a primeira indexação (2,6 s) perde tudo.
  Fase 1 (gravar em lotes).
- Abrir e desenhar 1.000 peças tem tarefas de 170–250 ms na thread da interface. Fase 7.
- As fontes vêm do Google Fonts: sem rede o app cai nas fontes do sistema. Fase 1 (cenário sem rede; fontes OFL
  servidas pelo próprio app).
- O editor de peças usa classes Tailwind próprias (`bg-primary`, `rounded-md`, sombra) fora do estilo do resto da
  interface. Fase 2.

## Fase 1 — robustez

Spec `docs/specs/06-ROBUSTNESS-SPEC.md`.

### Feito

- **Supervisor comum dos workers** (`ui/Supervisor`, `workers/Serve`): respostas pelo `id`, vigia de inatividade
  (indexador 60 s, PCB 60 s, simulador 15 s) zerada por qualquer mensagem, `onerror` e `onmessageerror`, resposta
  `error` quando o trabalho lança, cancelamento idempotente e recriação no pedido seguinte. Antes, o `PcbTools`
  esperava para sempre por um WASM abortado e nenhum cliente tratava erro do worker; um `onmessage` assíncrono que
  lançava deixava o pedido sem resposta. DRC, preenchimento e autorouter dizem a causa e "tente de novo".
- **Limites de erro** (`ui/Boundary`) nas nove regiões: a falha mostra a causa e "Recarregar painel" no lugar da
  região; diálogo e editor de peças também têm "Fechar".
- **Arquivo aberto como fronteira** (`core/Sketch.readFile`): zip com mais de 20.000 arquivos ou mais de 256 MB
  declarados é recusado antes de descompactar.
- **IndexedDB do usuário** (`ui/Vault`, banco `circuitmaster-user`): peças de pacote e do editor saem do
  localStorage, com migração automática; falha de armazenamento vira mensagem.
- **Salvamento automático e recuperação** (`ui/Autosave`): 1,5 s depois de cada mudança e ao esconder a aba, uma
  versão por minuto, 20 versões, sessões por aba com Web Locks, diálogo de recuperação ao abrir, Arquivo › Versões
  salvas automaticamente; Abrir, Novo e circuito de teste perguntam com alterações não salvas.
- **Histórico de desfazer** (`engine/History`, painel Projeto, Editar › Histórico de desfazer): nome de cada passo
  pela diferença dos documentos; um clique salta para qualquer passo (`jump`).
- **Fuzzing** com `fast-check` 4.10.2 (MIT): leitores, geometria e sequências de edição (`tests/fuzz.test.ts`).
- **Cenários da seção 6** em `e2e/robust.spec.ts` (14 testes nos dois navegadores) e `e2e/soak.spec.ts`
  (`npm run soak`, meia hora: 872 voltas, heap de 25,2 para 27,5 MB depois do GC, `build/soak-report.txt`).
- Fontes da interface servidas pelo app (`@fontsource/public-sans` e `@fontsource/jetbrains-mono` 5.3.0, OFL,
  subconjunto latino, cerca de 100 KB de woff2); o Google Fonts saiu do `index.html`.

### Bugs achados e corrigidos

1. **Vazamento de memória em cadeia no `Canvas`** (achado pela meia hora automatizada: o heap subia uns 3 MB por
   minuto). `settle` (memorizado por `[view]`) e `finishNote` (por `[doc, commit]`) viviam no escopo do render; como
   mudam em momentos diferentes, cada escopo guardava um callback de um render mais velho, que guardava outro, e
   cada um prendia o `drawing` do seu render. A lógica do viewport ao vivo foi para o hook `useLiveViewport`, a nota
   grava por `saveNote` lendo o store e o `closeMenu` deixou de ser memorizado. Teste: `e2e/soak.spec.ts`
   (o snapshot de heap já não mostra caminhos de fio repetidos).
2. **`parseTransform` devolvia NaN** para `matrix(1,0,0,1,NaN,0)` (achado pelo fuzzing): agora o atributo inválido
   não transforma, como no SVG. Teste: `tests/fuzz.test.ts`.
3. **Sem rede, colocar uma peça nova ou abrir um exemplo lançava `TypeError` sem dono**: `fetchBytes`/`fetchText`
   (`ui/Catalog`) voltam nulos e a mensagem diz "não encontrado ou sem rede". Teste: `e2e/robust.spec.ts` "Sem rede".
4. **Novo perguntava pelo tamanho do histórico, não pelas alterações**: depois de salvar ainda perguntava. Agora
   pergunta quando o documento difere do salvo, como o Abrir e o circuito de teste.
5. **O cache do índice só ia para o IndexedDB no fim**: recarregar durante a primeira indexação perdia tudo. Grava a
   cada 1.000 peças. Teste: `e2e/robust.spec.ts` "primeira indexação".
6. **Diálogo de versões em monoespaçada**: a tabela `.tbl` põe mono em toda célula; texto e botões voltam à fonte do
   texto (`td.label`, `td .btn`).

7. **O salvamento automático travava a interface por 300 ms com 1.000 peças** (achado pelo `verify`: tarefa de
   320 ms no meio do pan). Montar o `.fzz` custa 339 ms de texto e 59 ms de zip; agora o worker `workers/Saver`
   monta o pacote para o autosave e para o Salvar, e na thread da interface fica só a clonagem (39 ms). Teste:
   `e2e/perf.spec.ts` (pan sem tarefa longa).
8. **Sem rede o Salvar não baixava**: o worker do `.fzz` nascia no primeiro uso e, offline, o script dele não
   carrega. Ele sobe na abertura. Teste: `e2e/robust.spec.ts` "Sem rede".
Fechamento: `npm run verify` verde na pasta de trabalho e no clone limpo (Vitest 124 + 2 pulados pela falta do
ngspice nativo, 152 E2E nos dois navegadores, desempenho dentro dos orçamentos); `npm run soak` verde. Commit
`67aca5a`.

### Decisões

- O salvamento automático grava a cada mudança, sem o intervalo configurável do Fritzing: o padrão certo no lugar de
  uma preferência.
- O `.fzz` inteiro é a unidade do autosave: a recuperação reusa o mesmo leitor do Abrir.
- O teste de meia hora fica fora do `verify` (`npm run soak`) e roda ao fechar cada fase.

### Bugs e pendências abertos

- O aviso do React "Cannot update a component (`Rail`) while rendering…" (fase 0) não voltou nas rodadas da fase 1.
- O JavaScript inicial está em 702 de 710 KB: a fase 2 carrega sob demanda o editor de peças e o que vier de novo.

## Fase 2 — interface direta (fechada em 2026-10-22)

Spec `docs/specs/05-INTERFACE-SPEC.md`.

### Auditoria de cliques (antes → depois)

Fotos do antes em `build/ui-antes/` (fim da fase 1); do depois em `build/ui/`.

| Fluxo | Antes | Depois |
|---|---|---|
| Começar a desenhar no esquemático | 1 clique (o app abria na protoboard) | 0: abre no Esquemático |
| Ver o circuito no tempo | 2 (Transitório na barra + Simular) | 1 (Simular); se nada varia, o regime direto |
| Gráfico e medidas depois de simular | 0 a 1 (doca aberta; trocar de aba para Resposta) | 0: curvas, gráfico e medidas juntos |
| Trocar o teste para Degrau | 2 (aba Ajustes + Degrau), só com Transitório ligado | 1 (Degrau no cabeçalho do painel) |
| Ver τ, sobressinal e acomodação | 1 (aba Resposta) | 0 (coluna das medidas) |
| Janela manual | 3 (Ajustes + Manual + campo) | 1 (digitar o fim ou Manual: os campos aparecem no cabeçalho) |
| Duração da animação, valores sobre o circuito, opções do SPICE | 1 (Ajustes) + rolar | 1 ("⋯" do painel) |
| Achar uma ação sem saber o menu | percorrer os menus | 2 (Ctrl+K e o nome, em português ou em inglês) |

### Feito

- **Abre no Esquemático** (decisão 1): o app, o sketch novo e o arquivo aberto (`START_VIEW` em `ui/Store`).
- **Uma simulação só** (decisão 2): saiu o seletor DC/Transitório da barra e do menu; Simular roda o transitório na
  janela do teste e, se todo vetor fica parado (até 10⁻⁴ do nível), mostra o regime sem animação, com a causa
  quando o teste pedia variação ("Onda quadrada precisa de uma fonte de pulso…"). `Simulation.isStill()`; teste em
  `tests/spice.test.ts`. O `.fzz` segue com as propriedades `simulator_*`.
- **Painel único de simulação** (decisão 3, `ui/SimulationPanel`): teste em controle segmentado no cabeçalho
  (Automático, Degrau, Onda quadrada, Senoide, Manual; o Manual mostra início e fim ali mesmo), fim da janela,
  reproduzir/pausar e barra de tempo; "⋯" com animação, valores sobre o circuito, amostragem do manual e opções do
  SPICE; corpo em três colunas: curvas (busca, caixa, cor; o nome escolhe a curva das medidas), gráfico sempre
  visível (o regime sem eixo de tempo) e medidas da curva escolhida (no cursor, média, RMS, pico a pico; período,
  subida, τ, sobressinal, acomodação, ζ, ganho e fase só quando valem). Abre sozinho ao simular. Até 1280 px curvas
  e medidas dividem a coluna da esquerda; no celular tudo empilha. Saíram as abas Medidas/Resposta/Ajustes e o
  `ui/SimulationSettings`. Menu Simulação › Teste ▸ e Painel de simulação.
- **Paleta de comandos** (`ui/Palette`, `Ctrl+K`, Ajuda › Paleta de comandos): todo item dos menus (inclusive
  exemplos e submenus) e os painéis, com caminho e atalho; termos em inglês do Fritzing e do KiCad por rótulo.

### Bugs achados e corrigidos

1. **Ponta de prova no terminal do esquemático não pegava**: em 100% o terminal fica na ponta da perna, fora da
   área clicável da imagem, e a ponta só procurava terminais da peça sob o cursor. Agora procura o terminal a até
   14 px do clique (`ui/Canvas.placeProbe`). Teste: `e2e/circuit.spec.ts` "Arquivo: Novo pergunta…".
2. **Cabeçalho do painel alargava a página no celular** (478 px numa janela de 390): o cabeçalho quebra em linhas e
   o controle de testes também. Teste: `e2e/ui.spec.ts` "Layout a 390 px".

3. **Na PCB a via ficava inteira sob a faixa de clique das trilhas** (pendência da fase 0): em zoom normal não dava
   para chegar ao menu da via. O quadro desenha um alvo de clique de cada via acima das trilhas, como no KiCad
   (`ui/Canvas`, `viaHits`). Teste: `e2e/pcb.spec.ts` "dobra vira via" clica no centro da via sem aproximar o zoom
   (falha sem a correção).
4. **"Não rotear automaticamente" marcava só o trecho clicado**: ao apagar as trilhas autoroteadas, os trechos
   vizinhos saíam e o trecho fixo ficava solto sobre o pad, cobre sem net que o DRC acusava. Agora vale para a cadeia
   direta inteira, como o `excludeFromAutoroute` do Fritzing (`engine/Edit.setAutoroutable`). Testes:
   `tests/edit.test.ts` "não rotear automaticamente vale para a cadeia inteira" e `e2e/pcb.spec.ts` "regras
   gravadas" (o DRC volta a zero com a folga de 0,01 in).
5. **Os E2E antigos não achavam itens avançados no modo Iniciante** (o modo novo esconde "Colar no lugar", "Travar
   peça"…): 13 testes vermelhos nos dois navegadores. O fixture abre no modo Profissional quando a página ainda não
   escolheu modo; o teste dos modos troca e recarrega (`e2e/ui.spec.ts` "Modos").
6. **Timer 555 caía no cartão genérico de CI**: ganhou cartão próprio, com as fórmulas do astável e do monoestável
   (`core/Lesson`). Teste: `tests/lesson.test.ts` (toda peça básica tem cartão próprio; família mais específica
   vence; fórmula com os valores do circuito).

7. **Firefox: a indexação parava em 2600/2619 sem erro** (achado pelo `verify`). O cache do IndexedDB só resolvia
   em `complete` ou `error`: uma transação abortada deixava a promessa pendente, e a gravação final era esperada antes
   do "pronto". A transação abortada também resolve, o "pronto" não espera o cache (que serve à próxima abertura) e
   cada leitura tem 15 s com uma segunda tentativa (`workers/Indexer`). Sem teste que reproduza o aborto; a suíte do
   Firefox inteira passou em três rodadas seguidas.
8. **Salvar e fechar a aba logo depois oferecia "recuperar trabalho não salvo"**: a versão automática só virava
   "salva" 1,5 s depois, montando o pacote de novo. O Salvar grava na hora a versão limpa com os mesmos bytes
   (`ui/Store.save`). Teste: `e2e/ui.spec.ts` "Preferências" (salva, recarrega e não aparece a recuperação).
9. **JavaScript inicial passou do orçamento** (723 de 710 KB, achado pelo `verify`). O editor de peças carrega quando
   abre (`React.lazy`, 29 KB com o `PartDraft`); fica em 695 KB. A paleta continua no inicial: carregada sob demanda
   ela perdia as primeiras teclas digitadas logo depois do Ctrl+K. Teste: `e2e/perf.spec.ts` e `e2e/ui.spec.ts`
   "Modos" (Ctrl+K e digitar na hora).

10. **Folga no orçamento de JavaScript inicial** para o que ainda entra na fase 2: a geração das exportações
    (Gerber, BOM, IPC, PDF e imagens) foi para `ui/Output`, importado só ao exportar; `ui/Export` ficou com tipos,
    `download`, `getClipper`, `boardProblem` e `needsBoard` (a lista das exportações com placa é a fonte única, e o
    TypeScript confere que o `Output` cobre todas). O cartão didático carrega com a primeira peça selecionada. Os dois
    são pré-carregados depois da abertura, para exportar sem rede. Inicial: 700 → 671 KB.

- **Tour curto por modo** (`ui/Tour`): aparece uma vez por modo (Iniciante na primeira abertura; Maker e
  Profissional na primeira troca), um passo por vez perto do alvo, que ganha a linha de seleção; Próximo, Pular e Esc;
  Ajuda › Tour da interface repete. Passos cujo alvo não está na tela (o painel de peças no celular) são pulados.
  Os modos já vistos ficam em `circuitmaster.toured`. O fixture dos E2E marca os tours como vistos na primeira
  abertura do contexto. Teste: `e2e/ui.spec.ts` "Tour" e as fotos `build/ui/tour-*`.

### Desempenho na bateria

Fora da tomada o pan e o zoom com 1.000 footprints passam do orçamento de tarefa longa (95–106 ms contra 50) no
commit `6f0f884` e na pasta de trabalho igualmente (medido nos dois em seguida): é a potência limitada do processador,
não regressão. O `verify` de fechamento roda na tomada (a memória do projeto já avisa que o perfil de energia muda os
números). Na tomada, o mesmo teste deu 0 ms de tarefa longa no pan.

### Feito (continuação)

- **Preferências** (Editar › Preferências…, Ctrl+,): roda do mouse (zoom ou rolar a vista, com Ctrl+roda para o
  zoom), arrastar o meio do fio curva por padrão (Ctrl inverte, como o "curvy wires" do Fritzing), modo e tema;
  gravadas no navegador (`circuitmaster.preferences`).
- **Atalhos configuráveis** (`ui/Keys`): uma tabela de ações com nome, teclas padrão e o que fazem alimenta o
  teclado, os atalhos dos menus e da paleta, o diálogo Atalhos (que deixou de ser uma lista escrita à mão) e o
  editor de teclas das Preferências. A tecla escolhida sai da ação que a tinha; "padrão" e "Restaurar todos" voltam
  ao Fritzing. Testes: `tests/keys.test.ts` e `e2e/ui.spec.ts` "Preferências".

- "Tudo para fabricar (zip)…" em Exportar › Para produção (Gerber, furação, pick-and-place, BOM e IPC).
- DRC automático na PCB a cada mudança, marcado no desenho (`[data-drc]`); Problemas lista.
- Camadas da PCB na legenda do quadro e em Exibir › Camadas da PCB.
- Modos Iniciante (padrão), Maker e Profissional (`ui/Modes`, Exibir › Modo da interface): só escondem itens; a
  paleta acha tudo em qualquer modo; o modo fica gravado.
- Cartão "Como funciona" no inspetor (`ui/Lesson`, `core/Lesson`): o que é, como funciona, fórmula e a fórmula com
  os valores do circuito simulado; aberto no Iniciante.

### Retomada (2026-10-22, o PC desligou com 30% de bateria)

- Os 3 vermelhos do Firefox na rodada da bateria ("Inspetor e cartão de valor", "Paleta de comandos", "Modos", todos em
  `app.place`) não voltaram na tomada: `ui.spec.ts` sozinho no Firefox (13 verdes) e a suíte inteira (164 verdes em
  5,7 min, contra 12,3 min na bateria). Era intermitência sob carga; o `place` do fixture ficou como estava.
- `npm run verify` na tomada: Vitest 135, E2E 164, desempenho todo dentro do orçamento (pan e zoom com 1.000
  footprints a 59–60 fps, 0 ms de tarefa longa; JS inicial 674 KB).

### Feito (2026-10-22, continuação)

- **Abas de sketches** (`ui/Stage`, `ui/Store`): Novo, Abrir, Exemplos, circuitos de teste e Recuperar abrem numa aba
  nova (a ativa vazia e sem mudança, ou o mesmo arquivo sem mudança, é reusada); cada aba guarda documento,
  histórico, vista, enquadramentos, seleção, ponta e DRC. Com um sketch só, o palco mostra o nome e o selo como antes.
  Fechar (× e Arquivo › Fechar sketch) pergunta só com alterações; Arquivo › Salvar todos (com mais de uma aba).
  Abrir nunca mais descarta: saiu a pergunta "Descartar as alterações…". Salvamento automático com uma sequência de
  versões por aba (`ui/Autosave`, spec 06 §6); recuperar um sketch mantém os outros da sessão morta na lista.
  Testes: `e2e/ui.spec.ts` "Abas de sketches", `e2e/robust.spec.ts` "Dois sketches abertos na mesma aba".
- **Editor de peças no estilo da interface**: saíram as 86 classes Tailwind próprias, o `<style>` embutido com cores
  fixas e o fundo em `conic-gradient`; usa `.modal`, `.card`, `.field`, `.in`, `.tab` (abas e ponto terminal com
  `role="tab"`), `.pill`, `.tbl`, `.dot`; o desenho fica sobre `--well`, com o esquemático invertido no tema escuro
  como no quadro, e as marcas em `--accent`, `--positive` e `--negative`. Fotos `build/ui/editor-*`.
- **Inglês** (`core/Text`, `core/Text/en.ts`, 966 textos): Preferências › Idioma; a interface, as mensagens, o
  histórico de desfazer, os cartões didáticos e a BOM exportada mudam na hora (a interface remonta com o documento
  intacto) e a escolha fica no navegador. O dicionário só carrega quando escolhido (JS inicial 674 → 680 KB). Testes:
  `tests/text.test.ts` (toda chave traduzida, mesmos `{0}`, nenhuma sobrando) e `e2e/ui.spec.ts` "Inglês" (percorre
  menus e submenus, paleta, simulação, inspetor, PCB, painéis, diálogos, tour e editor de peças e reprova qualquer
  texto em português na tela).
- Spec `docs/specs/05-INTERFACE-SPEC.md` com o teste de clareza; README, spec 02 §10.4 e spec 06 §6 atualizados.

- **Funções comuns do KiCad da fase 2** (`ui/Navigation`, `ui/Keys`, `e2e/navigation.spec.ts`; spec 05 §11): coordenadas
  do cursor na barra de status (mm, polegadas, mils; `Ctrl+U`; `Espaço` zera as relativas; polares), cursor do teclado
  (setas sem seleção, `Ctrl`+setas, `Enter` clica, `End` dá duplo clique ou termina o fio), cursor em cruz pequeno, na
  janela toda e a 45°, `Shift`+setas e `F4` movendo a vista, zoom na seleção e na área (`Ctrl+F5`), desfazer e refazer
  o último zoom, lista de grades por vista com `N`/`Shift+N` e grades rápidas (`Alt+1`, `Alt+2`, `Alt+4`), origem da
  grade (clique, cursor, digitada na aba Documento, restaurar) seguida por peças, fios e pontos da grade, grade por
  tipo (peças, fios), seleção por laço, apagar com cliques, copiar como texto, Peça › Ver na protoboard/esquemático/PCB
  (seleção cruzada), painel da esquerda recolhível pelo trilho, Ajuda › Guia de uso e Boas-vindas, e nas Preferências
  as grades e a manutenção (restaurar todos os ajustes, refazer o índice do acervo). A PCB com peças e sem placa
  mostra "Criar placa e rotear" no próprio quadro (o teste de clareza pedia mais de dois passos). Matriz: nenhuma
  linha da fase 2 em "falta"; F-040, F-086, F-087 e F-092 ficaram parciais para a fase 3 (o que falta é das outras
  vistas ou de outras fases).

### Bugs achados e corrigidos (continuação)

11. **"Carregar SVG…" do editor quebrava em duas linhas**: a classe `.btn.block` era também o utilitário `block` do
    Tailwind, que na camada `utilities` passa por cima de `components` (`display: block`). Virou `.btn.full`; regra
    na spec 05 §12.
12. **Esquemático do editor de peças ilegível no escuro**: o filtro de inversão ia no fundo junto; agora só no SVG.
13. **Chip do quadro dizia "Transitório" com o circuito em regime** e o eixo do gráfico em regime virava pV com o ruído
    do solver em volta de zero (escala mínima de 1 unidade abaixo de 10⁻¹²).

### Pendências abertas

- O aviso do React "Cannot update a component (`Rail`) while rendering…" foi reproduzido fora dos testes (script com
  seis abas do Firefox abrindo os circuitos de teste em paralelo): sai só quando o Playwright fecha a página com a
  simulação reproduzindo, depois do último ponto em que o fixture ouve o console; durante os testes não aparece.
  Só no modo de desenvolvimento.

14. **`ui/Keys` deixou de carregar no Node** (`tests/keys.test.ts`): a tabela passou a importar a navegação, que
    importava o Store em tempo de execução (e o Store lê `document`). A navegação recebe o estado como parâmetro e
    importa do Store só tipos (regra no `CLAUDE.md`).
15. **Botão "Criar placa e rotear" duplicado** com a aba Roteamento aberta (o do quadro some quando o painel já o
    mostra) e **Preferências estourando a 390 px** (os controles segmentados quebram linha).
16. **Aba ativa escondida a 1280 px**: as abas de sketches encolhem com reticências e a ativa rola para a vista; o
    efeito que rola usa corpo em bloco porque o `scrollIntoView` do Chromium 156 devolve uma Promise (que virava a
    "limpeza" do efeito e quebrava o quadro).

### Fechamento da fase 2

`npm run verify` verde na pasta de trabalho (Vitest 138, E2E 182 nos dois navegadores, desempenho dentro dos
orçamentos: pan e zoom com 1.000 footprints a 59–60 fps sem tarefa longa, JS inicial 700 KB de 710) e no clone limpo
em `build/clean/` (Vitest 136 + 2 pulados pela falta do ngspice nativo, 182 E2E, desempenho). Commit `217ffa8`.
Revisão visual nas fotos de `build/ui/` (dois temas, 1920, 1280 e 390 px). Matriz: Fritzing 141 feitas de 251; KiCad
esquemático, comuns e projeto 117 de 404; PCB 27 de 421; nenhuma linha da fase 2 em "falta".

Ficou para depois: o aviso de desenvolvimento do React no fechamento da página (acima); o JS inicial está a 10 KB do
orçamento, então a fase 3 começa tirando do pacote inicial o que só abre sob demanda (diálogos, tour); os menus
Simulação e Ajuda somem a 1280 px (decisão da fase 0, spec 02 §10.4) e as ações seguem pela paleta e pelo trilho.

## Fase 3 — restante do Fritzing

Escopo: as 77 linhas "falta" da fase 3 na matriz (arquivo: reverter, recentes, salvar como, imprimir, PDF vetorial;
seleções e atualização de peças; grade livre, cor de fundo, fios por comprimento, camadas em todas as vistas, ver de
baixo, face clicável, não roteadas; menu do rótulo; bins; editor de peças; peças paramétricas, logo de imagem e placa
livre; largura da trilha no inspetor).

### Feito (2026-10-22)

- **Arquivo**: Salvar como… (Ctrl+Shift+S) pergunta o nome e renomeia a aba; Salvar uma cópia… baixa com outro nome
  sem renomear; Reverter volta ao arquivo aberto ou salvo depois de perguntar; Abrir recentes ▸ guarda até 10 cópias
  no IndexedDB (versão 2 do `circuitmaster-user`, store `recent`) e tem Limpar recentes; Imprimir… (Ctrl+P) põe a vista
  em SVG numa folha de impressão.
- **Peças e seleções**: Peça › Localizar peça no sketch… (Ctrl+F, a lista "No sketch" da busca), Selecionar peças
  travadas, Selecionar peças desatualizadas (`replacedby` do `.fzp`) e Atualizar peças selecionadas, Exportar peça…
  (o `.fzpz` da peça como está), Desligar todos os fios; Roteamento › Selecionar trilhas "não rotear" e autoroteáveis no
  esquemático e na PCB, Selecionar todos os jumpers.
- **Exibir**: fios da protoboard coloridos pelo comprimento; tamanho de grade livre em in ou mm e Restaurar a grade
  padrão; cor de fundo da vista (aba Documento, Padrão volta ao tema); bin em ícones ou em lista; camadas nas três
  vistas (legenda do quadro e Exibir › Camadas, guardadas por vista).
- **Bins**: os 28 bins de `fritzing-parts/bins` abrem em abas pelo "+" e fecham no ×, e as abertas ficam gravadas; o
  Temp aparece com as peças do sketch que não são do acervo; o menu de contexto da peça no bin edita no editor de
  peças, exporta, remove de Meus itens ou de um bin do usuário e localiza no sketch.
- **PCB**: Ver de baixo (quadro espelhado, camadas de baixo por cima, rótulos legíveis, clique, pan e exportação
  espelhados); só uma face de cobre clicável (Shift+Ctrl+1, 2 e 3); Mostrar não roteadas (realce até o próximo
  clique, nas três vistas); largura das trilhas selecionadas no inspetor (lista do Fritzing e valor livre de 8 a 128
  mil, com desfazer).
- **Menu do rótulo da peça** (`partlabelcontextmenu.cpp`): Editar (leva ao campo Nome do inspetor, sem diálogo),
  Ocultar, Exibir valores ▸ (texto do rótulo e cada propriedade), Girar/Espelhar ▸ (45° e 135° só na PCB) e Tamanho da
  fonte ▸ com os tamanhos de cada vista. O giro fica no `transform` do `titleGeometry`, como no Fritzing, e vale no
  desenho, na caixa do rótulo e na serigrafia do Gerber; o histórico de desfazer diz "mudou o rótulo de…".
- `ui/Dialog` e `ui/Tour` passaram a carregar sob demanda.
- Testes: `e2e/fritzing.spec.ts` (12 fluxos), `tests/edit.test.ts` (giro do rótulo em torno do centro e ida e volta
  do `.fz`), `tests/partdraft.test.ts` (pacote lido de novo).

### Bugs achados e corrigidos (fase 3)

1. **O `transform` do rótulo se perdia**: o leitor do `.fz` ignorava o `<transform>` do `titleGeometry`, e um rótulo
   girado no Fritzing voltava reto ao gravar. Agora é lido, gravado e desenhado.
2. **Reabrir um `.fzz` com peça própria tirava a peça do próximo Salvar**: `addBundle` trocava o objeto da peça em
   `bundled` mas não em `parts`, e `getBundleFiles` (e o Temp) comparam os dois por identidade. A peça de pacote já
   carregada fica, como no Fritzing (mesmo `moduleId` é a mesma peça). Teste: `tests/partdraft.test.ts`.
3. **Exibir › Cor de fundo… abria o painel Projeto da esquerda**, que não tem o seletor; abre a aba Documento.
4. **Paleta**: "copy" punha "Salvar uma cópia…" acima de "Copiar" (empate); no empate o rótulo mais curto vem antes.

### Decisões

- Os títulos dos bins de fábrica vêm do `.fzb` e ficam em inglês ("Contributed Parts"), como os nomes das peças do
  acervo.
- Editar o rótulo não abre diálogo (o Fritzing abre): leva ao campo Nome do inspetor já selecionado (seção 5, "direto
  ao ponto").

### Feito (2026-10-22, continuação)

- **Preferências** (F-040): cores de realce dos terminais ligado e solto; texto dos net labels novos (na ponta de fora
  ou junto ao conector), que o inspetor troca em cada net label (`alignForPolicy` do `symbolpaletteitem.cpp`). O
  Gerber já sai sempre com seis casas (a opção beta do Fritzing é o padrão aqui).
- **Sementes de terra** (F-102): Roteamento › Preenchimento de cobre › Escolher sementes… lista as sementes e os
  conectores GND/VSS/ground da PCB, um por net; cada caixa marca na hora, com desfazer; Preencher com terra.
- **Editor de peças** (grupo F): desfazer e refazer (botões e Ctrl+Z/Ctrl+Y, 100 passos, por instantâneos do
  `PartDraft`); Cancelar pergunta com alterações; peça sua é regravada no mesmo `moduleId` (`Library.forget`) e há
  Gravar como nova; Definir todos como macho, fêmea ou pad; passante ou SMD; conexões internas (`<bus>`); PNG e JPG
  como desenho da vista; o ícone reaproveita a imagem de outra vista; Só nesta vista; Baixar o SVG da vista; barra
  da vista com zoom, grade de 0,1 in, cor de fundo e camadas. O F-202 (conversor de esquemáticos anteriores ao 0.8.6)
  ficou "não se aplica", com o motivo na matriz.
- Testes: `e2e/fritzing.spec.ts` (14 fluxos), `e2e/parts.spec.ts` (fluxo do editor), `tests/partdraft.test.ts`.

### Bugs achados e corrigidos (fase 3, continuação)

5. **Pôr uma peça durante a primeira indexação esperava o acervo inteiro** (os vermelhos intermitentes de `app.place`
   no Firefox): o `locate` só respondia com o índice pronto, e as 16 leituras simultâneas do indexador ocupavam as 6
   conexões por host do navegador, deixando o `.fzp` e o SVG da peça na fila. O indexador responde o `locate` com o
   que já leu e lê 4 arquivos por vez, deixando conexões livres.
6. **Downloads dos E2E se sobrescreviam**: em paralelo, dois testes salvavam `sem título.fzz` na mesma pasta; agora
   cada teste tem a sua.
7. **O campo Cor de fundo usava a classe `.swatch`** da bolinha das faces (8 px); virou `.in.paint`.
8. **Desfazer do editor**: o instantâneo era tirado dentro do atualizador do estado, depois da mudança.

### Feito (2026-10-22, noite)

- **Peças geradas** (grupo G): `core/Parametric` porta os geradores do SIP, da mystery part (uma ou duas fileiras) e do
  borne com parafuso (`dip.cpp`, `mysterypart.cpp`, `screwterminal.cpp`, `incrementTemplateString` e os templates);
  o símbolo de CI do esquemático virou `schematicChip` (pinos à esquerda e à direita, o ? da mystery part). O inspetor
  muda pinos, espaçamento, fileiras e o tamanho da perfboard e da stripboard (`getParametric`), trocando pela peça
  gerada e mantendo os fios. Na stripboard as tiras aparecem e um clique entre dois furos corta ou religa o trecho
  (`buses`). Logos de imagem e a placa de forma livre carregam SVG, PNG ou JPG (PNG/JPG na PCB vetorizados em preto e
  branco, como o `LogoItem`); `BoardLogoImageModuleID` passou a ser placa, com o contorno tirado da imagem.
- F-014 (PDF vetorial da vista) foi para a fase 13, com a plotagem por camada em PDF: os dois precisam do mesmo
  conversor de SVG para PDF. O PDF de hoje leva a vista rasterizada a 300 dpi.

### Bugs achados e corrigidos (fase 3, noite)

9. **Pôr uma peça durante a indexação esperava o índice inteiro** (o resto da causa do item 5): o `locate` que chegava
   antes da leitura da peça só voltava com o índice pronto. Agora espera só a peça aparecer na leitura (medido: a
   peça entra em 2,3 s com o índice em 800/2619, antes em 4,4 s, no fim).
10. **"N peças indexadas" apagava a mensagem da ação do usuário** que chegava antes; o aviso do índice só aparece
    com a barra vazia.
11. **Reverter e recarregar oferecia recuperar o que foi descartado**: a versão automática do sketch limpo esperava
    1,5 s, e o `pagehide` da recarga não gravava (a página sai ainda "visível"). Agora o sketch que acaba de ficar
    salvo grava na hora e o `pagehide` sempre grava.
12. **Trocar de idioma deixava a mensagem da barra na língua anterior.**
13. **E2E**: cada contexto de teste indexava as 2.619 peças do zero, com 4 navegadores ao mesmo tempo; sob essa carga
    o Firefox passava de 60 s e virava intermitência. O `globalSetup` (`e2e/Fixtures/setup.ts`) indexa uma vez por
    navegador e entrega o IndexedDB pronto a cada contexto, como o de quem volta ao app; o caminho frio segue no
    `perf` e em "Refazer o índice". A rodada caiu de 7,8 para 4 minutos.

14. **JS inicial em 733 KB, acima dos 710**: a cola do Clipper2 passou a carregar na primeira operação de PCB,
    `core/Parametric` só quando uma peça gerada dessas aparece (`setParametric`), e as abas Roteamento e Documento e o
    painel Projeto viram chunks. Ficou em 709,7 KiB: o orçamento está cumprido sem folga, e a próxima função grande
    precisa entrar sob demanda.

15. **O índice só ficava pronto depois de ler os 28 bins, e todo pedido esperava também a gravação do cache**: sob
    carga, no Firefox, a busca e as abas ficavam presas em "indexando 2600/2619". Agora o índice fica pronto ao fim da
    leitura das peças; o cache grava em paralelo e os bins (com as peças geradas que só eles citam) chegam numa segunda
    leva (`readBins`).

### Fechamento da fase 3

Matriz: Fritzing 209 feitas de 251 (17 "falta", todas de outras fases: 15 da aba Código na 14, subpartes na 8 e o PDF
vetorial na 13; 25 "não se aplica"); KiCad esquemático, comuns e projeto 121 de 404; PCB 30 de 421. Nenhuma linha da
fase 3 em "falta".

## Fase 4 — base KiCad

### Feito (2026-10-22)

- **Acervo em `/kicad`** (`tools/KiCad`, `KICAD_ROOT`): símbolos, footprints, modelos 3D, modelos de projeto e demos,
  com as listagens JSON, no `dev` e no `preview`. O plugin do Vite virou um só (`dataServer`) para o Fritzing e o
  KiCad.
- **`core/Sexpr`**: leitor sem recursão (átomos crus, texto mal formado volta nulo) e gravador com o `Prettify`
  portado do KiCad. Os 22.905 símbolos, os 15.464 footprints e os 164 arquivos dos demos voltam com a mesma árvore;
  tudo o que o KiCad 10 gravou volta igual byte a byte (os outros são de geradores antigos e voltam no formato do
  KiCad 10, como o próprio KiCad faria).
- **Oráculo `kicad-cli`**: o SVG de três bibliotecas de footprints e de um símbolo regravados é o mesmo do original;
  o DRC e o ERC do demo `royalblue54L_feather` regravado acham as mesmas violações.
- Spec `docs/specs/07-KICAD-FILES-SPEC.md`. Testes: `tests/sexpr.test.ts`, `e2e/kicad.spec.ts`.

### Bugs achados e corrigidos

1. **O formatador esgotava a memória na placa de 85 MB**: concatenar caractere a caractere cria dezenas de milhões
   de nós de string; agora copia cada átomo inteiro e junta as partes no fim.
2. **Escrita em linha recursiva** estourava a pilha com aninhamento fundo; virou iterativa.


### Retomada (2026-10-22, 23h30, o PC desligou com a bateria abaixo de 25%, a pedido do usuário)

- Fase 3: commit `515e8a3`, com `npm run verify` verde na pasta e no clone limpo (`build/clean`: Vitest 153 + 2
  pulados, E2E 218, desempenho com JS inicial de 710 KB de 710).
- **O `npm run soak` reprovou (resolvido em 2026-10-23)**: o crescimento era linear porque cada volta abre um sketch novo, um circuito de teste e um exemplo, e desde as abas da fase 2 cada um fica numa aba que o teste nunca fechava; em 563 voltas sobravam centenas de abas abertas. A volta passou a fechar as abas da anterior, que é o uso real e o que o teste quer medir (se a memória das abas fechadas volta). Antes: — a memória cresceu 97 MB em 563 voltas (limite 30 MB;
  `build/soak-report.txt`). A primeira rodada caiu porque o `vite.config.ts` foi editado no meio; esta foi limpa, mas
  rodou na bateria. Próximo passo: rodar de novo na tomada e, se crescer, achar o vazamento (candidatos novos desta
  fase: o `early`/`waiting` do indexador, as variantes de stripboard e logo no `Library.variants`, que nunca são
  apagadas, e os instantâneos do editor de peças).
- Fase 4: commit `34fd68b` (2026-10-23), com o `verify` verde. Fora dele, ainda sem commit: `core/KicadSymbol` (leitura
  e desenho de símbolos do KiCad, com `extends`, unidades e De Morgan) e `tests/kicad.test.ts` (7 testes contra o
  `sym export svg`), começo da fase 5.

## Pedidos do usuário (2026-10-23) — antes de seguir a fase 5

Bugs (regressões, primeiro):

1. **A simulação parou de funcionar.**
2. **A fonte mostra "bolinhas" durante a simulação**, do nada.
3. **Ao arrastar um item, aparece uma pergunta para salvar** (o usuário chamou de "parte de tutorial") que interrompe o
   trabalho: tirar.
4. A simulação tem de estar certa (conferir contra o ngspice nativo e os circuitos clássicos).

Decisões novas do usuário (substituem a decisão 3 da seção 5 do plano no que conflitam):

5. **O tipo de excitação fica na própria fonte de tensão**: clicar na fonte escolhe contínuo (padrão), degrau, rampa,
   senoide etc. Sai do painel do gráfico.
6. **O painel do gráfico fica o mais limpo possível**: o gráfico, no topo a lista das pontas que o usuário colocou
   (tensão e corrente dos componentes que ele escolheu e puxou), só elas, com filtro, e o tempo de simulação.
7. **Uma aba de circuitos prontos para testar**, de esquemático, de protoboard e de PCB: LED com resistor, RC, RLC,
   filtro passa-baixa…, didáticos; ao simular, a forma de onda aparece certa (subida, sobressinal).

### Plano para os pedidos de 2026-10-23

- **Sinal na fonte** (pedido 5): a fonte de tensão ganha no inspetor o controle "Sinal": Contínuo (padrão), Degrau,
  Rampa, Senoide e Onda quadrada, com os parâmetros de cada um ali mesmo (amplitude, frequência, tempo da rampa…),
  gravados como propriedade da instância (`circuitmaster_signal` e afins; o Fritzing ignora). O deck SPICE troca o
  `DC v` da fonte por `PWL`, `SIN` ou `PULSE`; Degrau parte do circuito descarregado (UIC). O seletor global de teste
  sai; a janela automática passa a vir das fontes e da escala de tempo do circuito; o tempo de simulação continua
  digitável no painel. Os circuitos de teste passam a usar o sinal da fonte em vez do teste global.
- **Painel limpo** (pedido 6): no topo, as pontas que o usuário pôs (V, A, V·A), uma pílula por curva que liga e
  desliga, e o tempo de simulação; embaixo, o gráfico com cursor. Saem as curvas automáticas (tensão de cada nó,
  corrente de cada fonte) e a coluna de medidas, que vai para o cartão da ponta no inspetor (clicar na ponta mostra
  valor no cursor, média, RMS, subida, τ, sobressinal…). Opções raras (animação, SPICE) vão para a aba Documento.
- **Circuitos prontos** (pedido 7): item "Prontos" no trilho, com cartões didáticos (LED com resistor, RC, RLC,
  passa-baixa, amplificador, transistor, chave…), cada um com Esquemático, Protoboard e PCB (a PCB abre com a placa
  criada e roteada); ao abrir, já simula com as pontas certas.
- **Fumaça da fonte** (pedido 2): a fonte só "queima" se o curto continuar no regime; o pico de corrente de um
  capacitor descarregado no primeiro instante do degrau não conta.
- **Pergunta ao arrastar** (pedido 3): não reproduzida. Blindar: soltar fora do quadro não deixa o navegador abrir a
  imagem arrastada (o que recarregaria o app e abriria "Recuperar trabalho não salvo"), e a imagem da peça no bin não
  é arrastável sozinha. Confirmar com o usuário qual janela era.
- **Simulação parou** (pedido 1): o LED com resistor montado à mão e os circuitos de teste simulam certo aqui
  (12,6 mA no LED de 220 Ω). Confirmar com o usuário o circuito e o navegador.

### Feito (2026-10-23)

- **Sinal na fonte de tensão** (pedido 5): a fonte DC, as baterias e a fonte de bancada ganham no inspetor o
  controle **Sinal** (Contínuo, Degrau, Rampa, Senoide, Onda quadrada), com a frequência ou a duração da rampa ali
  mesmo (vazias = automáticas pela escala de tempo do circuito: senoide na frequência de corte, quadrada de período
  10τ, rampa de 5τ), gravado na instância (`circuitmaster_signal`, `circuitmaster_frequency`, `circuitmaster_ramp`;
  o Fritzing ignora). O deck troca a tensão da linha `V… {voltage}` por `PWL`, `SIN` ou `PULSE` partindo de 0, então
  o Degrau sai do circuito em repouso sem UIC e as outras fontes seguem em regime. Saíram o seletor "Teste" do
  painel, o submenu Simulação › Teste, `circuitmaster_preset` e o `setTest`; a janela é automática (escala do circuito
  e sinais, até acomodar depois do fim da rampa) ou manual (digitar o fim; botão Automático volta). Trocar o sinal
  recomeça o transitório em vez de continuar do passo corrente. Spec 04 §5.1, §5.3, §5.5, §9, README, spec 05.
- **Circuitos de teste com o sinal na própria fonte** (plano do pedido 7): novos "LED com resistor" (regime, ≈ 13 mA)
  e "Filtro passa-baixa (RC)" (senoide automática na fc: 71% e −45°); RC e RLC por Degrau na fonte, carga e descarga
  por Onda quadrada de 1 Hz na fonte (a fonte de pulso saiu do circuito de teste).

- **Painel de simulação limpo** (pedido 6): no cabeçalho o tempo de simulação e a reprodução; no topo só as pontas
  que o usuário pôs, uma pílula por curva (mostra ou esconde) com filtro; embaixo o gráfico. Saíram as curvas
  automáticas (tensão de cada nó, corrente de cada fonte, canais dos instrumentos), a coluna de medidas (foi para o
  cartão da ponta no inspetor, com média, RMS, pico a pico, τ, sobressinal, ganho e fase) e o "⋯" (animação, valores
  sobre o circuito, janela manual e SPICE foram para a aba Documento, que carrega sob demanda: o JS inicial voltou a
  708 KB). O estímulo e a resposta de uma curva viraram métodos da `Simulation` (`getStimulus`, `getResponse`).

- **Aba Prontos** (pedido 7): item no trilho (ícone de frasco, também em Exibir › Painéis da paleta) com um cartão
  por circuito de teste (título, o que observar) e os botões Protoboard, Esquemático e PCB; cada um abre numa aba
  nova naquela vista, simulando com as pontas; a PCB abre com a placa criada e roteada (`openBench(id, view)` chama o
  `makeBoard`). Teste: `e2e/simulation.spec.ts` "Prontos".

### Bugs achados e corrigidos (2026-10-23)

1. **Fonte de bancada com carga só capacitiva não simulava** (provável "a simulação parou", pedido 1): com corrente
   zero em regime as duas fontes B do `ilimit` ficavam no empate do `max`, cuja derivada no ngspice é a do segundo
   argumento (`inpptree.c`): `max(x/r, 0)` dava condutância zero e a saída ficava solta. O ngspice acusava "Transient
   op failed, timestep too small" (R 220 Ω + C) ou deixava a saída em 0 V no degrau (1 kΩ + 100 µF). Agora
   `max(0, x/r)`. Teste: `tests/spice.test.ts` "fonte de bancada com carga RC" (falha sem a correção).
2. **Fumaça ("bolinhas") na fonte no começo da simulação** (pedido 2): a regra do Fritzing queimava a fonte em
   qualquer passo com $|I| > 0{,}1\cdot V/R_{int}$, e o pico de carga de um capacitor descarregado ligado direto na
   fonte (o antigo teste Degrau com UIC, ou o Degrau novo) passa de 5 A por alguns passos. Agora a fonte só queima se
   a sobrecarga também aparece na segunda metade da janela (`Simulation.isLasting`): o curto real (LED sem resistor)
   e a sobrecarga de cada ciclo de uma senoide continuam queimando. Teste: `tests/bench.test.ts` (RC sem fumaça) e o
   E2E de cada circuito de teste (nenhuma fumaça). Não reproduzi o circuito exato do usuário: confirmar.
3. **Soltar algo fora do quadro** deixava o navegador abrir o que foi arrastado: `dragover`/`drop` na janela evitam
   (`ui/App`).

### Pendências dos pedidos de 2026-10-23

- Pedido 3 (pergunta de salvar ao arrastar): o app não tem `beforeunload`; "Fechar … sem salvar?" só sai ao fechar
  uma aba de sketch. A hipótese mais forte é o servidor de desenvolvimento recarregando a página a cada arquivo que eu
  editava enquanto o usuário testava (a recarga traz "Recuperar trabalho não salvo"), o que também explicaria a
  simulação quebrada no meio das edições. Confirmar com o usuário qual janela era.
- A janela automática não enxerga a fonte de bancada: o `ilimit` fica aberto para a escala de tempo, e um RC nela cai
  na janela de 10 s.

## Fase 5 — bibliotecas do KiCad como peças

Spec `docs/specs/08-KICAD-PARTS-SPEC.md`. São 103 linhas da matriz (editor de símbolos e de footprints, navegadores
e gerenciadores de bibliotecas, assistente e verificadores); vai em commits parciais.

### Feito (2026-10-23)

- **Footprint** (`core/KicadFootprint`): pads (passante, SMD, oval, `roundrect`, girado, furo deslocado e oblongo,
  sem metal) e `fp_*`; PCB no padrão do Fritzing (os passantes nos dois cobres pelo `copper0` dentro do `copper1`, o
  furo pelo anel que o CAM lê) e protoboard pelo F.Fab. Oráculo: pads e furos de 9 footprints iguais ao `kicad-cli fp
  export svg`.
- **Peça de três vistas** (`core/KicadPart`): `kicad:<Biblioteca>:<Símbolo>[@<Lib>:<Footprint>]`; footprint
  escolhido, do campo ou o padrão passante que casa com o `ki_fp_filters` dos genéricos; pacote montado pela
  `Library` por import dinâmico (JS inicial intacto) e gravado no `.fzz`. Geometria comum em `core/KicadDraw`.
- **Busca unificada**: o servidor monta `symbols-index.json` (0,3 s) e o indexador acha os símbolos depois das peças
  do Fritzing (até 100, busca simples para caber nos 50 ms).
- Teste: `tests/kicad.test.ts` (21), `e2e/kicad.spec.ts` "Busca unificada" (busca, põe, três vistas, `.fzz`).

### Decisão do usuário (2026-10-23): um produto só

"Não é para ficar dividindo em KiCad e Fritzing: é CircuitMaster, independente dos dois mas compatível com os dois,
como um concorrente." Saíram o rótulo "KiCad · Timer" dos resultados, o campo "Símbolo do KiCad" do inspetor, a
mensagem "nas bibliotecas do KiCad", o autor "KiCad" da peça gerada e o prefixo `kicad:` do identificador (agora `cm:`, que o rodapé do inspetor mostra); a aba "KiCad" planejada para o painel virou a
aba **Catálogo**, com todas as peças em categorias próprias (`core/Category`) e famílias que juntam as duas origens;
a busca passou a ter uma ordenação só. Fritzing e KiCad ficam onde o assunto é arquivo e nos créditos (Ajuda › Sobre,
que ganhou a linha das bibliotecas). Spec 08 §5–§6. Testes: `tests/category.test.ts`, `e2e/kicad.spec.ts` (nenhum
"KiCad"/"Fritzing" no painel de peças; o 555 do acervo e o NE555P na mesma família).

- O painel desenha 60 resultados da busca por vez, com "Mostrar mais (N)" no fim: desenhar até 300 a cada tecla pesava
  na primeira busca. O valor rápido do quadro e o ícone dos símbolos carregam sob demanda (`ui/SymbolIcon`): JS inicial
  em 705,7 KB com o catálogo novo. Um módulo sob demanda que importa de volta um módulo do JS inicial (o `Library`, o
  `Canvas`) faz o build partir esse módulo em arquivo à parte e o inicial cresce: passar o que precisa por propriedade.

- **Toda peça das bibliotecas entra na protoboard** (seção 12 do plano): a de footprint passante na grade de 0,1 in
  pelo próprio desenho (com o furo como conector, já que o cobre pode estar deslocado do furo), as outras numa placa
  adaptadora gerada (pinos a 0,1 in em duas fileiras, como um DIP, e o nome no meio). Dos 22.905 símbolos, 2.924 pelo
  footprint e 19.815 pelo adaptador, todo pino na grade; 166 (alimentação, sem pinos) só no esquemático. Teste:
  `tests/kicad.test.ts` (todos os símbolos) e `e2e/kicad.spec.ts` (o resistor que vira SMD ganha a placa).

### Pedido do usuário (2026-10-23): tela limpa e minimalista

"A tela tem que ficar limpa e minimalista, não pode ficar cheia de coisa igual a esses aplicativos de IA genéricos;
intuitivo e didático; robusto e compatível, mas com bom senso, posicionando as coisas de forma inteligente." O painel
de peças passou de Core, Simulador, Catálogo, Meus itens e um "+" que abria bins em abas extras (a terceira aba já
aparecia cortada) para três abas: Básicos (as sugeridas e as comuns em "Mais peças"), Catálogo (as categorias e, em
"Coleções", os bins de fabricante e o do simulador) e Meus itens. F-176 (fechar bin) virou "não se aplica". Regra no
`CLAUDE.md` e na memória: nada novo na tela sem tirar outra coisa ou ir para onde o usuário já olha.

### Bugs achados e corrigidos (fase 5)

1. **As boas-vindas engoliam o clique de quem escolheu uma peça** no sketch vazio: o cartão cobre o centro do quadro.
   Agora some enquanto há peça escolhida para pôr (`ui/Welcome`). Teste: `e2e/kicad.spec.ts` (põe no centro do
   quadro vazio).
2. **A primeira busca depois de abrir não via os símbolos do KiCad**: ela rodava antes de o resumo chegar e não
   voltava a rodar. A busca espera o resumo (`workers/Indexer`).

- **Peças básicas do KiCad simulam** (resistor, capacitores, indutor, LED e diodo da `Device`) pela equivalente do
  Fritzing (`KICAD_EQUIVALENTS`): propriedades editáveis, família dos efeitos e o mesmo `<spice>`, com os pinos pelo
  número do KiCad. Teste: `tests/kicad.test.ts` (LED aceso com resistor do KiCad; eletrolítico carrega com τ = RC).
- **Trocar o footprint no inspetor** (KP-146): os footprints que casam com os filtros do símbolo; a troca mantém os
  fios. Teste: `e2e/kicad.spec.ts`.
- **Abrir `.kicad_sym` e `.kicad_mod`** (KS-205, KP-292): pelo mesmo Arquivo › Abrir do `.fzpz`, sem botão novo; as
  peças vão para Meus itens. Cada símbolo com pinos de uma biblioteca vira peça (o derivado com o pai do mesmo
  arquivo); um footprint avulso ganha um símbolo gerado, um pino por pad. Teste: `tests/kicad.test.ts` e
  `e2e/kicad.spec.ts`, que achou o caso do derivado aberto sozinho (o `NE555P.kicad_sym` de uma `.kicad_symdir` sem o
  `NE555D`): fica fora, como no KiCad, e o arquivo sem símbolos com pinos dá a causa.
- **As peças das bibliotecas simulam pelos campos `Sim.*`** (`core/KicadSim`, porte do `eeschema/sim`): transistores
  (173 de `Transistor_BJT` herdam o modelo do pai), diodos (126 de `Diode`), JFET, MOSFET, chave, fontes SIN/PULSE/EXP/AM/SFFM/PWL e
  os amp-ops e o varistor de `Simulation_SPICE.sp`; sem os campos, R/C/L/fonte de 2 pinos pelo `Value`, como o KiCad.
  Potenciômetros, bateria, pilha e `VDC` ganham a equivalente do acervo (botão e tensão no inspetor). O que não roda no
  ngspice do navegador (XSPICE, IBIS, biblioteca de fora) fica sem simular, sem derrubar o circuito. Teste:
  `tests/kicad.test.ts` (BC547 como chave acende o LED; seguidor com amp-op; bateria e potenciômetro).

3. **A busca do KiCad pesava na primeira busca depois de abrir** (achado pelo `perf`: 54 a 82 ms contra 50): o
   resumo de 3,4 MB era montado de uma vez no worker. Agora começa 1,5 s depois do acervo pronto, em lotes, a busca
   não o espera e o painel refaz a busca quando os símbolos chegam. A primeira busca segue em 43 a 49 ms com a
   máquina carregada (jogo e emulador abertos), contra 17 a 34 ms na fase 3: medir de novo com a máquina livre.
4. **JS inicial em 712 KB**: o campo de footprint e as medidas da ponta carregam sob demanda (`ui/FootprintField`,
   `ui/Measures`) e a `Library` passa a equivalente do Fritzing ao `KicadPart` (o import de `core/Properties` por ele
   partia o módulo num arquivo próprio): 708,6 KB.
5. **Teste de desempenho: o campo de busca não limpava às vezes**: a medida escreve pelo setter nativo e limpava com o
   `fill('')` do Playwright, que o React pode não ver; com o painel re-renderizando (os símbolos chegando), o texto
   antigo voltava. Agora limpa pelo mesmo setter (`e2e/perf.spec.ts`).

### Próximo

- Amp-ops das bibliotecas sem `Sim.*` já simulam pelos macro-modelos (pinos `+`, `-`, `V+`, `V-`). Falta o NE555 pelo
  `UA555` do acervo (plano em `../CONTINUAR.md`) e os MOSFETs de `Transistor_FET`, que não trazem os campos.
- Navegadores de bibliotecas de símbolos e de footprints (KC-072, KC-077) com prévia; editor de peças lendo e gravando
  `.kicad_sym` e `.kicad_mod`; verificadores de símbolo e de footprint.
- Pads `trapezoid` e `custom`, furo oblongo no CAM, SMD na face de baixo, pads repetidos do mesmo número.

