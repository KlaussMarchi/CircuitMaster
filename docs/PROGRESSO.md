# PROGRESSO

Memória do trabalho do plano `FRIZING_KICAD.md` (pasta acima do repositório). Ler ao começar; atualizar ao fim de
cada item.

**Fase atual: 1 — robustez** (seção no fim do arquivo).

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

- Na PCB, em zoom normal a via fica inteira sob a faixa de clique das trilhas que chegam nela. Fase 2 (auditoria de
  cliques).
- Abrir um arquivo ou exemplo troca o documento sem perguntar, mesmo com alterações não salvas. Fase 1.
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

### A seguir

1. Limite de erro por região (quadro, inspetor, painéis, doca) com "recarregar painel" e o documento intacto.
2. Supervisão comum dos workers (Indexer, Simulator, Pcb): tempo-limite, `onerror`, recriação e cancelamento.
3. `readBundle`: limite de tamanho descompactado e de número de arquivos (zip-bomba).
4. Peças do usuário do `localStorage` para o IndexedDB, migrando o que existe.
5. Autosave no IndexedDB (atraso curto e ao esconder a aba), últimas versões e recuperação ao abrir; abrir arquivo
   pergunta quando há alterações.
6. Histórico de desfazer (dock *Undo History* do Fritzing).
7. Cenários de robustez da seção 6 e fuzzing (`fast-check`) nos leitores e nas edições (aplicar e desfazer devolve
   o documento idêntico).
