# HANDOFF — CircuitMaster

Projeto: `/home/jean/Documents/shared/circuit-proj/CircuitMaster`, branch `main` (igual a `origin/main` em e8d85a2, sem commit novo).
`gh` não está instalado; nenhum PR.

## Objetivo
Somar ao HEAD o trabalho de PCB que estava em `stash@{0}` (intercâmbio Altium/KiCad/EAGLE, visualizador de Gerber,
face de baixo, realce de net, régua, área de cobre, empurrar trilhas, DRC com mínimos e classes de net) sem perder
nada do HEAD, e manter o orçamento de JavaScript inicial (710 KB) do `e2e/perf.spec.ts`.

## Feito (tudo no índice, sem commit)
- Stash aplicado; 20 conflitos resolvidos somando os dois lados. Spec do stash renumerada para
  `docs/specs/09-PCB-INTERCHANGE-SPEC.md`; `00-MATRIZ.md`, `05-INTERFACE-SPEC.md`, README e CLAUDE.md atualizados.
- Convenções do HEAD aplicadas ao stash: atalhos em `src/ui/Keys`, menus em `ui/Modes`/`ui/Palette`, textos por `t()` com
  inglês em `src/core/Text/en.ts`, camadas fab/courtyard em `src/ui/Layers`.
- `core/Kicad` usa `core/Sexpr` (leitura e Prettify). Leitores de placa, Gerber e empurrar (`src/engine/Shove`) carregam sob demanda.
- xmldom fora do JS inicial: registrado por `src/core/Xml/xmldom.ts` no `setup` do Store, nos workers Indexer/Pcb/Saver,
  no setup do vitest e em `tests/Fixtures`; grupo `xmldom` em `vite.config.ts`. JS inicial: 638 KB.
- Testes novos: E2E de edição da PCB e intercâmbio em `e2e/pcb.spec.ts`; fixture ignora o aviso de módulo abortado do Firefox na navegação.
- Verificado: `tsc` ok; E2E 236/236 (Chromium e Firefox); `perf` ok (pan às vezes 51 ms > 50, também no HEAD).

## Não feito
- `vitest`: 6 falhas em `tests/kicad.test.ts` e `tests/sexpr.test.ts`, que passaram a rodar com o `../KiCad` novo.
  As mesmas 6 falham no HEAD puro, então não vêm do merge. Suspeita não confirmada: a pasta tem `kicad-symbols`/`kicad-footprints`
  e `tools/KiCad` espera `symbols`/`footprints`.
- Nada commitado.

## Próximos passos
1. Investigar as 6 falhas: `npx vitest run tests/sexpr.test.ts tests/kicad.test.ts` e comparar `../KiCad` com as raízes de `tools/KiCad/index.ts`.
2. (needs user) Aprovar o commit do merge (`npm run verify` antes) e decidir quando descartar o `stash@{0}` (`git stash drop`).
3. (needs user) Abrir no Altium um `.PcbDoc` exportado (nunca conferido).
4. Melhorias marcadas com `ponytail:` (empurrar com várias passadas, Polygons6 do Altium, zona fraturada do KiCad).

## Para retomar
- `npm run dev` → http://localhost:5173/ ; `npm run verify` antes de commit; não editar `src/` durante E2E.
- Commit, push e descartar o stash só com aprovação do usuário.

## Não refazer
- `DOMParser` nativo no lugar do xmldom: no Chromium lê os SVG do acervo em quase o dobro do tempo (a busca foi a 80–95 ms),
  põe `xmlns=""` em elementos criados dentro de SVG, escreve no console do Firefox a cada texto que não é XML e devolve HTML de erro.
- `await import` no topo do `core/Xml`: atrasa o `onmessage` dos workers, a primeira mensagem se perde e o worker de PCB não responde.
- Coordenadas, unidades e camadas do HEAD ficaram no lugar do chip de coordenadas e do menu de camadas do stash (as do HEAD são mais completas).
- Tela limpa: "Empurrar trilhas" está no menu Roteamento (Shift+R), não no cabeçalho; classes de net aparecem a partir do modo Maker.
