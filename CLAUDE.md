# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Editor de circuitos no navegador (TypeScript, React 19, Zustand, Vite 8) que lê e grava os arquivos do Fritzing
1.0.8, com as três vistas sincronizadas, simulação ngspice, autorroteador, DRC, preenchimento de cobre e saídas de
fabricação. O comportamento da interface está descrito no `README.md`.

## Comandos

```bash
npm run dev                                  # compila os crates Rust para WASM e sobe o Vite
npm run check                                # só tsc --noEmit
npm test                                     # recompila o WASM e roda todo o Vitest
npm run build                                # WASM + tsc + build de produção em dist/
npm run wasm                                 # só os crates → src/core/Netlist/netlist.wasm e src/core/Router/router.wasm
npm run e2e                                  # Playwright no Chromium e no Firefox (playwright.config.ts, Vite na porta 5210)
npm run perf                                 # build + e2e/perf.spec.ts no vite preview (5211) → build/perf-report.txt
npm run verify                               # check + test + e2e + perf: verde antes de todo commit
npm run preview                              # serve o dist/ com o acervo em /fritzing
npx vitest run tests/spice.test.ts           # um arquivo, sem recompilar o Rust
npx vitest run tests/drc.test.ts -t 'nome'   # um teste pelo nome
npx playwright test --project=chromium e2e/edit.spec.ts -g 'nome'   # um E2E pelo nome
```

- Node 20, por isso o Vitest fica na 4 (a 5 exige Node 22). Rust com o alvo `wasm32-unknown-unknown`.
- `netlist.wasm` e `router.wasm` são gerados e ignorados pelo git: depois de mudar `crates/*/src/lib.rs`, rode
  `npm run wasm` antes de chamar o `vitest` direto.
- `ngspice.wasm` e `clipper2.wasm` são binários versionados, refeitos só por `tools/Ngspice/build.sh` e
  `tools/Clipper2/build.sh` (emsdk, cmake ≥ 3.20, bison). `build.sh native` e `build.sh xspice` geram em `build/`
  os ngspice nativos usados apenas pelos testes de comparação numérica.

## Acervo do Fritzing

App e testes leem o acervo em `../Fritzing` (ou `FRITZING_ROOT`): raízes `parts`, `app`, `sketches` e `fonts`
definidas em `tools/Fritzing/index.ts`. Não há backend: o plugin `fritzingParts` do `vite.config.ts` serve
`/fritzing/<raiz>/<caminho>` e as listagens `fzp.json`, `svg.json` e `sketches.json`, no `dev` e no
`npx vite preview`. O `dist/` servido por outro servidor fica sem peças.

## Testes

- Quase todo `describe` tem `skipIf(!HAS_FRITZING)`: sem o acervo os testes são pulados, não falham.
  `tests/Fixtures` monta a `Library` lendo do disco (`fileSource`) e carrega o `netlist.wasm` de `src/`.
- Vários testes percorrem todas as peças ou todos os sketches de exemplo (`testTimeout` de 10 min) e gravam
  relatórios em `build/` (`*-report.txt`, `build/gerber/<sketch>/`, `fill-*.svg`, `fonts.svg`); compare esses
  arquivos para ver o efeito de uma mudança em CAM, DRC, preenchimento ou roteador.
- Os testes contra o ngspice nativo (`tests/spice.test.ts`) só rodam se `build/ngspice-native` ou
  `build/ngspice-xspice` existirem (ou `NGSPICE`, `NGSPICE_XSPICE`).
- E2E em `e2e/`: o fixture `app` (`e2e/Fixtures`) abre o app, expõe o store em `window.cm` (importado de `/src`,
  por isso só no servidor de desenvolvimento) e reprova o teste com qualquer erro ou aviso de console, erro de
  página, requisição falha (menos as canceladas pela própria navegação) ou HTTP ≥ 400. Fotos das telas vão para
  `build/ui/`, downloads para `build/e2e/downloads/`. Não edite `src/`, `tsconfig.json` nem `vite.config.ts`
  durante uma rodada: o Vite recarrega as páginas e os testes em andamento quebram.
- `e2e/perf.spec.ts` roda no build de produção (`playwright.perf.config.ts`), monta uma grade sintética de 1.000
  peças com o próprio `core` e reprova se um orçamento da seção 8 do plano estourar.

## Arquitetura

Módulos em `src/<camada>/<Nome>/index.ts(x)`. `core` não depende de React nem do DOM e roda no Node dos testes;
`engine` monta cena, desenho, edição e simulação sobre o `core`; `ui` é o React; `workers` rodam fora da thread da
interface, cada um com um cliente em `ui/` (`Catalog`, `Simulator`, `Pcb`) sobre o `ui/Supervisor` comum: respostas
casadas pelo `id`, vigia de inatividade, erro ou morte do worker resolvem o pedido com nulo e a causa em `failure`, e
o pedido seguinte recria o worker. Do lado do worker, `workers/Serve` responde todo pedido com `result`, `progress`
ou `error` (spec 06 §2).

- **Documento imutável.** O circuito é um `Doc` (`core/Document`): instâncias por `modelIndex`, um único conjunto
  de arestas `"<modelIndex>/<connectorId>"` para as três vistas, pontas de prova e `revision`. `fromSketch` unifica
  as conexões que o `.fz` grava por vista e `exportSketch` (`core/Sketch`) as reparte de volta. As operações de
  `engine/Edit` são funções puras `(doc, library, view, …) → Doc`.
- **Store** (`ui/Store`, Zustand): `doc`, histórico `past`/`future`, vista, seleção, simulação e os clientes dos
  workers. Mudança com desfazer passa por `commit(doc, origin)`; arrasto em andamento usa `preview(doc)`, sem
  histórico. O `Netlist` só é refeito quando `doc.revision` ou `doc.edges` mudam, então toda alteração de
  topologia incrementa `revision` (como `addEdges`, `removeEdges`, `addInstance`, `removeInstance`, `swapPart`);
  geometria (`updateView`) não incrementa.
