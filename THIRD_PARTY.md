# Dados redistribuídos

O pacote `data/` (`npm run data`) e o subconjunto `tests/fixtures` redistribuem, sem modificação, arquivos de:

- **fritzing-parts** e **fritzing-app** (sketches, peças e fontes): © Fritzing GmbH e colaboradores do Fritzing,
  CC-BY-SA 3.0 (`fritzing/parts/LICENSE.txt`, `fritzing/LICENSE.CC-BY-SA`). As fontes mantêm as próprias licenças:
  Droid Sans, Apache 2.0 (`NOTICE`); Noto Sans, OFL 1.1 (`OFL.txt`); Segment16, CC0 (`Segment16.txt`).
- **kicad-symbols** e **kicad-footprints**: © KiCad Library Team, CC-BY-SA 4.0 com a exceção para projetos
  (`kicad/*/LICENSE.md`).

Esses arquivos continuam sob as licenças de origem, que vão junto deles. O commit de origem de cada um está em
`data/VERSION.json`. Ao abrir um símbolo e um footprint do KiCad, o app monta uma peça de três vistas a partir deles
(adaptação, spec 08). Essa peça segue a CC-BY-SA 4.0 quando é redistribuída como biblioteca. Usada num projeto, vale
a exceção.

# Código portado

Código do Fritzing (`../Fritzing/fritzing-app`) e do KiCad (`../KiCad/kicad`), ambos GPL-3.0-or-later, traduzido ou
adaptado para o CircuitMaster. Cada linha mantém os detentores do copyright do arquivo de origem e a data da
adaptação; o módulo de destino traz a origem na primeira linha.

| Origem | Destino | Copyright | Adaptado em |
|---|---|---|---|
| `fritzing-app/src/items/dip.cpp`, `mysterypart.cpp`, `screwterminal.cpp`; `src/utils/textutils.cpp` (`incrementTemplateString`); `resources/templates/generic_sip_bread_template.txt`, `screw_terminal_bread_template.txt` | `src/core/Parametric` | Fritzing GmbH e colaboradores do Fritzing | 2026-10-22 |
| `kicad/common/io/kicad/kicad_io_utils.cpp` (`KICAD_FORMAT::Prettify`) | `src/core/Sexpr` | The KiCad Developers | 2026-10-22 |
| `kicad/eeschema/sim/sim_model.cpp` (`InferSimModel`, `createPins`, tabelas de dispositivos e tipos), `spice_generator.cpp`, `sim_model_source.cpp`, `sim_model_switch.cpp` | `src/core/KicadSim` | The KiCad Developers | 2026-10-23 |

Comportamentos conferidos no código do Fritzing e reescritos sem
transcrever (citados no comentário ou na spec): placa nova sticky (`applyBoardCreationDefaults`, `engine/Edit`), cadeia do
fio ao apagar o ratsnest (`collectChained`, `engine/Edit`) e `variant N` da peça sem `variant` no editor
(`pemainwindow.cpp`, `core/PartDraft`).

Na fase 3, do mesmo modo: as cores dos fios pelo comprimento (`lengthColorTrans` e `colorForLength` do `wire.cpp`,
`engine/Drawing`); a ordem das camadas da PCB vista de baixo (`PCBViewFromBelowLayerList` do `viewlayer.cpp`,
`ui/Canvas`) e a exportação espelhada (`transformPainter` do `mainwindow_export.cpp`, `ui/Output`); a faixa do tamanho
de grade (`setGridSize` do `mainwindow_menu.cpp`, `ui/Store`); a face de cobre clicável e as teclas Shift+Ctrl+1…3
(`setLayerActive` e `activeLayer*` do `mainwindow_menu.cpp`, `ui/Canvas` e `ui/Keys`); o realce das conexões por
rotear (`showUnrouted` do `sketchwidget.cpp`, `ui/Store`); as larguras de trilha e a faixa digitável (`Wire::widths`
do `wire.cpp` e `TraceWire` do `tracewire.cpp`, `ui/Inspector`); e o menu do rótulo da peça, com a tabela de giros e
espelhos, os tamanhos de fonte por vista e o giro em torno do centro (`partlabelcontextmenu.cpp`, `partlabel.cpp`,
`getLabelFontSize*` do `infographicsview.cpp` e do `pcbsketchwidget.cpp`; `ui/Menus` e `engine/Edit`).
