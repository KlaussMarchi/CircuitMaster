# Código portado

Código do Fritzing (`../Fritzing/fritzing-app`) e do KiCad (`../KiCad/kicad`), ambos GPL-3.0-or-later, traduzido ou
adaptado para o CircuitMaster. Cada linha mantém os detentores do copyright do arquivo de origem e a data da
adaptação; o módulo de destino traz a origem na primeira linha.

| Origem | Destino | Copyright | Adaptado em |
|---|---|---|---|

Até a fase 0 nenhum módulo traz código portado. Comportamentos conferidos no código do Fritzing e reescritos sem
transcrever (citados no comentário ou na spec): placa nova sticky (`applyBoardCreationDefaults`, `engine/Edit`), cadeia do
fio ao apagar o ratsnest (`collectChained`, `engine/Edit`) e `variant N` da peça sem `variant` no editor
(`pemainwindow.cpp`, `core/PartDraft`).