- **Netlist** (`core/Netlist` + `crates/netlist`): o TS monta as tabelas de conectores e arestas, o Rust faz o
  union-find e devolve `Uint32Array` por vista: `nets[view]` e `routed[view]`, indexados por `index.get(key)`.
  Ratsnest, cores de net, DRC, roteador e deck SPICE leem daí.
- **Library** (`core/Library`): carrega `.fzp` e SVG sob demanda de um `Source` — `ui/Catalog` (fetch em
  `/fritzing` e o worker `Indexer` para busca e bins) no navegador, `tests/Fixtures` no Node. Peças de pacotes e do
  editor de peças entram por `addBundle` e ficam no IndexedDB `circuitmaster-user` (`ui/Vault`); o localStorage
  guarda só o pequeno (tema, Meus itens, bins).
- **Desenho**: `Scene` (matriz de cada instância e terminal de cada conector numa vista) → `getDrawing` (lista de
  desenho: peças, fios, ratsnest, marcas, rótulos) → `ui/Canvas`, que desenha em SVG.
- **Simulação**: `core/Spice.buildCircuit` gera o deck pelas nets do esquemático → `ui/Simulator` → worker
  `workers/Simulator` (ngspice WASM síncrono; tempo-limite de 15 s recria o worker) → `engine/Simulation` lê os
  vetores por passo e produz os efeitos visuais. Mudar o circuito no meio do transitório continua do passo
  corrente (`resumeCircuit`, `getInitial`, `joinRuns`).
- **PCB**: `core/Cam.getArtwork` converte a placa em primitivas em mil; DRC (`core/Drc`), preenchimento
  (`core/Fill`) e roteador (`core/Router` + `crates/router`) usam o Clipper2 WASM e rodam no worker `workers/Pcb`.
  O roteador devolve um `Plan` que `applyPlan` aplica ao doc (também no esquemático, por `buildSheetGrid`). Gerber,
  Excellon, BOM, IPC-D-356A e PDF saem dos módulos de `core` por `ui/Export`.

- **Robustez** (spec 06): `ui/Boundary` envolve cada região da interface (falha mostra a causa e "Recarregar
  painel"); `core/Sketch.readFile` é a fronteira dos arquivos abertos (limites de zip-bomba); `ui/Autosave` grava o
  `.fzz` no IndexedDB 1,5 s depois de cada mudança e oferece recuperar sessões mortas (Web Locks distinguem abas
  vivas); `engine/History.describeChange` dá nome a cada passo do histórico de desfazer. Callback memorizado do
  `Canvas` não pode capturar o escopo do render (prende os desenhos antigos em cadeia): ponha-o num hook próprio ou
  leia o store com `getState()`.

## Especificação e licença

- `docs/specs/01–04` e `06` (formatos e peças; sincronização de vistas e netlist; PCB, DRC e Gerber; SPICE;
  robustez) são o que o código implementa; `00-MATRIZ.md` é o placar das funções do Fritzing e do KiCad. Os comentários citam a seção (`SPEC 04 §8.3`): leia a seção antes de mudar uma regra e
  mantenha a citação. Cada spec termina com o plano de testes que os `describe` seguem.
- O projeto é GPL-3.0-or-later, como o Fritzing (`../Fritzing/fritzing-app`) e o KiCad (`../KiCad/kicad`), e pode
  portar código dos dois. Módulo com código portado ou adaptado leva a origem na primeira linha
  (`// PORTADO DE kicad/pcbnew/router/pns_shove.cpp (GPL-3.0-or-later)`), mantém os avisos de copyright originais e
  entra no `THIRD_PARTY.md`. Peças, SVG, sketches, fontes e as bibliotecas do KiCad entram só como dados. O ngspice
  fica como módulo WASM separado.

## Interface

Estilo "data terminal": tokens dos dois temas em `src/ui/Theme/style.css` (cor nova vira token nos dois), cor só em
dados, seleção como linha de 1px em `--accent`, vão de 8px, monoespaçada só em números, sem gradiente nem sombra
decorativa, interface em pt-BR e em inglês. O guia de origem, `circuit-master-ui/DESIGN.md`, não está mais no disco.
Botão, menu ou painel sem funcionalidade real por trás sai da interface em vez de ficar desabilitado. Atalho de
teclado novo entra só na tabela `ui/Keys` (o teclado, os menus, a paleta, Ajuda › Atalhos e as Preferências leem
dela); item de menu avançado entra em `ui/Modes` com o modo a partir do qual aparece; ação nova do menu ganha os
termos em inglês do Fritzing e do KiCad no `ALIASES` de `ui/Palette`. Nome de classe CSS nosso não pode coincidir
com utilitário do Tailwind (a camada `utilities` passa por cima de `components`).

Todo texto visível passa por `t` de `core/Text`: a chave é o próprio texto em português (`t('{0} peças', n)`, nunca
template literal na chave), os rótulos de tabelas de módulo ficam em português e são mostrados por `t` no desenho, e
a tradução entra em `core/Text/en.ts` (só carregado quando o inglês é escolhido). `tests/text.test.ts` reprova chave
sem tradução e tradução sobrando; o E2E "Inglês" (`e2e/ui.spec.ts`) reprova texto em português na tela em inglês.
Cursor, coordenadas, enquadramento e o clique pelo teclado ficam em `ui/Navigation`, que recebe o estado como
parâmetro (importa do `ui/Store` só tipos, para `ui/Keys` seguir carregando no Node dos testes).
