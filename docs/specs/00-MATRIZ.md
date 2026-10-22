# 00 — MATRIZ DE FUNÇÕES

Placar do plano `FRIZING_KICAD.md`: cada função do Fritzing 1.0.8 e do KiCad 10.0.7 com origem, status, fase e o
teste que a cobre. Status: **feita** (existe e tem teste), **falta** (com "parcial: …" quando existe em parte) ou
**não se aplica** (com o motivo). Fase 0 marca o que os testes da fase 0 cobrem. Atualizada a cada item.

Montada na fase 0 a partir de três auditorias (menus e menus de contexto do Fritzing; `*_actions_reference.adoc` e
manuais do KiCad. Toda linha "feita" aponta para um arquivo de teste que existe (conferido ao fechar a fase 0).

## Resumo

| Parte | Linhas | feita | falta | não se aplica |
|---|---|---|---|---|
| Fritzing | 251 | 141 | 86 | 24 |
| KiCad esquemático, comuns e projeto | 404 | 117 | 274 | 13 |
| KiCad PCB, 3D, GerbView e calculadora | 421 | 27 | 392 | 2 |

## Fritzing

### Menus da barra

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| F-001 | Novo (New) | Fritzing › File › New | feita | 0 | e2e/circuit.spec.ts | Ctrl+N; abre numa aba nova e a anterior continua com o circuito (spec 05 §4); também na aba Documento |
| F-002 | Abrir… (Open...) | Fritzing › File › Open... | feita | 0 | tests/sketch.test.ts · e2e/circuit.spec.ts | Ctrl+O; .fzz e .fz; o mesmo seletor importa .fzpz/.fzb/.fzbz (F-174) |
| F-003 | Reverter (Revert) | Fritzing › File › Revert | falta | 3 | — | recarregar o arquivo aberto descartando as alterações |
| F-004 | Abrir recentes ▸ (Open Recent Files) | Fritzing › File › Open Recent Files ▸ | falta | 3 | — | no navegador: lista no IndexedDB com a cópia ou o handle de cada arquivo |
| F-005 | Abrir exemplo ▸ (Open Example) | Fritzing › File › Open Example ▸ (sketches/index.xml) | feita | 0 | tests/sketch.test.ts · e2e/samples.spec.ts | Arquivo › Exemplos em submenus por pasta; lista com busca na aba Documento |
| F-006 | Fechar janela (Close Window) | Fritzing › File › Close Window (fritzingwindow.cpp) | feita | 2 | e2e/ui.spec.ts | Arquivo › Fechar sketch e o × da aba; com alterações pergunta; o Ctrl+W fica com o navegador |
| F-007 | Salvar (Save) | Fritzing › File › Save | feita | 0 | tests/sketch.test.ts · e2e/circuit.spec.ts | Ctrl+S; baixa o .fzz com os arquivos das peças de pacote embutidos |
| F-008 | Salvar como… (Save As...) | Fritzing › File › Save As... | falta | 3 | — | parcial: Salvar baixa com o nome atual; falta pedir o nome (Shift+Ctrl+S) |
| F-009 | Compartilhar online… (Share online...) | Fritzing › File › Share online... | não se aplica | — | — | serviço online do Fritzing (FRIZING_KICAD §10) |
| F-010 | Encomendar placa… (Order a PCB...) | Fritzing › File › Order a PCB... | não se aplica | — | — | Fritzing Fab/Aisler; Exportar › Para produção já gera o pacote (FRIZING_KICAD §10) |
| F-011 | Exportar › Como imagem › PNG… (Export › as Image › PNG...) | Fritzing › File › Export › as Image › PNG... | feita | 0 | e2e/export.spec.ts | vista corrente a 300 dpi |
| F-012 | Exportar › Como imagem › JPG… (Export › as Image › JPG...) | Fritzing › File › Export › as Image › JPG... | feita | 0 | e2e/export.spec.ts | vista corrente a 300 dpi |
| F-013 | Exportar › Como imagem › SVG… (Export › as Image › SVG...) | Fritzing › File › Export › as Image › SVG... | feita | 0 | e2e/export.spec.ts | vista corrente com as imagens das peças embutidas |
| F-014 | Exportar › Como imagem › PDF… (Export › as Image › PDF...) | Fritzing › File › Export › as Image › PDF... | falta | 3 | — | parcial: o PDF leva a vista rasterizada em JPEG (300 dpi, ui/Export); o Fritzing grava vetorial |
| F-015 | Exportar › Para produção › Gravável (PDF)… (Etchable (PDF)...) | Fritzing › File › Export › for Production › Etchable (PDF)... | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts | exige placa; baixa ‹nome›_etch_pdf.zip |
| F-016 | Exportar › Para produção › Gravável (SVG)… (Etchable (SVG)...) | Fritzing › File › Export › for Production › Etchable (SVG)... | feita | 0 | e2e/export.spec.ts | exige placa; baixa ‹nome›_etch_svg.zip |
| F-017 | Exportar › Para produção › Gerber estendido (RS-274X)… (Extended Gerber (RS-274X)...) | Fritzing › File › Export › for Production › Extended Gerber (RS-274X)... | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts | exige placa; zip com as camadas, a furação Excellon e o pick-and-place .xy; com várias placas, a selecionada; o CircuitMaster também tem Pick-and-place… avulso |
| F-018 | Exportar › Lista de materiais… (List of parts (Bill of Materials)...) | Fritzing › File › Export › List of parts (Bill of Materials)... | feita | 0 | e2e/export.spec.ts | HTML |
| F-019 | Exportar › Lista de materiais em CSV (List of parts (Bill of Materials) as CSV) | Fritzing › File › Export › List of parts (Bill of Materials) as CSV | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts |  |
| F-020 | Exportar › Lista de materiais em PDF (Bill of Materials as PDF) | Fritzing › File › Export › Bill of Materials as PDF | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts |  |
| F-021 | Exportar › Netlist IPC-D-356A (IPC-D-356A netlist) | Fritzing › File › Export › IPC-D-356A netlist | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts | exige placa |
| F-022 | Exportar › Netlist XML… (XML Netlist...) | Fritzing › File › Export › XML Netlist... | feita | 0 | tests/cam.test.ts · e2e/export.spec.ts | netlist da vista corrente |
| F-023 | Exportar › Netlist SPICE… (SPICE Netlist...) | Fritzing › File › Export › SPICE Netlist... | feita | 0 | tests/spice.test.ts · e2e/export.spec.ts | .cir pelo mesmo gerador do deck da simulação |
| F-024 | Exportar › Eagle… (Eagle...) | Fritzing › File › Export › Eagle... (mainwindow_export.cpp) | não se aplica | — | — | a ação existe mas está comentada no menu do 1.0.8; o Eagle foi descontinuado e exportar para KiCad substitui (FRIZING_KICAD §10) |
| F-025 | Imprimir… (Print...) | Fritzing › File › Print... | falta | 3 | — | Ctrl+P, também no editor de peças; Page Setup está comentado no 1.0.8 e não aparece |
| F-026 | Abrir programa externo (Launch ‹programa›...) | Fritzing › File › Launch ‹programa›... | não se aplica | — | — | só aparece quando o Fritzing é iniciado com um programa externo na linha de comando; desktop |
| F-027 | Sair (Quit) | Fritzing › File › Quit | não se aplica | — | — | Ctrl+Q; desktop, no navegador fecha-se a aba |
| F-028 | Desfazer (Undo) | Fritzing › Edit › Undo | feita | 0 | e2e/edit.spec.ts | Ctrl+Z; também na barra do quadro |
| F-029 | Refazer (Redo) | Fritzing › Edit › Redo | feita | 0 | e2e/edit.spec.ts | Ctrl+Shift+Z e Ctrl+Y; também na barra do quadro |
| F-030 | Recortar (Cut) | Fritzing › Edit › Cut | feita | 0 | e2e/edit.spec.ts | Ctrl+X; área de transferência interna do app |
| F-031 | Copiar (Copy) | Fritzing › Edit › Copy | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Ctrl+C; também no menu de contexto |
| F-032 | Colar (Paste) | Fritzing › Edit › Paste | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Ctrl+V; a k-ésima colagem desloca (20+20k, −20+20k) px; índices e títulos novos |
| F-033 | Colar no lugar (Paste in Place) | Fritzing › Edit › Paste in Place | feita | 0 | e2e/edit.spec.ts | Ctrl+Shift+V; sem deslocamento |
| F-034 | Duplicar (Duplicate) | Fritzing › Edit › Duplicate | feita | 0 | e2e/edit.spec.ts | Ctrl+D; também no menu de contexto e na barra de seleção múltipla |
| F-035 | Apagar (Delete) | Fritzing › Edit › Delete | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Delete e Backspace; também no menu de contexto da peça e no do fio (Apagar fio, Delete Wire) |
| F-036 | Apagar sem fios (Delete Minus) | Fritzing › Edit › Delete Minus | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Alt+Backspace; também no menu de contexto |
| F-037 | Selecionar tudo (Select All) | Fritzing › Edit › Select All | feita | 0 | e2e/edit.spec.ts | Ctrl+A; só o que aparece na vista (`Scene.isShown`): na protoboard não entram placa, vias nem trilhas da PCB (bug da fase 0, corrigido com teste) |
| F-038 | Desmarcar (Deselect) | Fritzing › Edit › Deselect | feita | 0 | e2e/edit.spec.ts | Esc |
| F-039 | Adicionar nota (Add Note) | Fritzing › Edit › Add Note | feita | 0 | e2e/edit.spec.ts | nota no centro da vista visível, só nessa vista; duplo clique edita |
| F-040 | Preferências… (Preferences...) | Fritzing › Edit › Preferences... (Help no macOS) | falta | 3 | — | parcial (fase 2, e2e/ui.spec.ts · e2e/navigation.spec.ts): roda do mouse, fios curvos, modo, idioma, tema, unidades, cursor em cruz, grades e grade por tipo, teclas e manutenção (spec 05 §7); faltam cores de realce, Gerber com seis casas, estilo do rótulo de net e programas da aba Código |
| F-041 | Editar (editor de peças) (Edit (new parts editor)) | Fritzing › Part › Edit (new parts editor) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | também no menu de contexto; desabilitado para peça que não abre no editor |
| F-042 | Exportar peça… (Export...) | Fritzing › Part › Export... | falta | 3 | — | parcial: o editor de peças baixa um .fzpz, mas de uma peça nova (moduleId novo); falta exportar a peça selecionada como está |
| F-043 | Espelhar horizontal (Flip Horizontal) | Fritzing › Part › Flip Horizontal | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | atalho \|; no esquemático; também no menu de contexto do esquemático e na barra do quadro |
| F-044 | Espelhar vertical (Flip Vertical) | Fritzing › Part › Flip Vertical | feita | 0 | e2e/edit.spec.ts | no esquemático; também no menu de contexto do esquemático |
| F-045 | Girar ▸ 45° no sentido horário (Rotate 45° Clockwise) | Fritzing › Part › Rotate › Rotate 45° Clockwise | feita | 0 | e2e/edit.spec.ts | desabilitado só com breadboards; também no menu de contexto |
| F-046 | Girar ▸ 90° no sentido horário (Rotate 90° Clockwise) | Fritzing › Part › Rotate › Rotate 90° Clockwise | feita | 0 | tests/engine.test.ts · e2e/edit.spec.ts | atalho ]; também no menu de contexto e na barra do quadro |
| F-047 | Girar ▸ 180° (Rotate 180°) | Fritzing › Part › Rotate › Rotate 180° | feita | 0 | e2e/edit.spec.ts | também no menu de contexto |
| F-048 | Girar ▸ 90° no sentido anti-horário (Rotate 90° Counter Clockwise) | Fritzing › Part › Rotate › Rotate 90° Counter Clockwise | feita | 0 | e2e/edit.spec.ts | atalho [; também no menu de contexto |
| F-049 | Girar ▸ 45° no sentido anti-horário (Rotate 45° Counter Clockwise) | Fritzing › Part › Rotate › Rotate 45° Counter Clockwise | feita | 0 | e2e/edit.spec.ts | também no menu de contexto |
| F-050 | Elevar e rebaixar ▸ Trazer para frente (Bring to Front) | Fritzing › Part › Raise and Lower › Bring to Front | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Ctrl+Shift+]; também nos menus de contexto da peça e do fio |
| F-051 | Elevar e rebaixar ▸ Avançar (Bring Forward) | Fritzing › Part › Raise and Lower › Bring Forward | feita | 0 | e2e/edit.spec.ts | Ctrl+]; também nos menus de contexto da peça e do fio |
| F-052 | Elevar e rebaixar ▸ Recuar (Send Backward) | Fritzing › Part › Raise and Lower › Send Backward | feita | 0 | e2e/edit.spec.ts | Ctrl+[; também nos menus de contexto da peça e do fio |
| F-053 | Elevar e rebaixar ▸ Enviar para trás (Send to Back) | Fritzing › Part › Raise and Lower › Send to Back | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | Ctrl+Shift+[; também nos menus de contexto da peça e do fio |
| F-054 | Alinhar ▸ Esquerda (Align Left) | Fritzing › Part › Align › Align Left | feita | 0 | e2e/edit.spec.ts | duas ou mais peças selecionadas |
| F-055 | Alinhar ▸ Centro horizontal (Align Horizontal Center) | Fritzing › Part › Align › Align Horizontal Center | feita | 0 | e2e/edit.spec.ts | idem |
| F-056 | Alinhar ▸ Direita (Align Right) | Fritzing › Part › Align › Align Right | feita | 0 | e2e/edit.spec.ts | idem |
| F-057 | Alinhar ▸ Topo (Align Top) | Fritzing › Part › Align › Align Top | feita | 0 | e2e/edit.spec.ts | idem |
| F-058 | Alinhar ▸ Centro vertical (Align Vertical Center) | Fritzing › Part › Align › Align Vertical Center | feita | 0 | e2e/edit.spec.ts | idem |
| F-059 | Alinhar ▸ Base (Align Bottom) | Fritzing › Part › Align › Align Bottom | feita | 0 | e2e/edit.spec.ts | idem |
| F-060 | Travar peça (Lock Part) | Fritzing › Part › Lock Part | feita | 0 | e2e/edit.spec.ts | marcável; travada não move, não gira, não espelha e não é apagada; também no menu de contexto |
| F-061 | Sticky (Sticky) | Fritzing › Part › Sticky | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | marcável; só peça com camada sticky (no 1.0.8, as placas de PCB; a protoboard não tem); placa nova nasce sticky, como no Fritzing; também no menu de contexto |
| F-062 | Selecionar todas as peças travadas (Select All Locked Parts) | Fritzing › Part › Select All Locked Parts | falta | 3 | — |  |
| F-063 | Adicionar ao bin ▸ (Add to bin...) | Fritzing › Part › Add to bin... ▸ | feita | 0 | e2e/parts.spec.ts | Meus itens, cada bin do usuário e Novo bin…; também no menu de contexto |
| F-064 | Mostrar/Ocultar rótulo da peça (Show part label) | Fritzing › Part › Show part label | feita | 0 | e2e/edit.spec.ts | o texto segue o estado; também no menu de contexto |
| F-065 | Selecionar peças desatualizadas (Select outdated parts) | Fritzing › Part › Select outdated parts | falta | 3 | — |  |
| F-066 | Atualizar peças selecionadas (Update selected parts) | Fritzing › Part › Update selected parts | falta | 3 | — | troca pela revisão nova da peça |
| F-067 | Localizar peça no sketch… (Find part in sketch...) | Fritzing › Part › Find part in sketch... | falta | 3 | — | Ctrl+F; FRIZING_KICAD §10: entra no painel de busca |
| F-068 | Regerar banco de peças… (Regenerate parts database...) | Fritzing › Part › Regenerate parts database... | não se aplica | — | — | só aparece com o log de depuração; o índice do acervo é refeito pelo worker Indexer a cada carga |
| F-069 | Ampliar (Zoom In) | Fritzing › View › Zoom In | feita | 0 | e2e/edit.spec.ts | Ctrl++ e Ctrl+=; também no controle de zoom do quadro |
| F-070 | Reduzir (Zoom Out) | Fritzing › View › Zoom Out | feita | 0 | e2e/edit.spec.ts | Ctrl+-; também no controle de zoom do quadro |
| F-071 | Enquadrar (Fit in Window) | Fritzing › View › Fit in Window | feita | 0 | e2e/edit.spec.ts | Ctrl+0; também no controle de zoom do quadro |
| F-072 | Tamanho real (Actual Size) | Fritzing › View › Actual Size | feita | 0 | e2e/edit.spec.ts | zoom 96/90 (tela de 96 px/in); o Fritzing tenta ler o DPI do monitor |
| F-073 | 100% (100% Size) | Fritzing › View › 100% Size | feita | 0 | e2e/edit.spec.ts | Ctrl+Shift+0; também clicando no percentual do quadro |
| F-074 | Alinhar à grade (Align to Grid) | Fritzing › View › Align to Grid | feita | 0 | tests/path.test.ts · e2e/edit.spec.ts | marcável, gravado por vista; também na aba Documento |
| F-075 | Mostrar grade (Show Grid) | Fritzing › View › Show Grid | feita | 0 | e2e/edit.spec.ts | marcável, gravado por vista; também na aba Documento |
| F-076 | Tamanho da grade… (Set Grid Size...) | Fritzing › View › Set Grid Size... | falta | 3 | — | parcial: aba Documento › Grade escolhe entre tamanhos fixos de cada vista; faltam valor livre em in/mm e Restaurar padrão |
| F-077 | Cor de fundo… (Set Background Color...) | Fritzing › View › Set Background Color... | falta | 3 | — | o desenho já lê backgroundColor do sketch; falta o comando |
| F-078 | Colorir fios da protoboard pelo comprimento (Color Breadboard Wires By Length) | Fritzing › View › Color Breadboard Wires By Length | falta | 3 | — |  |
| F-079 | Mostrar boas-vindas (Show Welcome) | Fritzing › View › Show Welcome | feita | 2 | e2e/navigation.spec.ts | Ajuda › Boas-vindas reabre o cartão; ele aparece sozinho no quadro vazio |
| F-080 | Mostrar protoboard (Show Breadboard) | Fritzing › View › Show Breadboard | feita | 0 | e2e/circuit.spec.ts | Ctrl+1 e tecla 1 (Ctrl+2 no Fritzing, onde Ctrl+1 é Boas-vindas); abas da barra superior |
| F-081 | Mostrar esquemático (Show Schematic) | Fritzing › View › Show Schematic | feita | 0 | e2e/circuit.spec.ts | Ctrl+2 e tecla 2 (Ctrl+3 no Fritzing); abas da barra superior |
| F-082 | Mostrar PCB (Show PCB) | Fritzing › View › Show PCB | feita | 0 | e2e/circuit.spec.ts | Ctrl+3 e tecla 3 (Ctrl+4 no Fritzing); abas da barra superior |
| F-083 | Mostrar código (Show Code) | Fritzing › View › Show Code | falta | 14 | — | Ctrl+5; a aba Código está detalhada na terceira tabela |
| F-084 | Bin em ícones (Show Parts Bin Icon View) | Fritzing › View › Show Parts Bin Icon View (também Bin › Show Bin in Icon View) | falta | 3 | — | parcial: as seções da biblioteca saem em grade de ícones; não há como alternar |
| F-085 | Bin em lista (Show Parts Bin List View) | Fritzing › View › Show Parts Bin List View (também Bin › Show Bin in List View) | falta | 3 | — | parcial: só os resultados da busca saem em lista |
| F-086 | Mostrar todas as camadas (Show All Layers) | Fritzing › View › Show All Layers | falta | 3 | — | parcial (fase 2, e2e/pcb.spec.ts): na PCB, Exibir › Camadas da PCB › Mostrar todas as camadas e a legenda do quadro; falta nas outras vistas |
| F-087 | Ocultar todas as camadas (Hide All Layers) | Fritzing › View › Hide All Layers | falta | 3 | — | parcial (fase 2, e2e/pcb.spec.ts): na PCB, Exibir › Camadas da PCB › Ocultar todas as camadas e a legenda do quadro; falta nas outras vistas |
| F-088 | Camada ▸ cada camada da vista, marcável (‹nome› Layer) | Fritzing › View › ‹nome› Layer (sketchwidget.cpp) | falta | 3 | — | parcial: na PCB, Ambas/Topo/Base esmaecem uma face, e a serigrafia se oculta peça a peça (F-130) |
| F-089 | Minimizar (Minimize) | Fritzing › Window › Minimize | não se aplica | — | — | Ctrl+M; janela do sistema, desktop |
| F-090 | Painel Peças (Parts) | Fritzing › Window › Parts (doca) | não se aplica | — | — | liga e desliga uma doca do Qt; no CircuitMaster os painéis são fixos no layout, o trilho troca o painel esquerdo e no celular eles viram folhas |
| F-091 | Painel Inspetor (Inspector) | Fritzing › Window › Inspector (doca) | não se aplica | — | — | idem; o inspetor fica sempre à direita |
| F-092 | Painel Camadas (Layers) | Fritzing › Window › Layers (doca) | falta | 3 | — | parcial (fase 2, e2e/pcb.spec.ts): legenda "Camadas" no quadro da PCB liga e desliga cada grupo num clique; falta nas outras vistas |
| F-093 | Lista dos sketches abertos (uma entrada por janela) | Fritzing › Window › ‹sketch aberto› | feita | 2 | e2e/ui.spec.ts | abas de sketches no cabeçalho do quadro, com o ponto de alterações não salvas (spec 05 §4) |
| F-094 | Abrir janela de programação (Open programming window) | Fritzing › Window › Open programming window | não se aplica | — | — | só aparece quando a aba Código está desligada; a função é a da aba Código (F-083) |
| F-095 | Autorotear (Autoroute) | Fritzing › Routing (PCB e esquemático) › Autoroute | feita | 0 | tests/router.test.ts · e2e/pcb.spec.ts | Shift+Ctrl+A; progresso e cancelar na aba Roteamento; com várias placas, a selecionada; sem placa, "Criar placa e rotear" |
| F-096 | Verificar regras (Design Rules Check (DRC)) | Fritzing › Routing (PCB) › Design Rules Check (DRC) | feita | 0 | tests/drc.test.ts · e2e/pcb.spec.ts | Shift+Ctrl+D; violações no painel Problemas; com várias placas, a selecionada |
| F-097 | Ajustes do autorouter e do DRC… (Autorouter/DRC settings...) | Fritzing › Routing (PCB) › Autorouter/DRC settings... | feita | 0 | e2e/pcb.spec.ts | abre a aba Roteamento › Regras: largura da trilha, folga, furo e anel da via, ciclos; gravados no sketch |
| F-098 | Cotação Fritzing Fab… (Fritzing Fab Quote...) | Fritzing › Routing (PCB) › Fritzing Fab Quote... | não se aplica | — | — | serviço do Fritzing Fab (FRIZING_KICAD §10) |
| F-099 | Preenchimento ▸ Preencher com cobre (Ground Fill › Copper Fill) | Fritzing › Routing (PCB) › Ground Fill › Copper Fill | feita | 0 | tests/fill.test.ts · e2e/pcb.spec.ts | também na aba Roteamento |
| F-100 | Preenchimento ▸ Preencher com terra (Ground Fill › Ground Fill) | Fritzing › Routing (PCB) › Ground Fill › Ground Fill | feita | 0 | tests/fill.test.ts · e2e/pcb.spec.ts | alívio térmico nos pads de terra; também na aba Roteamento |
| F-101 | Preenchimento ▸ Remover preenchimento (Ground Fill › Remove Copper Fill) | Fritzing › Routing (PCB) › Ground Fill › Remove Copper Fill | feita | 0 | e2e/pcb.spec.ts | também na aba Roteamento |
| F-102 | Preenchimento ▸ Escolher sementes… (Choose Ground Fill Seed(s)...) | Fritzing › Routing (PCB) › Ground Fill › Choose Ground Fill Seed(s)... | falta | 3 | — | parcial: a semente se marca conector a conector no menu de contexto (F-132); falta o diálogo com a lista de conectores |
| F-103 | Preenchimento ▸ Limpar sementes (Clear Ground Fill Seeds) | Fritzing › Routing (PCB) › Ground Fill › Clear Ground Fill Seeds | feita | 0 | e2e/pcb.spec.ts | também no menu de contexto da peça na PCB e na aba Roteamento |
| F-104 | Preenchimento ▸ Folga do preenchimento… (Set Ground Fill Keepout...) | Fritzing › Routing (PCB) › Ground Fill › Set Ground Fill Keepout... | feita | 0 | e2e/pcb.spec.ts | aba Roteamento › Regras › Folga do cobre (GPG_Keepout); não está no menu |
| F-105 | Ver de baixo (View from below) | Fritzing › Routing (PCB) › View from below | falta | 3 | — | também os botões View from Above/Below da barra inferior |
| F-106 | Ambas as faces clicáveis (Set both copper layers clickable) | Fritzing › Routing (PCB) › Set both copper layers clickable | feita | 0 | e2e/pcb.spec.ts | botão Ambas no cabeçalho do quadro na PCB; sem o atalho Shift+Ctrl+3 |
| F-107 | Só a face de cima clicável (Set copper top layer clickable) | Fritzing › Routing (PCB) › Set copper top layer clickable | falta | 3 | — | parcial: Topo esmaece a face de baixo e põe nela as trilhas novas, mas a outra face continua clicável; sem Shift+Ctrl+2 |
| F-108 | Só a face de baixo clicável (Set copper bottom layer clickable) | Fritzing › Routing (PCB) › Set copper bottom layer clickable | falta | 3 | — | parcial: Base esmaece a face de cima e põe nela as trilhas novas, mas a outra face continua clicável; sem Shift+Ctrl+1 |
| F-109 | Mover para a outra face (Move to other side of the board) | Fritzing › Routing (PCB) › Move to other side of the board | feita | 0 | e2e/pcb.spec.ts | Roteamento › Mover trilha para a outra face; também no menu de contexto da trilha (Mover para a face de cima/de baixo) |
| F-110 | Não rotear automaticamente (Do not autoroute) | Fritzing › Routing (PCB e esquemático) › Do not autoroute | feita | 0 | e2e/pcb.spec.ts | marcável; também no menu de contexto da trilha |
| F-111 | Mostrar não roteadas (Show unrouted) | Fritzing › Routing (PCB, esquemático e protoboard) › Show unrouted | falta | 3 | — | parcial: contagem no painel Problemas e na aba Roteamento e linhas tracejadas no quadro; não realça nem seleciona os conectores pendentes |
| F-112 | Selecionar todas as trilhas (Select All Traces) | Fritzing › Routing (PCB e esquemático) › Select All Traces | feita | 0 | e2e/pcb.spec.ts |  |
| F-113 | Selecionar trilhas "não rotear" (Select All "Don't Autoroute" Traces) | Fritzing › Routing (PCB e esquemático) › Select All "Don't Autoroute" Traces | falta | 3 | — |  |
| F-114 | Selecionar trilhas autoroteáveis (Select All Autoroutable Traces) | Fritzing › Routing (PCB e esquemático) › Select All Autoroutable Traces | falta | 3 | — | parcial: existe no menu da PCB; falta no do esquemático |
| F-115 | Selecionar todos os jumpers (Select All Jumpers) | Fritzing › Routing (PCB) › Select All Jumpers | falta | 3 | — |  |
| F-116 | Selecionar todas as vias (Select All Vias) | Fritzing › Routing (PCB) › Select All Vias | feita | 0 | e2e/pcb.spec.ts |  |
| F-117 | Selecionar todos os preenchimentos (Select All CopperFill) | Fritzing › Routing (PCB) › Select All CopperFill | feita | 0 | e2e/pcb.spec.ts |  |
| F-118 | Selecionar todos os fios (Select All Wires) | Fritzing › Routing (protoboard) › Select All Wires | feita | 0 | e2e/pcb.spec.ts | menu Roteamento da protoboard |
| F-119 | Tutoriais online (Online Tutorials) | Fritzing › Help › Online Tutorials | não se aplica | — | — | Ctrl+?; link do site do Fritzing; a ajuda do CircuitMaster é própria (FRIZING_KICAD §10) |
| F-120 | Galeria de projetos online (Online Projects Gallery) | Fritzing › Help › Online Projects Gallery | não se aplica | — | — | link do site do Fritzing (FRIZING_KICAD §10) |
| F-121 | Referência de peças online (Online Parts Reference) | Fritzing › Help › Online Parts Reference | não se aplica | — | — | link do site do Fritzing (FRIZING_KICAD §10) |
| F-122 | Ajuda do editor de peças (Parts Editor Help) | Fritzing › Help › Parts Editor Help | não se aplica | — | — | link do site do Fritzing; o editor de peças explica cada passo na própria tela |
| F-123 | Procurar atualizações… (Check for updates...) | Fritzing › Help › Check for updates... | não se aplica | — | — | app web, sempre na versão servida |
| F-124 | Relatar um bug… (Report a bug...) | Fritzing › Help › Report a bug... | não se aplica | — | — | link para o rastreador do Fritzing |
| F-125 | Ligar o log de depuração (Enable debugging log) | Fritzing › Help › Enable debugging log | não se aplica | — | — | o console do navegador cumpre o papel |
| F-126 | Sobre (About) | Fritzing › Help › About | feita | 0 | e2e/ui.spec.ts | Ajuda › Sobre o CircuitMaster, com os créditos |
| F-127 | Dicas, truques e atalhos (Tips, Tricks and Shortcuts) | Fritzing › Help › Tips, Tricks and Shortcuts | feita | 2 | e2e/ui.spec.ts | Ajuda › Guia de uso (o que fazer e como), Tour da interface e Atalhos de teclado |
| F-128 | Ajuda inicial (First Time Help) | Fritzing › Help › First Time Help | feita | 2 | e2e/ui.spec.ts | tour por modo na primeira abertura (Ajuda › Tour da interface repete) e boas-vindas no quadro vazio |
| F-129 | Itens só da compilação de depuração (throw test exception, Dump all parts, Tidy Wires, About Qt, Debugger Output) | Fritzing › File, Part, Routing, Help, Window (#ifndef QT_NO_DEBUG) | não se aplica | — | — | não aparecem na versão distribuída do Fritzing |

### Menus de contexto

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| F-130 | Ocultar/Mostrar serigrafia da peça (Hide part silkscreen) | Fritzing › contexto da peça na PCB (pcbItemMenu, mainwindow_menu.cpp) | feita | 0 | e2e/pcb.spec.ts | o texto segue o estado; só peça com camada de serigrafia |
| F-131 | Converter via em dobra (Convert Via to Bendpoint) | Fritzing › contexto da peça na PCB (pcbItemMenu, mainwindow_menu.cpp) | feita | 0 | tests/edit.test.ts · e2e/pcb.spec.ts | só em via, habilitado com duas trilhas ligadas |
| F-132 | Definir semente de preenchimento de terra (Set Ground Fill Seed) | Fritzing › contexto da peça na PCB (pcbItemMenu, mainwindow_menu.cpp) | feita | 0 | e2e/pcb.spec.ts | marcável, sobre o conector clicado |
| F-133 | Desligar todos os fios (Disconnect All Wires) | Fritzing › contexto da peça (viewItemMenuAux), com o log de depuração ligado | falta | 3 | — | FRIZING_KICAD §10 pede |
| F-134 | Itens de depuração (Test Connectors, Update InfoView on hover, Export Normalized SVG, Export Normalized Flattened SVG) | Fritzing › contexto da peça e do fio (viewItemMenuAux, *WireMenu) | não se aplica | — | — | ferramentas internas, só com o log de depuração ou na compilação de depuração |
| F-135 | Cor do fio ▸ azul (Wire Color › blue) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-136 | Cor do fio ▸ vermelho (Wire Color › red) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-137 | Cor do fio ▸ preto (Wire Color › black) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-138 | Cor do fio ▸ amarelo (Wire Color › yellow) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-139 | Cor do fio ▸ verde (Wire Color › green) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-140 | Cor do fio ▸ cinza (Wire Color › grey) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-141 | Cor do fio ▸ branco (Wire Color › white) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) — só protoboard | feita | 0 | e2e/edit.spec.ts | marca a cor atual; o esquemático não tem branco |
| F-142 | Cor do fio ▸ laranja (Wire Color › orange) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-143 | Cor do fio ▸ ocre (Wire Color › ochre) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-144 | Cor do fio ▸ ciano (Wire Color › cyan) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-145 | Cor do fio ▸ marrom (Wire Color › brown) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-146 | Cor do fio ▸ roxo (Wire Color › purple) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-147 | Cor do fio ▸ rosa (Wire Color › pink) | Fritzing › contexto do fio na protoboard e no esquemático (breadboardWireMenu, schematicWireMenu; items/wire.cpp) | feita | 0 | e2e/edit.spec.ts | marca a cor atual |
| F-148 | Criar fio a partir do ratsnest (Create wire from ratsnest) | Fritzing › contexto do ratsnest na protoboard (breadboardWireMenu) | feita | 0 | e2e/edit.spec.ts | só em ratsnest |
| F-149 | Criar trilha a partir do ratsnest (Create trace from ratsnest) | Fritzing › contexto do ratsnest no esquemático e na PCB (schematicWireMenu, pcbWireMenu) | feita | 0 | e2e/edit.spec.ts | só em ratsnest |
| F-150 | Apagar linha de ratsnest (Delete Ratsnest Line) | Fritzing › contexto do ratsnest (texto de Delete Wire em ratsnest) | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | corta a conexão que a linha representa, inclusive o fio invisível da protoboard |
| F-151 | Apagar fio até as dobras (Delete Wire up to bendpoints) | Fritzing › contexto do fio (*WireMenu) | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | não em ratsnest |
| F-152 | Adicionar dobra (Add Bendpoint) | Fritzing › contexto do fio (*WireMenu) | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | no ponto do clique; também por duplo clique no fio |
| F-153 | Remover dobra (Remove Bendpoint) | Fritzing › contexto do fio, sobre uma dobra | feita | 0 | tests/edit.test.ts · e2e/edit.spec.ts | o texto troca quando o clique foi numa dobra |
| F-154 | Converter dobra em via (Convert Bendpoint to Via) | Fritzing › contexto da trilha na PCB (pcbWireMenu) | feita | 0 | tests/edit.test.ts · e2e/pcb.spec.ts | numa dobra; furo do ajuste da placa |
| F-155 | Endireitar curva (Straighten Curve) | Fritzing › contexto do fio (*WireMenu) | feita | 0 | e2e/edit.spec.ts | só em fio curvo |
| F-156 | Editar rótulo (Edit) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Edit | falta | 3 | — | parcial: o campo Nome do inspetor muda o texto; o clique direito no rótulo abre o menu da peça |
| F-157 | Ocultar rótulo (Hide) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Hide | feita | 0 | e2e/edit.spec.ts | o clique direito no rótulo abre o menu da peça, que tem Ocultar rótulo da peça (F-064) |
| F-158 | Exibir valores ▸ Texto do rótulo (Display Values › Label text) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Display Values › Label text | falta | 3 | — |  |
| F-159 | Exibir valores ▸ cada propriedade da peça (Display Values › ‹propriedade›) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Display Values › ‹propriedade› | falta | 3 | — | o rótulo mostra hoje título e valor principal fixos |
| F-160 | Girar/Espelhar ▸ 45° no sentido horário (Flip/Rotate › Rotate 45° Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 45° Clockwise (só PCB) | falta | 3 | — |  |
| F-161 | Girar/Espelhar ▸ 90° no sentido horário (Flip/Rotate › Rotate 90° Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 90° Clockwise | falta | 3 | — |  |
| F-162 | Girar/Espelhar ▸ 135° no sentido horário (Flip/Rotate › Rotate 135° Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 135° Clockwise (só PCB) | falta | 3 | — |  |
| F-163 | Girar/Espelhar ▸ 180° (Flip/Rotate › Rotate 180°) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 180° | falta | 3 | — |  |
| F-164 | Girar/Espelhar ▸ 135° no sentido anti-horário (Flip/Rotate › Rotate 135° Counter Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 135° Counter Clockwise (só PCB) | falta | 3 | — |  |
| F-165 | Girar/Espelhar ▸ 90° no sentido anti-horário (Flip/Rotate › Rotate 90° Counter Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 90° Counter Clockwise | falta | 3 | — |  |
| F-166 | Girar/Espelhar ▸ 45° no sentido anti-horário (Flip/Rotate › Rotate 45° Counter Clockwise) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Rotate 45° Counter Clockwise (só PCB) | falta | 3 | — |  |
| F-167 | Girar/Espelhar ▸ Espelhar horizontal (Flip/Rotate › Flip Horizontal) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Flip Horizontal | falta | 3 | — |  |
| F-168 | Girar/Espelhar ▸ Espelhar vertical (Flip/Rotate › Flip Vertical) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Flip/Rotate › Flip Vertical | falta | 3 | — |  |
| F-169 | Tamanho da fonte ▸ Minúsculo (Font Size › Tiny) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Font Size › Tiny | falta | 3 | — |  |
| F-170 | Tamanho da fonte ▸ Pequeno (Font Size › Small) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Font Size › Small | falta | 3 | — |  |
| F-171 | Tamanho da fonte ▸ Médio (Font Size › Medium) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Font Size › Medium | falta | 3 | — |  |
| F-172 | Tamanho da fonte ▸ Grande (Font Size › Large) | Fritzing › contexto do rótulo da peça (items/partlabelcontextmenu.cpp) › Font Size › Large | falta | 3 | — |  |
| F-173 | Remover conexão interna (Remove Internal Connection) | Fritzing › editor de peças › contexto da conexão interna (pemainwindow.cpp) | falta | 3 | — | depende das conexões internas (F-211) |

### Bins, editor de peças, aba Código e outros docks

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| F-174 | Importar… (Import...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Import... | feita | 0 | tests/sketch.test.ts · e2e/parts.spec.ts | pelo Arquivo › Abrir: .fzpz vai para Meus itens, .fzb/.fzbz vira bin do usuário; guardados no navegador |
| F-175 | Novo bin… (New Bin...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › New Bin... | feita | 0 | e2e/parts.spec.ts | aba Meus itens › Novo bin e Adicionar ao bin › Novo bin… |
| F-176 | Fechar bin (Close Bin) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Close Bin (também no contexto da aba do bin) | falta | 3 | — | parcial: só Apagar; não há fechar e reabrir |
| F-177 | Apagar bin (Delete Bin) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Delete Bin (também no contexto da aba do bin) | feita | 0 | e2e/parts.spec.ts | pede confirmação; as peças continuam no acervo |
| F-178 | Salvar bin (Save Bin) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Save Bin (também no contexto da aba do bin) | feita | 0 | e2e/parts.spec.ts | gravação automática no navegador (localStorage circuitmaster.*): o bin volta depois de recarregar |
| F-179 | Salvar bin como… (Save Bin As...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Save Bin As... (também no contexto da aba do bin) | não se aplica | — | — | no navegador gravar é baixar; Exportar bin (.fzbz) já leva o .fzb e as peças |
| F-180 | Exportar bin… (Export Bin...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Export Bin... (também no contexto da aba do bin) | feita | 0 | tests/sketch.test.ts · e2e/parts.spec.ts | botão Exportar .fzbz em Meus itens e em cada bin do usuário |
| F-181 | Renomear bin… (Rename Bin...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Rename Bin... (também no contexto da aba do bin) | feita | 0 | e2e/parts.spec.ts | bins do usuário |
| F-182 | Copiar para o sketch e Copiar tudo para o sketch (Copy to Sketch, Copy all to Sketch) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Copy to Sketch, Copy all to Sketch | não se aplica | — | — | só na compilação de depuração |
| F-183 | Editar peça do bin (Edit Part (new parts editor)...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Edit Part (new parts editor)... (também no contexto da peça no bin) | falta | 3 | — | parcial: o editor abre só a partir de uma peça do sketch (F-041) |
| F-184 | Exportar peça do bin… (Export Part...) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Export Part... (também no contexto da peça no bin) | falta | 3 | — |  |
| F-185 | Remover peça do bin (Remove Part) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Remove Part (também no contexto da peça no bin) | falta | 3 | — |  |
| F-186 | Localizar a peça do bin no sketch (Find Part in Sketch) | Fritzing › Parts › menu Bin (partsbinpalette/binmanager/binmanager.cpp) › Find Part in Sketch (também no contexto da peça no bin) | falta | 3 | — |  |
| F-187 | Bins de fábrica em abas (Core, Contrib, Arduino, SparkFun… e o bin Temp) | Fritzing › Parts (binmanager.cpp; fritzing-parts/bins) | falta | 3 | — | parcial: abas Core e Simulador; as peças dos outros bins só pela busca; sem o bin Temp com as peças do sketch aberto |
| F-188 | Busca de peças (Search) | Fritzing › Parts › Search (searchbinpalettewidget.cpp) | feita | 0 | tests/search.test.ts · e2e/parts.spec.ts | atalho /; português e inglês; básicos primeiro |
| F-189 | Pôr peça do bin no sketch (arrastar) | Fritzing › Parts (partsbinview.cpp) | feita | 0 | e2e/circuit.spec.ts | arrastar, ou clicar e clicar no quadro, ou duplo clique para o centro |
| F-190 | Carregar SVG da vista (Load image for view... SVG) | Fritzing › editor de peças › File › Load image for view... | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | Carregar SVG… em cada aba de vista; o SVG é saneado |
| F-191 | Carregar JPG/PNG da vista (Load image for view... JPG, PNG) | Fritzing › editor de peças › File › Load image for view... | falta | 3 | — | parcial: só SVG |
| F-192 | Carregar footprint gEDA (.fp) ou módulo KiCad antigo (.mod) | Fritzing › editor de peças › File › Load image for view... (kicadmoduledialog.cpp) | não se aplica | — | — | superado pelas bibliotecas do KiCad (FRIZING_KICAD §10) |
| F-193 | Reaproveitar a imagem da protoboard (Reuse breadboard image) | Fritzing › editor de peças › File › Reuse breadboard image | falta | 3 | — |  |
| F-194 | Reaproveitar a imagem do esquemático (Reuse schematic image) | Fritzing › editor de peças › File › Reuse schematic image | falta | 3 | — |  |
| F-195 | Reaproveitar a imagem da PCB (Reuse PCB image) | Fritzing › editor de peças › File › Reuse PCB image | falta | 3 | — |  |
| F-196 | Fechar o editor (Close Window) | Fritzing › editor de peças › File › Close Window | falta | 3 | — | parcial: Cancelar fecha, mas sem perguntar pelas alterações não gravadas |
| F-197 | Salvar a peça (Save) | Fritzing › editor de peças › File › Save | falta | 3 | — | parcial: gravar sempre cria peça nova; falta sobrescrever uma peça própria |
| F-198 | Salvar como peça nova (Save as new part) | Fritzing › editor de peças › File › Save as new part | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | Gravar peça: registro da revisão, peça nova em Meus itens e opção de trocar a do sketch |
| F-199 | Exportar ▸ do editor de peças (Export › as Image, for Production) | Fritzing › editor de peças › File › Export ▸ | falta | 3 | — |  |
| F-200 | Mostrar na pasta (Show in Folder) | Fritzing › editor de peças › File › Show in Folder | não se aplica | — | — | abre o gerenciador de arquivos do sistema; desktop |
| F-201 | Desfazer e refazer no editor de peças (Undo, Redo) | Fritzing › editor de peças › Edit › Undo, Redo | falta | 3 | — |  |
| F-202 | Converter esquemático para o padrão de 0,1 pol (Convert schematic to 0.1 inch standard) | Fritzing › editor de peças › Edit › Convert schematic to 0.1 inch standard | falta | 3 | — | para esquemáticos anteriores ao 0.8.6 |
| F-203 | Mostrar ícone (Show Icon) | Fritzing › editor de peças › View › Show Icon | feita | 0 | e2e/parts.spec.ts | aba Ícone; sem o atalho Ctrl+4 |
| F-204 | Mostrar metadados (Show Metadata) | Fritzing › editor de peças › View › Show Metadata | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | aba Metadados; sem o atalho Ctrl+5 |
| F-205 | Mostrar conectores (Show Connectors) | Fritzing › editor de peças › View › Show Connectors | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | aba Conectores; sem o atalho Ctrl+6 |
| F-206 | Vistas protoboard, esquemático e PCB do editor (Show Breadboard, Show Schematic, Show PCB) | Fritzing › editor de peças › View › Show Breadboard/Schematic/PCB | feita | 0 | e2e/parts.spec.ts | abas Protoboard, Esquemático e PCB |
| F-207 | Tornar só esta vista visível (Make only this view visible) | Fritzing › editor de peças › View › Make only this view visible | falta | 3 | — |  |
| F-208 | Exibir do editor de peças: zoom, grade, cor de fundo e camadas | Fritzing › editor de peças › View (zoom, grid, background, layers) | falta | 3 | — | parcial: o desenho se ajusta à área, sem zoom, grade nem camadas |
| F-209 | Lista de conectores e escolha do gráfico (Connector List, Select graphic) | Fritzing › editor de peças › tool view (petoolview.cpp) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | clique no elemento do SVG; Alt+clique pega o grupo; na PCB o gêmeo da outra camada recebe o mesmo id |
| F-210 | Ponto terminal (Center, W, N, S, E e arrastar) | Fritzing › editor de peças › tool view (petoolview.cpp) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | Centro, Topo, Base, Esquerda, Direita e a marca arrastável |
| F-211 | Conexões internas (Set Internal Connections) | Fritzing › editor de peças › tool view (petoolview.cpp) | falta | 3 | — | barramentos entre conectores |
| F-212 | Número de conectores (number of connectors) | Fritzing › editor de peças › connectors view (peconnectorsview.cpp) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | novos ganham o próximo número livre; diminuir apaga os de maior número |
| F-213 | Tipo, nome e descrição de cada conector | Fritzing › editor de peças › connectors view (peconnectorsview.cpp) | feita | 0 | e2e/parts.spec.ts | male, female, pad |
| F-214 | Definir todos como (Set all to: Male, Female, Pad) | Fritzing › editor de peças › connectors view (peconnectorsview.cpp) | falta | 3 | — |  |
| F-215 | Passante ou SMD (Through-hole, SMD) | Fritzing › editor de peças › connectors view (peconnectorsview.cpp) | falta | 3 | — |  |
| F-216 | Metadados: título, autor, descrição, rótulo, URL, família, variante, propriedades e tags | Fritzing › editor de peças › metadata view (pemetadataview.cpp) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | família e variante entram como propriedades; variant repetida vira a próxima livre |
| F-217 | Histórico de revisões (History, Add revision, Edit revision) | Fritzing › editor de peças › metadata view (pemetadataview.cpp, pehistoryentrydialog.cpp) | feita | 0 | tests/partdraft.test.ts · e2e/parts.spec.ts | gravar pede o registro e pode subir a versão |
| F-218 | Nova aba de código (New Tab) | Fritzing › aba Código › Code › New Tab (programwindow.cpp; botão New) | falta | 14 | — |  |
| F-219 | Importar código… (Import Code...) | Fritzing › aba Código › Code › Import Code... (botão Open) | falta | 14 | — | Alt+Ctrl+I |
| F-220 | Salvar aba (Save Tab) | Fritzing › aba Código › Code › Save Tab (botão Save) | falta | 14 | — | Alt+Ctrl+S |
| F-221 | Renomear aba (Rename Tab) | Fritzing › aba Código › Code › Rename Tab | falta | 14 | — | Alt+Ctrl+R |
| F-222 | Fechar aba (Close Tab) | Fritzing › aba Código › Code › Close Tab (programtab.cpp) | falta | 14 | — | Alt+Ctrl+W; tira o arquivo do sketch e pode apagá-lo (Also delete the file) |
| F-223 | Plataforma ▸ (Platform: Arduino, Launchpad, PICAXE) | Fritzing › aba Código › Code › Platform ▸ | falta | 14 | — |  |
| F-224 | Placa ▸ (Board) | Fritzing › aba Código › Code › Board ▸ | falta | 14 | — |  |
| F-225 | Porta ▸ (Port) | Fritzing › aba Código › Code › Port ▸ | falta | 14 | — | portas seriais; no navegador, Web Serial |
| F-226 | Monitor serial (Serial Monitor) | Fritzing › aba Código › Code › Serial Monitor (consolewindow.cpp) | falta | 14 | — | Ctrl+M; Web Serial |
| F-227 | Enviar (Upload) | Fritzing › aba Código › Code › Upload | falta | 14 | — | Ctrl+U; arduino-cli pelo plugin do Vite (FRIZING_KICAD §13, fase 14) |
| F-228 | Editor de código com realce de sintaxe | Fritzing › aba Código › editor (highlighter.cpp, syntaxer.cpp) | falta | 14 | — |  |
| F-229 | Console de saída da compilação e do envio | Fritzing › aba Código › console (console.cpp) | falta | 14 | — |  |
| F-230 | Editar da aba Código (Undo, Redo, Cut, Copy, Paste, Select All) | Fritzing › aba Código › Edit | falta | 14 | — |  |
| F-231 | Programas guardados no .fzz | Fritzing › aba Código › programwindow.cpp | falta | 14 | — | os arquivos de código vão dentro do sketch e voltam ao abrir |
| F-232 | Histórico de desfazer (Undo History) | Fritzing › Window › Undo History (doca, mainwindow_dock.cpp) | feita | 1 | tests/history.test.ts · e2e/robust.spec.ts | no painel Projeto (Editar › Histórico de desfazer): cada passo com nome pela diferença dos documentos; um clique volta ou avança até ele (spec 06 §7) |
| F-233 | Salvamento automático e recuperação (Autosave) | Fritzing › Preferences › Autosave e recuperação ao abrir (mainwindow.cpp) | feita | 1 | e2e/robust.spec.ts · e2e/soak.spec.ts | IndexedDB 1,5 s depois de cada mudança e ao esconder a aba, 20 versões, recuperação das sessões mortas ao abrir, Arquivo › Versões salvas automaticamente (spec 06 §6); o intervalo do Fritzing nas Preferências não se aplica: grava a cada mudança |
| F-234 | Idiomas (Language) | Fritzing › Preferences › Language (translations) | feita | 2 | tests/text.test.ts · e2e/ui.spec.ts | português e inglês com textos próprios (spec 05 §8), em Preferências › Idioma e Exibir › Idioma |
| F-235 | Simular (Start Simulator) | Fritzing › barra inferior › Simulate (mainwindow.cpp, simulation/simulator.cpp) | feita | 0 | tests/spice.test.ts · e2e/circuit.spec.ts | botão Simular da barra superior e Simulação › Simular; leituras no circuito, gráfico e Medidas na doca |
| F-236 | Parar a simulação (Stop Simulator) | Fritzing › barra inferior › Stop | feita | 0 | e2e/circuit.spec.ts | o mesmo botão vira Parar; Simulação › Parar a simulação |
| F-237 | Modo normal (Normal Mode) | Fritzing › barra inferior › Simulate ▸ Normal Mode | feita | 0 | tests/spice.test.ts · e2e/simulation.spec.ts | Simular decide sozinho (spec 05 §3, decisão 2): sem variação no tempo, mostra o regime do ponto de operação |
| F-238 | Modo transitório (Transient Mode) | Fritzing › barra inferior › Simulate ▸ Transient Mode | feita | 0 | tests/bench.test.ts · e2e/simulation.spec.ts | Simular roda o transitório na janela do teste escolhido no painel (Automático, Degrau, Onda quadrada, Senoide, Manual) |
| F-239 | Propriedades de simulação do projeto (Project properties: passo, número de pontos, animação, opções SPICE) | Fritzing › Preferences › Beta Features › Project properties (prefsdialog.cpp) | feita | 0 | tests/timing.test.ts · e2e/simulation.spec.ts | doca › Ajustes: teste (Automático, Degrau, Onda quadrada, Senoide, Manual), passo ou pontos, animação e opções do SPICE, gravados no sketch |
| F-240 | Resultados nas peças ao simular (multímetro, fumaça, brilho do LED, osciloscópio) | Fritzing › simulation/simulator.cpp | feita | 0 | tests/spice.test.ts · e2e/simulation.spec.ts |  |
| F-241 | Trocar a peça pelas propriedades do inspetor (swap) | Fritzing › Inspector (infoview/htmlinfoview.cpp) | feita | 0 | e2e/parts.spec.ts | outro valor de propriedade da família troca a peça mantendo as ligações |
| F-242 | Peças geradas nos sketches abertos: DIP, barra de pinos, perfboard e stripboard | Fritzing › PartFactory (items/dip.cpp, pinheader.cpp, perfboard.cpp, stripboard.cpp) | feita | 0 | tests/engine.test.ts · e2e/parts.spec.ts | core/Generator cria .fzp e SVG pelo moduleId (generic_ic_dip_N, generic_*_pin_header_N, X.YPerfboard/Stripboard); os cortes gravados da stripboard valem no netlist |
| F-243 | Pôr peças geradas pela biblioteca e mudar pinos, espaçamento e tamanho no inspetor | Fritzing › Parts › Core (IC, Generic female header, Perfboard, Stripboard) e Inspector › pins, pin spacing, size | falta | 3 | e2e/parts.spec.ts | parcial: as geradas que o bin Core cita (DIP 8, barra fêmea de 2, barra shrouded de 10) entram no índice, no bin e na busca, com ícone (fase 0); o inspetor ainda só troca entre .fzp existentes (mudar pinos e espaçamento: fase 3) |
| F-244 | Cortar e religar as tiras da stripboard no quadro | Fritzing › items/stripboard.cpp (clique entre os furos) | falta | 3 | — | parcial: os cortes gravados no .fz valem no netlist; não há como mudá-los |
| F-245 | Peças paramétricas SIP, mystery part e screw terminal com N pinos | Fritzing › Inspector (items/mysterypart.cpp, screwterminal.cpp) | falta | 3 | — | FRIZING_KICAD §10; spec 01 §8.5–8.6 |
| F-246 | Logo de texto (Logo) | Fritzing › Inspector (items/logoitem.cpp) | feita | 0 | tests/edit.test.ts · e2e/parts.spec.ts | texto novo regera o SVG e o tamanho |
| F-247 | Logo de imagem e placa de forma livre (Load image file...) | Fritzing › Inspector (items/logoitem.cpp, resizableboard.cpp) | falta | 3 | — | SVG/PNG/JPG como logo na serigrafia ou no cobre e como contorno da placa |
| F-248 | Subpartes do esquemático (relé e chaves com bobina e contatos em símbolos separados) | Fritzing › items/schematicsubpart.cpp | falta | 8 | — | junto com as unidades do KiCad |
| F-249 | Mover a seleção com as setas | Fritzing › sketchwidget.cpp (moveByArrow) | feita | 0 | e2e/edit.spec.ts | 1 passo de grade com o alinhamento ligado, senão 1 px; Shift multiplica por 10 |
| F-250 | Mover a vista com Espaço+arrastar ou o botão do meio | Fritzing › sketchwidget.cpp (spaceBarIsPressed) | feita | 0 | e2e/edit.spec.ts | também arrastar o fundo na ferramenta Editar |
| F-251 | Roda do mouse: zoom ou rolagem | Fritzing › sketchwidget.cpp (wheelEvent) e Preferences › Mouse Wheel Behavior | feita | 0 | e2e/edit.spec.ts | roda dá zoom no cursor e Shift+roda move; Preferências › Roda do mouse troca para rolar a vista (Ctrl+roda dá zoom) |

### Resumo

| Tabela | feita | falta | não se aplica | Total |
|---|---|---|---|---|
| Menus da barra | 81 | 29 | 19 | 129 |
| Menus de contexto | 25 | 18 | 1 | 44 |
| Bins, editor de peças, aba Código e outros docks | 35 | 39 | 4 | 78 |
| **Total** | **141** | **86** | **24** | **251** |

Linhas "falta" por fase: fase 3: 70 · fase 8: 1 · fase 14: 15.

Cobertura de Vitest nas linhas feitas: 52 de 141; as demais dependem só do E2E.

### Cobertura E2E necessária

Cada linha "feita" acima está em exatamente um arquivo E2E. A lista diz o comportamento concreto a conferir.

#### `e2e/circuit.spec.ts` (9 linhas)

- F-001 Novo: Arquivo › Novo e Ctrl+N: com alterações pede confirmação; o quadro fica vazio, o título vira "sem título" e o selo "Novo"
- F-002 Abrir…: Arquivo › Abrir… e Ctrl+O com um .fzz do acervo: as três vistas mostram as peças; título com o nome e selo "Salvo"
- F-007 Salvar: Ctrl+S e Arquivo › Salvar baixam ‹nome›.fzz; reabrir o arquivo baixado dá as mesmas instâncias, conexões e pontas de prova
- F-080 Mostrar protoboard: Exibir › Protoboard, Ctrl+1, tecla 1 e aba da barra superior: aba marcada e desenho da protoboard
- F-081 Mostrar esquemático: Exibir › Esquemático, Ctrl+2, tecla 2 e aba: a peça posta na protoboard aparece no esquemático
- F-082 Mostrar PCB: Exibir › PCB, Ctrl+3, tecla 3 e aba: a peça aparece na PCB e o fio da protoboard vira ratsnest
- F-189 Pôr peça do bin no sketch: arrastar um resistor da biblioteca para o quadro, clicar e clicar, e duplo clique: a instância nova aparece onde caiu (ou no centro) nas três vistas
- F-235 Simular: Simular com um circuito pronto (bateria, resistor, LED): leituras no circuito, gráfico e Medidas na doca, Problemas sem erro
- F-236 Parar a simulação: o botão vira Parar; ao parar as leituras somem e o botão volta a Simular

#### `e2e/edit.spec.ts` (63 linhas)

- F-028 Desfazer: depois de pôr uma peça, Ctrl+Z e Editar › Desfazer a tiram; botão da barra do quadro desabilitado sem histórico
- F-029 Refazer: Ctrl+Shift+Z, Ctrl+Y e Editar › Refazer devolvem a peça
- F-030 Recortar: Ctrl+X tira a seleção e Ctrl+V a devolve
- F-031 Copiar: Ctrl+C e Copiar do menu de contexto habilitam Colar
- F-032 Colar: Ctrl+V duas vezes: cópias deslocadas (20, −20) e (40, 0) px, com títulos novos e as ligações entre os itens copiados
- F-033 Colar no lugar: Ctrl+Shift+V: a cópia fica na mesma posição da original
- F-034 Duplicar: Ctrl+D e Duplicar do menu de contexto: nova instância deslocada; também com dois itens pela barra de seleção
- F-035 Apagar: Delete, Backspace e Apagar do menu: a peça some nas três vistas e leva os fios ligados; fio pelo contexto (Apagar fio)
- F-036 Apagar sem fios: Alt+Backspace: a peça some e os fios ficam com a ponta solta
- F-037 Selecionar tudo: Ctrl+A seleciona as peças e fios da vista; na protoboard não entram a placa nem as trilhas da PCB, e Delete em seguida não as apaga
- F-038 Desmarcar: Esc e Editar › Desmarcar esvaziam a seleção
- F-039 Adicionar nota: Editar › Adicionar nota cria a nota no centro da vista; duplo clique edita o texto; ela não aparece nas outras vistas
- F-043 Espelhar horizontal: no esquemático, tecla \| e Peça › Espelhar horizontalmente: a matriz da instância ganha escala −1 em x; duas vezes volta ao início
- F-044 Espelhar vertical: no esquemático, Peça › Espelhar verticalmente: escala −1 em y; os dois itens não aparecem na protoboard nem na PCB
- F-045 Girar ▸ 45° no sentido horário: na PCB, Peça › Girar › 45° no sentido horário: a transformação da instância gira 45°; desabilitado com uma breadboard selecionada
- F-046 Girar ▸ 90° no sentido horário: tecla ] e Peça › Girar › 90° horário: transformação gira 90° em torno do centro e os fios ligados acompanham
- F-047 Girar ▸ 180°: Peça › Girar › 180°: transformação gira 180°
- F-048 Girar ▸ 90° no sentido anti-horário: tecla [ e Peça › Girar › 90° anti-horário: transformação gira −90°
- F-049 Girar ▸ 45° no sentido anti-horário: na PCB, Peça › Girar › 45° anti-horário: transformação gira −45°
- F-050 Elevar e rebaixar ▸ Trazer para frente: Ctrl+Shift+] e Elevar e rebaixar › Trazer para frente: a peça passa a ser desenhada por último na camada
- F-051 Elevar e rebaixar ▸ Avançar: Ctrl+] e Avançar: troca com o vizinho de cima na mesma camada
- F-052 Elevar e rebaixar ▸ Recuar: Ctrl+[ e Recuar: troca com o vizinho de baixo
- F-053 Elevar e rebaixar ▸ Enviar para trás: Ctrl+Shift+[ e Enviar para trás: primeira da camada
- F-054 Alinhar ▸ Esquerda: três peças selecionadas, Peça › Alinhar › Esquerda: mesma borda esquerda; desabilitado com uma só
- F-055 Alinhar ▸ Centro horizontal: Alinhar › Centro horizontal: mesmo centro x
- F-056 Alinhar ▸ Direita: Alinhar › Direita: mesma borda direita
- F-057 Alinhar ▸ Topo: Alinhar › Topo: mesma borda de cima
- F-058 Alinhar ▸ Centro vertical: Alinhar › Centro vertical: mesmo centro y
- F-059 Alinhar ▸ Base: Alinhar › Base: mesma borda de baixo
- F-060 Travar peça: Travar peça marcado: arrastar não move, Girar e Apagar ficam desabilitados; desmarcar libera
- F-061 Sticky: na PCB, a placa nasce sticky e mover a placa leva as peças apoiadas; desligado não leva; a protoboard não oferece Sticky
- F-064 Mostrar/Ocultar rótulo da peça: Ocultar rótulo da peça e Mostrar rótulo da peça alternam o rótulo no quadro e o texto do item
- F-069 Ampliar: Ctrl++, Ctrl+= e Exibir › Ampliar multiplicam o zoom por 1,25 (percentual do quadro muda)
- F-070 Reduzir: Ctrl+- e Exibir › Reduzir dividem por 1,25
- F-071 Enquadrar: Ctrl+0 e Exibir › Enquadrar: todas as peças cabem no quadro
- F-072 Tamanho real: Exibir › Tamanho real: percentual 107%
- F-073 100%: Ctrl+Shift+0, Exibir › 100% e clique no percentual: 100%
- F-074 Alinhar à grade: Exibir › Alinhar à grade marcado: peça solta com o primeiro terminal na grade; desmarcado, fica onde caiu
- F-075 Mostrar grade: Exibir › Mostrar grade alterna a grade do quadro e fica gravado no .fz da vista
- F-135 Cor do fio ▸ azul: na protoboard, clique direito no fio › Cor do fio › azul: o fio fica #418dd9 e o item aparece marcado
- F-136 Cor do fio ▸ vermelho: Cor do fio › vermelho: #cc1414
- F-137 Cor do fio ▸ preto: Cor do fio › preto: #404040
- F-138 Cor do fio ▸ amarelo: Cor do fio › amarelo: #fff800
- F-139 Cor do fio ▸ verde: Cor do fio › verde: #25cc35
- F-140 Cor do fio ▸ cinza: Cor do fio › cinza: #999999
- F-141 Cor do fio ▸ branco: Cor do fio › branco: #ffffff na protoboard; o item não existe no esquemático
- F-142 Cor do fio ▸ laranja: Cor do fio › laranja: #ef6100 na protoboard e #ff7300 no esquemático
- F-143 Cor do fio ▸ ocre: Cor do fio › ocre: #a37911
- F-144 Cor do fio ▸ ciano: Cor do fio › ciano: #33ffc5
- F-145 Cor do fio ▸ marrom: Cor do fio › marrom: #8c3b00
- F-146 Cor do fio ▸ roxo: Cor do fio › roxo: #ab58a2
- F-147 Cor do fio ▸ rosa: Cor do fio › rosa: #fa50e6
- F-148 Criar fio a partir do ratsnest: na protoboard, clique direito na linha tracejada › Criar fio a partir do ratsnest: o fio aparece e a linha some
- F-149 Criar trilha a partir do ratsnest: no esquemático e na PCB, Criar trilha a partir do ratsnest: trilha ligando os dois conectores; status de roteamento sobe
- F-150 Apagar linha de ratsnest: no esquemático, Apagar linha de ratsnest: a conexão some nas três vistas (o fio da protoboard também)
- F-151 Apagar fio até as dobras: num fio com dobras, Apagar fio até as dobras: só o trecho clicado some
- F-152 Adicionar dobra: Adicionar dobra no meio do fio: o fio vira dois trechos ligados no ponto; duplo clique faz o mesmo
- F-153 Remover dobra: clique direito na dobra › Remover dobra: volta a um trecho só
- F-155 Endireitar curva: num fio curvado (Ctrl+arrastar), Endireitar curva: o fio volta a reto; desabilitado em fio reto
- F-157 Ocultar rótulo: clique direito no rótulo abre o menu da peça; Ocultar rótulo da peça some com ele
- F-249 Mover a seleção com as setas: setas movem a seleção um passo da grade (1 px sem alinhamento); Shift+setas, 10 passos
- F-250 Mover a vista com Espaço+arrastar ou o botão do meio: Espaço+arrastar e botão do meio movem a vista sem mexer nas peças
- F-251 Roda do mouse: zoom ou rolagem: roda dá zoom no ponto do cursor; Shift+roda move a vista

#### `e2e/pcb.spec.ts` (19 linhas)

- F-095 Autorotear: PCB com placa: Roteamento › Autorotear e Shift+Ctrl+A: progresso na aba Roteamento, status "Concluído"; no esquemático, fios criados; sem placa, Criar placa e rotear; com duas placas, roteia só a selecionada
- F-096 Verificar regras: Roteamento › Verificar regras e Shift+Ctrl+D: Problemas lista as violações; aproximar duas trilhas gera uma violação
- F-097 Ajustes do autorouter e do DRC…: Roteamento › Regras do autorouter e DRC… abre a aba Roteamento; mudar a largura da trilha grava no sketch e o próximo Autorotear usa a largura nova
- F-099 Preenchimento ▸ Preencher com cobre: Preenchimento de cobre › Preencher com cobre: aparecem itens de preenchimento na placa
- F-100 Preenchimento ▸ Preencher com terra: Preencher com terra: o preenchimento liga aos pads da net de terra (alívio térmico)
- F-101 Preenchimento ▸ Remover preenchimento: Remover preenchimento apaga os preenchimentos
- F-103 Preenchimento ▸ Limpar sementes: Limpar sementes de terra desmarca todas as sementes
- F-104 Preenchimento ▸ Folga do preenchimento…: aba Roteamento › Folga do cobre maior: preencher de novo deixa mais folga em volta das trilhas
- F-106 Ambas as faces clicáveis: botão Ambas: as duas faces sem esmaecer
- F-109 Mover para a outra face: trilha de cima selecionada › Roteamento › Mover trilha para a outra face: vira azul (copper0trace); pelo contexto o texto troca entre de cima e de baixo
- F-110 Não rotear automaticamente: Não rotear automaticamente marcado numa trilha: Autorotear de novo mantém essa trilha
- F-112 Selecionar todas as trilhas: Roteamento › Selecionar todas as trilhas: seleção = trilhas da vista
- F-116 Selecionar todas as vias: Selecionar todas as vias: seleção = vias
- F-117 Selecionar todos os preenchimentos: Selecionar todos os preenchimentos: seleção = preenchimentos
- F-118 Selecionar todos os fios: na protoboard, Roteamento › Selecionar todos os fios: seleção = fios
- F-130 Ocultar/Mostrar serigrafia da peça: na PCB, clique direito na peça › Ocultar serigrafia da peça: a serigrafia dela some e o item vira Mostrar
- F-131 Converter via em dobra: clique direito numa via com duas trilhas › Converter via em dobra: a via some e as trilhas se juntam
- F-132 Definir semente de preenchimento de terra: clique direito num conector › Definir semente de preenchimento de terra marcado; Preencher com terra liga esse conector
- F-154 Converter dobra em via: clique direito numa dobra de trilha › Converter dobra em via: aparece uma via no ponto

#### `e2e/export.spec.ts` (12 linhas)

- F-011 Exportar › Como imagem › PNG…: Arquivo › Exportar › Como imagem › PNG…: baixa ‹nome›.png com assinatura PNG
- F-012 Exportar › Como imagem › JPG…: JPG…: baixa ‹nome›.jpg com cabeçalho JPEG
- F-013 Exportar › Como imagem › SVG…: SVG…: baixa ‹nome›.svg com as imagens das peças embutidas
- F-015 Exportar › Para produção › Gravável (PDF)…: Para produção › Gravável (PDF)… com placa: baixa ‹nome›_etch_pdf.zip com PDFs; sem placa, item desabilitado
- F-016 Exportar › Para produção › Gravável (SVG)…: Gravável (SVG)…: baixa ‹nome›_etch_svg.zip com SVGs
- F-017 Exportar › Para produção › Gerber estendido (RS-274X)…: Gerber estendido (RS-274X)…: ‹nome›_gerber.zip com _copperTop.gtl, _copperBottom.gbl, _contour.gm1, _drill.txt e _pnp.xy; sem placa, desabilitado
- F-018 Exportar › Lista de materiais…: Lista de materiais (HTML)…: ‹nome›_bom.html lista as peças do sketch
- F-019 Exportar › Lista de materiais em CSV: Lista de materiais (CSV)…: ‹nome›_bom.csv com uma linha por grupo de peças
- F-020 Exportar › Lista de materiais em PDF: Lista de materiais (PDF)…: ‹nome›_bom.pdf começa com %PDF
- F-021 Exportar › Netlist IPC-D-356A: Netlist IPC-D-356A…: ‹nome›.ipc começa com "C  CircuitMaster" e termina com 999
- F-022 Exportar › Netlist XML…: Netlist XML…: ‹nome›_netlist.xml com uma net por grupo ligado da vista
- F-023 Exportar › Netlist SPICE…: Netlist SPICE…: ‹nome›.cir com um elemento por peça simulável e .end

#### `e2e/parts.spec.ts` (24 linhas)

- F-041 Editar (editor de peças): Peça › Editar (editor de peças): abre o editor com metadados, conectores e as vistas da peça; Cancelar fecha
- F-063 Adicionar ao bin ▸: Adicionar ao bin › Meus itens põe a peça em Meus itens; › Novo bin… pede o nome e cria o bin com ela
- F-174 Importar…: Arquivo › Abrir com um .fzpz: a peça entra em Meus itens; com um .fzbz: aparece um bin do usuário com as peças
- F-175 Novo bin…: Meus itens › Novo bin: pede o nome e o bin aparece vazio
- F-177 Apagar bin: Apagar no bin do usuário pede confirmação e o bin some
- F-178 Salvar bin: recarregar a página mantém Meus itens, os bins do usuário e as peças importadas
- F-180 Exportar bin…: Exportar .fzbz baixa ‹bin›.fzbz que reabre com as mesmas peças
- F-181 Renomear bin…: Renomear muda o título do bin e sobrevive à recarga
- F-188 Busca de peças: tecla / foca a busca; "fonte", "resistor", "555" trazem os básicos primeiro; Esc limpa
- F-190 Carregar SVG da vista: no editor, aba Protoboard › Carregar SVG… troca o desenho; SVG inválido dá mensagem
- F-198 Salvar como peça nova: Gravar peça pede o registro da revisão, cria a peça em Meus itens e, com "Trocar a peça do sketch", troca a instância mantendo as ligações; Baixar .fzpz baixa o pacote
- F-203 Mostrar ícone: aba Ícone mostra e troca o SVG do ícone
- F-204 Mostrar metadados: aba Metadados: título, autor, descrição, tags e propriedades editáveis; o título novo aparece em Meus itens depois de gravar
- F-205 Mostrar conectores: aba Conectores lista id, nome, descrição, tipo e as vistas em que cada um tem elemento
- F-206 Vistas protoboard, esquemático e PCB do editor: abas Protoboard, Esquemático e PCB mostram o SVG de cada vista
- F-209 Lista de conectores e escolha do gráfico: escolher um conector e clicar num elemento do SVG: o elemento fica realçado e o selo da vista fica verde
- F-210 Ponto terminal: botões Centro/Topo/Base/Esquerda/Direita e arrastar a marca mudam o ponto terminal; o fio novo liga nele
- F-212 Número de conectores: mudar o número de conectores de 2 para 3 cria connector2; voltar para 2 o apaga
- F-213 Tipo, nome e descrição de cada conector: trocar o tipo de um conector para female e o nome: o .fzp do Baixar .fzpz traz os valores novos
- F-216 Metadados: título, autor, descrição, rótulo, URL, família, variante, propriedades e tags: família e variante repetidas: a peça gravada recebe a próxima variant livre
- F-217 Histórico de revisões: Registrar e gravar com "O que mudou" preenchido: a entrada aparece no histórico; Gravar sem registro não acrescenta
- F-241 Trocar a peça pelas propriedades do inspetor: no inspetor de um resistor, trocar a propriedade de pacote (THT → SMD) troca a peça e mantém os fios
- F-242 Peças geradas nos sketches abertos: DIP, barra de pinos, perfboard e stripboard: abrir um exemplo com generic_ic_dip_16_300mil e generic_female_pin_header_6_100mil: as peças desenham nas três vistas com 16 e 6 conectores e ligam no netlist
- F-246 Logo de texto: logo de texto na PCB: mudar o texto no inspetor muda o desenho e a largura

#### `e2e/simulation.spec.ts` (4 linhas)

- F-237 Modo normal: DC na barra superior e Simulação › Ponto de operação (DC): o multímetro mostra o valor da tensão do ponto de operação
- F-238 Modo transitório: Transitório: gráfico no tempo, reprodução e cursor de instante
- F-239 Propriedades de simulação do projeto: doca › Ajustes: trocar o teste para Degrau e Onda quadrada e a janela em ms muda o gráfico; o valor fica gravado no .fz
- F-240 Resultados nas peças ao simular: LED aceso com brilho, fumaça com um resistor acima da potência, visor do multímetro e traço no osciloscópio no transitório

#### `e2e/samples.spec.ts` (1 linha)

- F-005 Abrir exemplo ▸: Arquivo › Exemplos › cada pasta › cada exemplo: abre sem erro de console, as três vistas desenham e o número de peças bate com o .fz

#### `e2e/ui.spec.ts` (1 linha)

- F-126 Sobre: Ajuda › Sobre o CircuitMaster abre o diálogo com os créditos; Fechar, Esc e clique fora fecham

Fora desta parte da matriz (extensões do CircuitMaster, cobertas pelos mesmos arquivos E2E mas listadas na parte própria): Exibir › Tema e Fios ortogonais, Roteamento › Apagar trilhas autoroteadas, Criar placa e rotear, Pick-and-place avulso, pontas de prova V/A/V·A, Circuitos de teste, aba Resposta, comutação no tempo, painéis Projeto e Problemas, atalhos e larguras responsivas.

## KiCad — esquemático, comuns e gerenciador de projeto

### Editor de esquemático

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KS-001 | Alinhar pela base (Align to Bottom) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Base; alinha pela caixa da seleção, não pelo item sob o cursor |
| KS-002 | Alinhar pelo centro horizontal (Align to Horizontal Center) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Centro horizontal |
| KS-003 | Alinhar pelo centro vertical (Align to Vertical Center) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Centro vertical |
| KS-004 | Alinhar à esquerda (Align to Left) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Esquerda |
| KS-005 | Alinhar à direita (Align to Right) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Direita |
| KS-006 | Alinhar pelo topo (Align to Top) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar › Topo |
| KS-007 | Alinhar itens à grade (Align Items to Grid) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: "Alinhar à grade" vale ao colocar e mover, sem comando sobre a seleção |
| KS-008 | Adicionar variante de projeto (Add Design Variant...) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-009 | Anotar esquemático (Annotate Schematic...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-010 | Anotar automaticamente (Annotate Automatically) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: peça nova ou colada já recebe título único (R1, R2…), sem chave para desligar |
| KS-011 | Atribuir footprints (ferramenta) (Assign Footprints...) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: troca de encapsulamento pela propriedade package no inspetor |
| KS-012 | Limpar realce de net (Clear Net Highlighting) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-013 | Copiar desenho da folha para a área de transferência (Export Drawing to Clipboard) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: Exportar › Como imagem grava arquivo |
| KS-014 | Editar símbolo da biblioteca (Edit Library Symbol...) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: o editor de peças grava uma peça nova em Meus itens, a do acervo não muda |
| KS-015 | Editar número de página da folha (Edit Sheet Page Number...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-016 | Tabela de campos dos símbolos (edição em massa) (Bulk Edit Symbol Fields...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-017 | Editar vínculos com a biblioteca em massa (Bulk Edit Symbol Library Links...) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-018 | Editar no editor de símbolos (Edit with Symbol Editor) | KiCad › Schematic Editor | feita | 0 | e2e/parts.spec.ts | "Editar (editor de peças)" no menu da peça; gravar pode trocar a peça do sketch |
| KS-019 | Exportar netlist (Export Netlist...) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: netlist XML do Fritzing, SPICE e IPC-D-356A; faltam KiCad, OrcadPCB2, Allegro, PADS e CadStar |
| KS-020 | Exportar símbolos do esquemático para biblioteca (Export Symbols...) | KiCad › Schematic Editor | falta | 5 | — | parcial: "Adicionar ao bin" e exportar o bin como .fzbz |
| KS-021 | Gerar lista de materiais (Generate Bill of Materials...) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: BOM fixa em HTML, CSV e PDF, sem escolha de campos, agrupamento nem predefinições |
| KS-022 | Gerar lista de materiais com gerador externo (Generate Bill of Materials (External)...) | KiCad › Schematic Editor | não se aplica | — | — | roda script do sistema (Python/XSLT); a BOM com campos e predefinições substitui |
| KS-023 | Gerar lista de materiais legada (Generate Legacy Bill of Materials...) | KiCad › Schematic Editor | não se aplica | — | — | gerador legado do KiCad; a BOM com campos e predefinições substitui |
| KS-024 | Realçar net sob o cursor (Highlight Net) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: o realce sob o cursor cobre só a cadeia do fio |
| KS-025 | Ferramenta de realce de nets (Highlight Nets) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-026 | Importar atribuições de footprint (.cmp) (Import Footprint Assignments...) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-027 | Importar gráficos (DXF/SVG) (Import Graphics...) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-028 | Incrementar anotações a partir de um símbolo (Increment Annotations From...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-029 | Modo de linha horizontal, vertical ou 45° (Line Mode for Wires and Buses) | KiCad › Schematic Editor | falta | 8 | — | parcial: 45° só na PCB |
| KS-030 | Modo de linha em qualquer ângulo (Line Mode for Wires and Buses) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | Exibir › Fios ortogonais desligado |
| KS-031 | Alternar para o próximo modo de linha (Line Mode for Wires and Buses) | KiCad › Schematic Editor | falta | 8 | — | parcial: liga e desliga em Exibir › Fios ortogonais, sem atalho nem ciclo de três modos |
| KS-032 | Modo de linha só horizontal e vertical (Line Mode for Wires and Buses) | KiCad › Schematic Editor | feita | 0 | tests/path.test.ts | Fios ortogonais (90°), padrão no esquemático |
| KS-033 | Marcar itens excluídos da simulação (Mark items excluded from simulation) | KiCad › Schematic Editor | falta | 9 | — | parcial: peças fora da simulação ficam acinzentadas (spec 04 §8.1) |
| KS-034 | Próximo item da net (Next Net Item) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-035 | Próxima unidade do símbolo (Next Symbol Unit) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-036 | Item anterior da net (Previous Net Item) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-037 | Unidade anterior do símbolo (Previous Symbol Unit) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-038 | Remapear símbolos de bibliotecas legadas (Remap Legacy Library Symbols...) | KiCad › Schematic Editor | falta | 16 | — | P3; só esquemáticos legados (.sch do KiCad 5) |
| KS-039 | Remover variante de projeto (Remove Design Variant...) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-040 | Resgatar símbolos (Rescue Symbols...) | KiCad › Schematic Editor | falta | 16 | — | P3; símbolos de esquemáticos legados com biblioteca cache |
| KS-041 | Salvar cópia da folha atual como (Save Current Sheet Copy As...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-042 | Configuração do esquemático (Schematic Setup...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-043 | Selecionar na PCB (seleção cruzada) (Select on PCB) | KiCad › Schematic Editor | feita | 2 | e2e/navigation.spec.ts | Peça › Ver na PCB: a mesma seleção, centralizada (as três vistas compartilham o documento) |
| KS-044 | Não montar (DNP) (Do not Populate) | KiCad › Schematic Editor | falta | 15 | — | P2; variantes |
| KS-045 | Excluir da lista de materiais (Exclude from Bill of Materials) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-046 | Excluir da placa (Exclude from Board) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-047 | Excluir da simulação (Exclude from Simulation) | KiCad › Schematic Editor | falta | 9 | — | — |
| KS-048 | Mostrar rótulos de diretiva (Show Directive Labels) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-049 | Mostrar erros do ERC (Show ERC Errors) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-050 | Mostrar exclusões do ERC (Show ERC Exclusions) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-051 | Mostrar avisos do ERC (Show ERC Warnings) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-052 | Mostrar campos ocultos (Show Hidden Fields) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-053 | Mostrar pinos ocultos (Show Hidden Pins) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-054 | Navegador de nets (Net Navigator) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: painel Projeto lista os nós com os pinos e a tensão, sem realce nem navegação |
| KS-055 | Mostrar correntes do ponto de operação (Show OP Currents) | KiCad › Schematic Editor | falta | 9 | — | parcial: corrente nas pontas de prova e no inspetor da peça, não sobre cada fio |
| KS-056 | Mostrar tensões do ponto de operação (Show OP Voltages) | KiCad › Schematic Editor | falta | 9 | — | parcial: tensão de cada nó no painel Projeto e nas pontas de prova, não sobre o esquemático |
| KS-057 | Ir para o editor de PCB (Switch to PCB Editor) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | aba PCB (Ctrl+3) |
| KS-058 | Simulador (Simulator) | KiCad › Schematic Editor | feita | 0 | e2e/simulation.spec.ts | doca de simulação (Medidas, Resposta, Ajustes) |
| KS-059 | Mostrar ícones de funções alternativas de pino (Show Pin Alternate Icons) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-060 | Navegador de hierarquia (Hierarchy Navigator) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-061 | Verificador de símbolos (Symbol Checker) | KiCad › Schematic Editor | falta | 5 | — | P1; editor de símbolos |
| KS-062 | Comparar símbolo com a biblioteca (Compare Symbol with Library) | KiCad › Schematic Editor | falta | 8 | — | as peças desatualizadas do Fritzing entram na fase 3 |
| KS-063 | Verificador de regras elétricas (ERC) (Electrical Rules Checker) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: Problemas lista ligações pendentes |
| KS-064 | Ajuda da sintaxe de barramentos (Show Bus Syntax Help) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-065 | Decrementar campo primário (Decrement Primary) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-066 | Decrementar campo secundário (Decrement Secondary) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-067 | Incrementar (Increment) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-068 | Incrementar campo primário (Increment Primary) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-069 | Incrementar campo secundário (Increment Secondary) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-070 | Posicionar todos os pinos de folha (Autoplace All Sheet Pins) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-071 | Fechar contorno (Close Outline) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-072 | Apagar último ponto (Delete Last Point) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: Backspace tira a última dobra do fio em desenho |
| KS-073 | Desenhar arcos (Draw Arcs) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-074 | Desenhar curva de Bézier (Draw Bezier Curve) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: fio curvo (Bézier) existe, não como gráfico |
| KS-075 | Desenhar círculos (Draw Circles) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-076 | Desenhar retângulos (Draw Rectangles) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-077 | Desenhar áreas de regra (Draw Rule Areas) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-078 | Desenhar folhas hierárquicas (Draw Hierarchical Sheets) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-079 | Desenhar folha a partir de bloco de projeto (Draw Sheet from Design Block) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-080 | Desenhar folha a partir de arquivo (Draw Sheet from File) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-081 | Desenhar tabelas (Draw Tables) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-082 | Desenhar caixas de texto (Draw Text Boxes) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: notas (Editar › Adicionar nota) |
| KS-083 | Importar folha (Import Sheet...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-084 | Colocar entradas de barramento (Place Wire to Bus Entries) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-085 | Colocar rótulos de diretiva (Place Directive Labels) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-086 | Colocar bloco de projeto (Place Design Block) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-087 | Colocar rótulos globais (Place Global Labels) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: o net label do Fritzing liga pelo nome em todo o sketch, que tem uma folha só |
| KS-088 | Colocar rótulos hierárquicos (Place Hierarchical Labels) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-089 | Colocar imagens (Place Images) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-090 | Colocar junções (Place Junctions) | KiCad › Schematic Editor | falta | 8 | — | parcial: terminar um fio no meio de outro cria a junção em T |
| KS-091 | Colocar rótulos de net (Place Net Labels) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | net label do Fritzing, liga pelo texto (core/Netlist) |
| KS-092 | Colocar bloco de projeto vinculado (Place Linked Design Block) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-093 | Colocar a próxima unidade do símbolo (Place Next Symbol Unit) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-094 | Colocar marcas de não conectado (Place No Connect Flags) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-095 | Colocar símbolos de alimentação (Place Power Symbols) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | alimentação e terra do Fritzing, ligam pela tensão (core/Netlist) |
| KS-096 | Escrever texto (Draw Text) | KiCad › Schematic Editor | falta | 8 | — | P2; parcial: notas |
| KS-097 | Colocar pinos a partir dos rótulos da folha (Place Pins from Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-098 | Colocar símbolos (Place Symbols) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | painel Peças: clique e clique no quadro, arraste ou duplo clique |
| KS-099 | Salvar no bloco de projeto vinculado (Save to Linked Design Block) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-100 | Sincronizar todos os pinos de folha (Sync All Sheet Pins...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-101 | Sincronizar os pinos de folha selecionados (Sync Selected Sheet Pins...) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-102 | Desenhar barramentos (Draw Buses) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-103 | Desenhar linhas gráficas (Draw Lines) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-104 | Desenhar fios (Draw Wires) | KiCad › Schematic Editor | feita | 0 | tests/engine.test.ts, e2e/circuit.spec.ts | fio por cliques de terminal a terminal |
| KS-105 | Trocar a postura do trecho (Switch Segment Posture) | KiCad › Schematic Editor | falta | 8 | — | parcial: o caminho ortogonal sai e chega pela direção dos pinos, sem troca manual |
| KS-106 | Desfazer o último trecho (Undo Last Segment) | KiCad › Schematic Editor | feita | 0 | e2e/circuit.spec.ts | Backspace tira a última dobra do fio em desenho |
| KS-107 | Desdobrar do barramento (Unfold from Bus) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-108 | Atribuir classe de net (Assign Netclass...) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-109 | Posicionar campos automaticamente (Autoplace Fields) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-110 | Quebrar em trechos ligados (Break) | KiCad › Schematic Editor | feita | 0 | tests/edit.test.ts | Adicionar dobra divide o fio em dois trechos ligados |
| KS-111 | Trocar símbolo (Change Symbol...) | KiCad › Schematic Editor | falta | 8 | — | parcial: troca dentro da família pelas propriedades do inspetor (swap do Fritzing) |
| KS-112 | Trocar símbolos em massa (Change Symbols...) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-113 | Limpar pinos de folha sem uso (Cleanup Sheet Pins) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-114 | Converter pinos sobrepostos em pino empilhado (Convert Stacked Pins) | KiCad › Schematic Editor | falta | 5 | — | editor de símbolos |
| KS-115 | Editar footprint (Edit Footprint…) | KiCad › Schematic Editor | falta | 8 | — | P1; parcial: propriedade package no inspetor |
| KS-116 | Editar designador de referência (Edit Reference Designator...) | KiCad › Schematic Editor | feita | 0 | e2e/ui.spec.ts | campo Nome do inspetor |
| KS-117 | Editar propriedades de texto e gráficos em massa (Edit Text & Graphics Properties...) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-118 | Editar valor (Edit Value…) | KiCad › Schematic Editor | feita | 0 | e2e/ui.spec.ts | cartão de valor rápido e inspetor |
| KS-119 | Desempilhar pino (Explode Stacked Pin) | KiCad › Schematic Editor | falta | 5 | — | editor de símbolos |
| KS-120 | Localizar no navegador de nets (Find in Net Navigator) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-121 | Espelhar horizontalmente (Mirror Horizontally) | KiCad › Schematic Editor | feita | 0 | tests/edit.test.ts, e2e/edit.spec.ts | atalho \| |
| KS-122 | Espelhar verticalmente (Mirror Vertically) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | menu da peça |
| KS-123 | Tabela de pinos (Pin Table...) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: aba Conectores do editor de peças lista nome, descrição e tipo |
| KS-124 | Propriedades (Properties…) | KiCad › Schematic Editor | feita | 0 | e2e/ui.spec.ts | inspetor › Propriedades |
| KS-125 | Repetir o último item (Repeat Last Item) | KiCad › Schematic Editor | falta | 8 | — | parcial: Duplicar (Ctrl+D), sem passo nem incremento de rótulo |
| KS-126 | Girar no sentido anti-horário (Rotate Counterclockwise) | KiCad › Schematic Editor | feita | 0 | tests/engine.test.ts, e2e/edit.spec.ts | [ gira 90° |
| KS-127 | Girar no sentido horário (Rotate Clockwise) | KiCad › Schematic Editor | feita | 0 | tests/engine.test.ts, e2e/edit.spec.ts | ] gira 90° |
| KS-128 | Fatiar em trechos desligados (Slice) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-129 | Trocar posições (Swap) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-130 | Trocar rótulos entre pinos (Swap Pin Labels) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-131 | Trocar pinos (Swap Pins) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-132 | Trocar rótulos entre unidades (Swap Unit Labels) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-133 | Propriedades do símbolo (Symbol Properties...) | KiCad › Schematic Editor | feita | 0 | e2e/ui.spec.ts | inspetor › Propriedades |
| KS-134 | Converter em rótulo de diretiva (Change to Directive Label) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-135 | Converter em rótulo global (Change to Global Label) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-136 | Converter em rótulo hierárquico (Change to Hierarchical Label) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-137 | Converter em rótulo local (Change to Label) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-138 | Converter em texto (Change to Text) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-139 | Converter em caixa de texto (Change to Text Box) | KiCad › Schematic Editor | falta | 8 | — | P2 |
| KS-140 | Alternar estilo de corpo (De Morgan) (Cycle Body Style) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-141 | Atualizar símbolo pela biblioteca (Update Symbol...) | KiCad › Schematic Editor | falta | 8 | — | as peças desatualizadas do Fritzing entram na fase 3 |
| KS-142 | Atualizar símbolos pela biblioteca (Update Symbols from Library...) | KiCad › Schematic Editor | falta | 8 | — | as peças desatualizadas do Fritzing entram na fase 3 |
| KS-143 | Arrastar mantendo as ligações (Drag) | KiCad › Schematic Editor | feita | 0 | tests/path.test.ts | mover a peça leva os fios junto |
| KS-144 | Mover (Move) | KiCad › Schematic Editor | feita | 0 | e2e/edit.spec.ts | arraste e setas; aqui os fios sempre acompanham (o Move do KiCad solta as ligações) |
| KS-145 | Selecionar ou expandir conexão (Select/Expand Connection) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-146 | Selecionar nó (Select Node) | KiCad › Schematic Editor | falta | 8 | — | — |
| KS-147 | Voltar no histórico de folhas (Navigate Back) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-148 | Trocar de folha (Change Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-149 | Entrar na folha (Enter Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-150 | Avançar no histórico de folhas (Navigate Forward) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-151 | Sair da folha (Leave Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-152 | Próxima folha (Next Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-153 | Folha anterior (Previous Sheet) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-154 | Subir na hierarquia (Navigate Up) | KiCad › Schematic Editor | falta | 8 | — | P1 |
| KS-155 | Copiar comprimento do pino para os demais (Push Pin Length) | KiCad › Schematic Editor | falta | 5 | — | editor de símbolos |
| KS-156 | Copiar tamanho do nome do pino para os demais (Push Pin Name Size) | KiCad › Schematic Editor | falta | 5 | — | editor de símbolos |
| KS-157 | Copiar tamanho do número do pino para os demais (Push Pin Number Size) | KiCad › Schematic Editor | falta | 5 | — | editor de símbolos |
| KS-158 | Criar canto (Create Corner) | KiCad › Schematic Editor | feita | 0 | tests/edit.test.ts | Adicionar dobra (menu do fio ou duplo clique) |
| KS-159 | Remover canto (Remove Corner) | KiCad › Schematic Editor | feita | 0 | tests/edit.test.ts | Remover dobra |
| KS-160 | Painel de símbolos remotos (Remote Symbols) | KiCad › Schematic Editor | falta | 5 | — | P3; bibliotecas por HTTP |
| KS-161 | Apagar bloco de projeto (Delete Design Block) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-162 | Propriedades do bloco de projeto (Properties…) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-163 | Salvar seleção como bloco de projeto (Save Selection as Design Block...) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-164 | Salvar folha atual como bloco de projeto (Save Current Sheet as Design Block...) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-165 | Painel de blocos de projeto (Design Blocks) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-166 | Atualizar bloco de projeto pela seleção (Update Design Block from Selection) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-167 | Atualizar bloco de projeto pela folha atual (Update Design Block from Current Sheet) | KiCad › Schematic Editor | falta | 15 | — | P2 |
| KS-168 | Sinais definidos pelo usuário (expressões) (User-defined Signals...) | KiCad › Schematic Editor | falta | 9 | — | P1 |
| KS-169 | Nova aba de análise (New Analysis Tab...) | KiCad › Schematic Editor | falta | 9 | — | P1; parcial: DC ou transitório no seletor, sem abas nem varredura DC, AC ou FFT |
| KS-170 | Abrir workbook de simulação (Open Workbook...) | KiCad › Schematic Editor | falta | 9 | — | P2 |
| KS-171 | Ponta de prova no esquemático (Probe Schematic...) | KiCad › Schematic Editor | feita | 0 | tests/probe.test.ts, e2e/simulation.spec.ts | ferramentas V, A e V·A |
| KS-172 | Simular (Run Simulation) | KiCad › Schematic Editor | feita | 0 | tests/bench.test.ts, e2e/circuit.spec.ts | botão Simular |
| KS-173 | Salvar workbook (Save Workbook) | KiCad › Schematic Editor | falta | 9 | — | P2; parcial: pontas e ajustes vão no .fz como propriedades de projeto |
| KS-174 | Salvar workbook como (Save Workbook As...) | KiCad › Schematic Editor | falta | 9 | — | P2 |
| KS-175 | Mostrar netlist SPICE (Show SPICE Netlist) | KiCad › Schematic Editor | falta | 9 | — | parcial: Exportar › Netlist SPICE grava o arquivo |
| KS-176 | Editar aba de análise (Edit Analysis Tab...) | KiCad › Schematic Editor | falta | 9 | — | P1; parcial: aba Ajustes edita o teste do transitório e as opções do SPICE |
| KS-177 | Parar simulação (Stop Simulation) | KiCad › Schematic Editor | feita | 0 | e2e/simulation.spec.ts | Simulação › Parar a simulação |
| KS-178 | Afinar valor (Add Tuned Value...) | KiCad › Schematic Editor | falta | 9 | — | P1; parcial: o cartão de valor rápido muda o valor e o transitório continua |
| KS-179 | Exportar gráfico como CSV (Export Current Plot as CSV...) | KiCad › Schematic Editor | falta | 9 | — | P1 |
| KS-180 | Exportar gráfico como PNG (Export Current Plot as PNG...) | KiCad › Schematic Editor | falta | 9 | — | P1 |
| KS-181 | Exportar gráfico para o esquemático (Export Current Plot to Schematic) | KiCad › Schematic Editor | falta | 9 | — | — |
| KS-182 | Copiar gráfico para a área de transferência (Export Current Plot to Clipboard) | KiCad › Schematic Editor | falta | 9 | — | — |
| KS-183 | Gráficos com fundo escuro (Dark Mode Plots) | KiCad › Schematic Editor | falta | 9 | — | parcial: o gráfico segue o tema do app |
| KS-184 | Corrente e fase pontilhadas (Dotted Current/Phase) | KiCad › Schematic Editor | falta | 9 | — | parcial: só a corrente da ponta V·A sai tracejada |
| KS-185 | Mostrar legenda (Show Legend) | KiCad › Schematic Editor | falta | 9 | — | parcial: as fichas coloridas das curvas fazem de legenda, sem alternar |
| KS-186 | Mostrar console da simulação (Show Simulation Console Panel) | KiCad › Schematic Editor | falta | 9 | — | parcial: a doca mostra o erro do ngspice |
| KS-187 | Mostrar painel lateral da simulação (Show Simulation Side Panel) | KiCad › Schematic Editor | falta | 9 | — | parcial: aba Medidas com curvas, cursor e estatísticas; recolher a doca esconde também o gráfico |
| KS-188 | Desenhar linhas no editor de símbolos (Draw Lines) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: a arte vem de um SVG carregado no editor de peças |
| KS-189 | Desenhar polígonos no editor de símbolos (Draw Polygons) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: a arte vem de um SVG carregado no editor de peças |
| KS-190 | Desenhar caixas de texto no editor de símbolos (Draw Text Boxes) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-191 | Mover a âncora do símbolo (Move Symbol Anchor) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-192 | Desenhar pinos (Draw Pins) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: o editor de peças cria conectores e liga cada um a um elemento do SVG |
| KS-193 | Escrever texto no editor de símbolos (Draw Text) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-194 | Adicionar o símbolo ao esquemático (Add Symbol to Schematic) | KiCad › Schematic Editor | falta | 5 | — | parcial: gravar a peça pode trocar a do sketch; Meus itens coloca no quadro |
| KS-195 | Copiar símbolo na biblioteca (Copy) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-196 | Recortar símbolo na biblioteca (Cut) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-197 | Apagar símbolo da biblioteca (Delete Symbol) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-198 | Derivar de símbolo existente (Derive from Existing Symbol...) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: o editor grava uma cópia como peça nova, sem herança |
| KS-199 | Duplicar símbolo (Duplicate Symbol) | KiCad › Schematic Editor | falta | 5 | — | parcial: o editor grava uma cópia como peça nova |
| KS-200 | Editar símbolo (Edit Symbol) | KiCad › Schematic Editor | falta | 5 | — | P1; parcial: editor de peças aberto a partir da peça do sketch |
| KS-201 | Exportar símbolo para biblioteca nova (Export…) | KiCad › Schematic Editor | falta | 5 | — | parcial: Baixar .fzpz no editor de peças |
| KS-202 | Exportar símbolo como SVG (Export Symbol as SVG…) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-203 | Exportar vista do editor de símbolos como PNG (Export View as PNG…) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-204 | Achatar símbolo (remover herança) (Flatten Symbol) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-205 | Importar símbolo (Import Symbol...) | KiCad › Schematic Editor | falta | 5 | — | parcial: abrir .fzpz instala a peça |
| KS-206 | Novo símbolo (New Symbol...) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-207 | Mostrar o próximo símbolo (Display next symbol) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-208 | Colar símbolo na biblioteca (Paste Symbol) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-209 | Mostrar o símbolo anterior (Display previous symbol) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-210 | Renomear símbolo (Rename Symbol...) | KiCad › Schematic Editor | falta | 5 | — | parcial: título nos metadados do editor de peças |
| KS-211 | Salvar biblioteca como (Save Library As...) | KiCad › Schematic Editor | falta | 5 | — | parcial: Exportar .fzbz do bin |
| KS-212 | Salvar símbolo como (Save As…) | KiCad › Schematic Editor | falta | 5 | — | parcial: gravar a peça cria uma nova em Meus itens |
| KS-213 | Salvar cópia do símbolo como (Save Copy As...) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-214 | Mostrar tipos elétricos dos pinos (Show Pin Electrical Types) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-215 | Mostrar campos ocultos no editor de símbolos (Show Hidden Fields) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-216 | Mostrar pinos ocultos no editor de símbolos (Show Hidden Pins) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-217 | Editar campos dos símbolos da biblioteca em massa (Bulk Edit Symbol Fields...) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-218 | Mostrar números dos pinos (Show Pin Numbers) | KiCad › Schematic Editor | falta | 5 | — | — |
| KS-219 | Editar campos dos símbolos relacionados em massa (Bulk Edit Related Symbol Fields...) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-220 | Modo de pinos sincronizados entre unidades (Synchronized Pins Mode) | KiCad › Schematic Editor | falta | 5 | — | P1 |
| KS-221 | Atualizar campos pelo símbolo pai (Update Symbol Fields...) | KiCad › Schematic Editor | falta | 5 | — | P1 |

### Ações comuns

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KC-001 | Fechar documento (Close) | KiCad › Common | feita | 2 | e2e/ui.spec.ts | Arquivo › Fechar sketch e o × da aba; pergunta só com alterações |
| KC-002 | Sair do KiCad (Quit) | KiCad › Common | não se aplica | — | — | fecha-se a aba do navegador |
| KC-003 | Recarregar plugins (Refresh Plugins) | KiCad › Common | falta | 16 | — | P3; API de extensões no lugar dos plugins Python |
| KC-004 | Excluir violação marcada (Exclude Marker) | KiCad › Common | falta | 8 | — | P1; exclusões do ERC (as do DRC na fase 10) |
| KC-005 | Próximo marcador (Next Marker) | KiCad › Common | falta | 8 | — | P1; parcial: Problemas leva até cada item do DRC |
| KC-006 | Marcador anterior (Previous Marker) | KiCad › Common | falta | 8 | — | P1; parcial: Problemas leva até cada item do DRC |
| KC-007 | Adicionar biblioteca existente (Add Library…) | KiCad › Common | falta | 5 | — | P1; parcial: abrir .fzbz importa um bin |
| KC-008 | Centralizar texto (Center Justify) | KiCad › Common | falta | 8 | — | — |
| KC-009 | Centralizar a vista na seleção (Pan to Center Selected Objects) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Centralizar na seleção |
| KC-010 | Recolher tudo (Collapse All) | KiCad › Common | falta | 5 | — | parcial: as seções do acervo abrem e fecham uma a uma |
| KC-011 | Cursor em cruz a 45° (45 Degree Crosshairs) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Cursor › A 45° |
| KC-012 | Clique pelo teclado (Click) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Enter clica no cursor do teclado |
| KC-013 | Duplo clique pelo teclado (Double-click) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | End dá duplo clique no cursor; durante o fio, termina com a ponta solta |
| KC-014 | Cursor para baixo (Cursor Down) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | ↓ sem seleção move o cursor um passo de grade (com seleção, move a seleção, como no Fritzing) |
| KC-015 | Cursor para baixo rápido (Cursor Down Fast) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+↓: 10 passos de grade |
| KC-016 | Cursor em cruz na janela toda (Full-Window Crosshairs) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Cursor › Na janela toda |
| KC-017 | Cursor para a esquerda (Cursor Left) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | ← sem seleção move o cursor um passo de grade |
| KC-018 | Cursor para a esquerda rápido (Cursor Left Fast) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+←: 10 passos de grade |
| KC-019 | Cursor para a direita (Cursor Right) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | → sem seleção move o cursor um passo de grade |
| KC-020 | Cursor para a direita rápido (Cursor Right Fast) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+→: 10 passos de grade |
| KC-021 | Cursor em cruz pequeno (Small crosshairs) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Cursor › Pequeno (padrão) |
| KC-022 | Cursor para cima (Cursor Up) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | ↑ sem seleção move o cursor um passo de grade |
| KC-023 | Cursor para cima rápido (Cursor Up Fast) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+↑: 10 passos de grade |
| KC-024 | Definir origem da grade (Grid Origin...) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | campo "Origem da grade" (x, y na unidade escolhida) na aba Documento |
| KC-025 | Editar grades (Edit Grids...) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Grade › Editar grades… (lista de cada vista nas Preferências) |
| KC-026 | Expandir tudo (Expand All) | KiCad › Common | falta | 5 | — | parcial: as seções do acervo abrem e fecham uma a uma |
| KC-027 | Grade rápida 1 (Switch to Fast Grid 1) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Alt+1: a primeira grade da lista da vista |
| KC-028 | Grade rápida 2 (Switch to Fast Grid 2) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Alt+2: a segunda grade da lista da vista |
| KC-029 | Alternar grade rápida (Cycle Fast Grid) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Alt+4 alterna entre as duas grades rápidas |
| KC-030 | Próxima grade (Switch to Next Grid) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | N e Exibir › Grade › Próxima grade |
| KC-031 | Grade anterior (Switch to Previous Grid) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Shift+N e Exibir › Grade › Grade anterior |
| KC-032 | Restaurar origem da grade (Reset Grid Origin) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Grade › Restaurar a origem da grade |
| KC-033 | Colocar origem da grade (Grid Origin) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Grade › Colocar a origem da grade (clique no quadro) ou Origem da grade no cursor; peças, fios e os pontos da grade partem dela |
| KC-034 | Ocultar árvore de bibliotecas (Hide Library Tree) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | o botão do painel aberto no trilho o recolhe (tela larga) e Exibir › Painel da esquerda |
| KC-035 | Camadas inativas normais ou esmaecidas (Inactive Layer View Mode) | KiCad › Common | falta | 10 | — | parcial: Ambas/Topo/Base esmaece a outra face de cobre |
| KC-036 | Camadas inativas normais, esmaecidas ou ocultas (Inactive Layer View Mode (3-state)) | KiCad › Common | falta | 10 | — | parcial: Ambas/Topo/Base esmaece a outra face de cobre |
| KC-037 | Unidade polegadas (Inches) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Unidades › Polegadas; coordenadas do cursor na barra de status |
| KC-038 | Alinhar texto à esquerda (Left Justify) | KiCad › Common | falta | 8 | — | — |
| KC-039 | Focar a busca da biblioteca (Focus Library Tree Search Field) | KiCad › Common | feita | 0 | e2e/parts.spec.ts | tecla / |
| KC-040 | Encaixar só em objetos da camada ativa (Snap to Objects on the Active Layer Only) | KiCad › Common | falta | 10 | — | — |
| KC-041 | Encaixar em objetos de todas as camadas (Snap to Objects on All Layers) | KiCad › Common | falta | 10 | — | parcial: encaixe magnético nos terminais |
| KC-042 | Alternar encaixe entre camada ativa e todas (Toggle Snapping Between Active and All Layers) | KiCad › Common | falta | 10 | — | — |
| KC-043 | Unidade milímetros (Millimeters) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Unidades › Milímetros (padrão) |
| KC-044 | Unidade mils (Mils) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Unidades › Mils |
| KC-045 | Novo (New...) | KiCad › Common | feita | 0 | e2e/circuit.spec.ts | Arquivo › Novo (Ctrl+N) |
| KC-046 | Nova biblioteca (New Library…) | KiCad › Common | falta | 5 | — | P1; parcial: Novo bin |
| KC-047 | Abrir (Open...) | KiCad › Common | feita | 0 | tests/sketch.test.ts, e2e/circuit.spec.ts | .fzz, .fz, .fzpz, .fzb e .fzbz; arquivos KiCad na fase 6 |
| KC-048 | Abrir no explorador de arquivos (Open in file explorer...) | KiCad › Common | não se aplica | — | — | o navegador não abre o explorador do sistema |
| KC-049 | Editar num editor de texto (Edit in a Text Editor...) | KiCad › Common | não se aplica | — | — | o navegador não abre programas do sistema |
| KC-050 | Configurar página (papel e carimbo) (Page Settings...) | KiCad › Common | falta | 15 | — | P3; folha de desenho; o Page Setup de impressão do Fritzing fica na fase 3 |
| KC-051 | Mover a vista para baixo (Pan Down) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Shift+↓ sem seleção move a vista um quarto da janela |
| KC-052 | Mover a vista para a esquerda (Pan Left) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Shift+← sem seleção move a vista |
| KC-053 | Mover a vista para a direita (Pan Right) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Shift+→ sem seleção move a vista |
| KC-054 | Mover a vista para cima (Pan Up) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Shift+↑ sem seleção move a vista |
| KC-055 | Fixar biblioteca no topo (Pin Library) | KiCad › Common | falta | 5 | — | — |
| KC-056 | Plotar (Plot...) | KiCad › Common | falta | 8 | — | P2; parcial: Exportar › Como imagem (PNG, JPG, SVG, PDF) da vista; faltam DXF, HPGL e as opções de plotagem |
| KC-057 | Imprimir (Print...) | KiCad › Common | falta | 3 | — | Print do Fritzing (§10) |
| KC-058 | Fechar o editor (Quit) | KiCad › Common | não se aplica | — | — | fecha-se a aba do navegador |
| KC-059 | Refazer o último zoom (Redo Last Zoom) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Refazer o último zoom |
| KC-060 | Zerar coordenadas relativas (Reset Local Coordinates) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Espaço zera as coordenadas relativas (dX, dY) no cursor; segurado, ainda arrasta a vista |
| KC-061 | Reverter (Revert) | KiCad › Common | falta | 3 | — | Revert do Fritzing (§10) |
| KC-062 | Alinhar texto à direita (Right Justify) | KiCad › Common | falta | 8 | — | — |
| KC-063 | Salvar (Save) | KiCad › Common | feita | 0 | tests/sketch.test.ts, e2e/circuit.spec.ts | baixa o .fzz |
| KC-064 | Salvar tudo (Save All) | KiCad › Common | feita | 2 | e2e/ui.spec.ts | Arquivo › Salvar todos (com mais de uma aba) baixa o .fzz de cada sketch alterado |
| KC-065 | Salvar como (Save As…) | KiCad › Common | falta | 3 | — | Save As do Fritzing (§10) |
| KC-066 | Salvar uma cópia (Save a Copy...) | KiCad › Common | falta | 3 | — | — |
| KC-067 | Escolher colunas (Select Columns...) | KiCad › Common | falta | 5 | — | árvore de bibliotecas |
| KC-068 | Visualizador 3D (3D Viewer) | KiCad › Common | falta | 12 | — | P1 |
| KC-069 | Calculadora (Calculator Tools) | KiCad › Common | falta | 10 | — | P1 |
| KC-070 | Mostrar menu de contexto (Show Context Menu) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | botão direito sobre peça, fio ou ratsnest |
| KC-071 | Abrir datasheet (Show Datasheet) | KiCad › Common | falta | 5 | — | — |
| KC-072 | Navegador de bibliotecas de footprints (Footprint Library Browser) | KiCad › Common | falta | 5 | — | P1 |
| KC-073 | Editor de footprints (Footprint Editor) | KiCad › Common | falta | 5 | — | P1; parcial: o editor de peças edita a vista PCB (SVG e terminais) |
| KC-074 | Árvore de bibliotecas (Library Tree) | KiCad › Common | feita | 0 | e2e/ui.spec.ts | painel Peças pelo trilho |
| KC-075 | Ir para o gerenciador de projeto (Switch to Project Manager) | KiCad › Common | falta | 6 | — | — |
| KC-076 | Painel de propriedades (Properties) | KiCad › Common | feita | 0 | e2e/ui.spec.ts | inspetor à direita |
| KC-077 | Navegador de bibliotecas de símbolos (Symbol Library Browser) | KiCad › Common | falta | 5 | — | P1; parcial: o painel Peças navega o acervo do Fritzing |
| KC-078 | Editor de símbolos (Symbol Editor) | KiCad › Common | falta | 5 | — | P1; parcial: editor de peças do Fritzing (.fzp) |
| KC-079 | Desenhar caixas delimitadoras (Draw Bounding Boxes) | KiCad › Common | não se aplica | — | — | auxílio de depuração do KiCad |
| KC-080 | Sempre mostrar o cursor em cruz (Always Show Crosshairs) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Cursor › Sempre mostrar o cursor em cruz (sem isso, aparece com o cursor do teclado) |
| KC-081 | Mostrar grade (Show Grid) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Exibir › Mostrar grade |
| KC-082 | Grade por tipo de objeto (Grid Overrides) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Preferências › Grade das peças e Grade dos fios sobrepõem a grade da vista |
| KC-083 | Coordenadas polares (Polar Coordinates) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Unidades › Coordenadas polares: r e θ no lugar de dX e dY |
| KC-084 | Alternar unidades (Switch units) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+U alterna milímetros e polegadas |
| KC-085 | Desfazer o último zoom (Undo Last Zoom) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Desfazer o último zoom (50 por vista) |
| KC-086 | Desafixar biblioteca (Unpin Library) | KiCad › Common | falta | 5 | — | — |
| KC-087 | Atualizar a PCB pelo esquemático (Update PCB from Schematic…) | KiCad › Common | feita | 0 | tests/engine.test.ts | automático: as três vistas compartilham o grafo |
| KC-088 | Atualizar o esquemático pela PCB (Update Schematic from PCB...) | KiCad › Common | feita | 0 | tests/engine.test.ts | automático: as três vistas compartilham o grafo |
| KC-089 | Centralizar no cursor (Center on Cursor) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | F4 e Exibir › Centralizar no cursor |
| KC-090 | Zoom em todos os objetos (Zoom to All Objects) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Exibir › Enquadrar (Ctrl+0) |
| KC-091 | Enquadrar (Zoom to Fit) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Enquadrar; não há folha de desenho |
| KC-092 | Zoom na seleção (Zoom to Selected Objects) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Exibir › Zoom na seleção |
| KC-093 | Ampliar no cursor (Zoom In at Cursor) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | roda do mouse amplia em torno do cursor |
| KC-094 | Ampliar (Zoom In) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl++ |
| KC-095 | Ampliar o gráfico na horizontal (Zoom In Horizontally) | KiCad › Common | falta | 9 | — | — |
| KC-096 | Ampliar o gráfico na vertical (Zoom In Vertically) | KiCad › Common | falta | 9 | — | — |
| KC-097 | Reduzir no cursor (Zoom Out at Cursor) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | roda do mouse reduz em torno do cursor |
| KC-098 | Reduzir (Zoom Out) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+- |
| KC-099 | Reduzir o gráfico na horizontal (Zoom Out Horizontally) | KiCad › Common | falta | 9 | — | — |
| KC-100 | Reduzir o gráfico na vertical (Zoom Out Vertically) | KiCad › Common | falta | 9 | — | — |
| KC-101 | Redesenhar (Refresh) | KiCad › Common | não se aplica | — | — | o quadro é redesenhado a cada mudança |
| KC-102 | Zoom na área arrastada (Zoom to Selection Area) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+F5 e Exibir › Zoom na área arrastada |
| KC-103 | Arquivos embutidos (Embedded Files) | KiCad › Common | falta | 6 | — | P2 |
| KC-104 | Extrair arquivo embutido (Extract File) | KiCad › Common | falta | 6 | — | P2 |
| KC-105 | Remover arquivo embutido (Remove File) | KiCad › Common | falta | 6 | — | P2 |
| KC-106 | Adicionar itens ao grupo (Add Items) | KiCad › Common | falta | 8 | — | P2 |
| KC-107 | Cancelar a ferramenta (Cancel) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Esc |
| KC-108 | Copiar (Copy) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+C; área de transferência interna |
| KC-109 | Copiar como texto (Copy as Text) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ctrl+Shift+C e Editar › Copiar como texto: uma linha por peça (rótulo, peça, propriedades) |
| KC-110 | Recortar (Cut) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+X |
| KC-111 | Alternar modo de edição de arco (Cycle Arc Editing Mode) | KiCad › Common | falta | 8 | — | P2 |
| KC-112 | Apagar (Delete) | KiCad › Common | feita | 0 | tests/edit.test.ts, e2e/edit.spec.ts | Delete/Backspace |
| KC-113 | Ferramenta de apagar por clique (Interactive Delete Tool) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Editar › Apagar com cliques |
| KC-114 | Duplicar (Duplicate) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+D |
| KC-115 | Localizar (Find) | KiCad › Common | falta | 8 | — | P1; "Localizar peça" do Fritzing na fase 3 |
| KC-116 | Localizar e substituir (Find and Replace) | KiCad › Common | falta | 8 | — | P1 |
| KC-117 | Localizar próximo (Find Next) | KiCad › Common | falta | 8 | — | P1 |
| KC-118 | Localizar próximo marcador (Find Next Marker) | KiCad › Common | falta | 8 | — | P1 |
| KC-119 | Localizar anterior (Find Previous) | KiCad › Common | falta | 8 | — | P1 |
| KC-120 | Concluir a ferramenta (Finish) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | End termina o fio com a ponta solta, como o botão direito |
| KC-121 | Agrupar (Group Items) | KiCad › Common | falta | 8 | — | P2 |
| KC-122 | Entrar no grupo (Enter Group) | KiCad › Common | falta | 8 | — | P2 |
| KC-123 | Sair do grupo (Leave Group) | KiCad › Common | falta | 8 | — | P2 |
| KC-124 | Régua (Measure Tool) | KiCad › Common | falta | 10 | — | P2 |
| KC-125 | Colar (Paste) | KiCad › Common | feita | 0 | tests/edit.test.ts, e2e/edit.spec.ts | Ctrl+V |
| KC-126 | Colar especial (Paste Special...) | KiCad › Common | falta | 8 | — | parcial: Colar no lugar (Ctrl+Shift+V); faltam as opções de anotação |
| KC-127 | Refazer (Redo) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+Shift+Z e Ctrl+Y |
| KC-128 | Remover itens do grupo (Remove Items) | KiCad › Common | falta | 8 | — | P2 |
| KC-129 | Substituir tudo (Replace All) | KiCad › Common | falta | 8 | — | P1 |
| KC-130 | Substituir e localizar próximo (Replace and Find Next) | KiCad › Common | falta | 8 | — | P1 |
| KC-131 | Painel de busca (Search) | KiCad › Common | falta | 8 | — | P1 |
| KC-132 | Selecionar tudo (Select All) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+A |
| KC-133 | Seleção por laço (Lasso) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Editar › Seleção por laço |
| KC-134 | Seleção por retângulo (Rectangle) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Seletor (V): da esquerda o que fica dentro, da direita o que tocar |
| KC-135 | Desfazer (Undo) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Ctrl+Z |
| KC-136 | Desagrupar (Ungroup Items) | KiCad › Common | falta | 8 | — | P2 |
| KC-137 | Desmarcar tudo (Unselect All) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | Editar › Desmarcar (Esc) |
| KC-138 | Selecionar linhas da tabela (Select Row(s)) | KiCad › Common | falta | 8 | — | P2 |
| KC-139 | Selecionar colunas da tabela (Select Column(s)) | KiCad › Common | falta | 8 | — | P2 |
| KC-140 | Selecionar a tabela (Select Table) | KiCad › Common | falta | 8 | — | P2 |
| KC-141 | Selecionar itens (Select item(s)) | KiCad › Common | feita | 0 | e2e/edit.spec.ts | clique, Shift+clique e retângulo |
| KC-142 | Sobre (About KiCad) | KiCad › Common | feita | 0 | e2e/ui.spec.ts | Ajuda › Sobre o CircuitMaster |
| KC-143 | Configurar caminhos (Configure Paths…) | KiCad › Common | falta | 5 | — | P1; variáveis de caminho |
| KC-144 | Doar (Donate) | KiCad › Common | não se aplica | — | — | link do site do KiCad |
| KC-145 | Contribuir (Get Involved) | KiCad › Common | não se aplica | — | — | link do site do KiCad |
| KC-146 | Primeiros passos (Getting Started with KiCad) | KiCad › Common | feita | 2 | e2e/ui.spec.ts | tour por modo, boas-vindas e Ajuda › Guia de uso |
| KC-147 | Ajuda (documentação) (Help) | KiCad › Common | feita | 2 | e2e/navigation.spec.ts | Ajuda › Guia de uso: como fazer cada coisa a partir da tela normal (spec 05 §13) |
| KC-148 | Lista de atalhos (List Hotkeys...) | KiCad › Common | feita | 0 | e2e/ui.spec.ts | Ajuda › Atalhos de teclado |
| KC-149 | Preferências (Preferences...) | KiCad › Common | feita | 2 | e2e/ui.spec.ts | P2; Editar › Preferências… (Ctrl+,): roda, fio curvo, modo, idioma, tema, unidades, cursor, grades, teclas e manutenção |
| KC-150 | Relatar problema (Report Bug) | KiCad › Common | não se aplica | — | — | link do site do KiCad; a ajuda é própria |
| KC-151 | Gerenciar bibliotecas de blocos de projeto (Manage Design Block Libraries...) | KiCad › Common | falta | 15 | — | P2 |
| KC-152 | Gerenciar bibliotecas de footprints (Manage Footprint Libraries...) | KiCad › Common | falta | 5 | — | P1 |
| KC-153 | Gerenciar bibliotecas de símbolos (Manage Symbol Libraries…) | KiCad › Common | falta | 5 | — | P1 |
| KC-154 | Inserir coluna depois (Add Column After) | KiCad › Common | falta | 8 | — | P2 |
| KC-155 | Inserir coluna antes (Add Column Before) | KiCad › Common | falta | 8 | — | P2 |
| KC-156 | Inserir linha acima (Add Row Above) | KiCad › Common | falta | 8 | — | P2 |
| KC-157 | Inserir linha abaixo (Add Row Below) | KiCad › Common | falta | 8 | — | P2 |
| KC-158 | Apagar colunas da tabela (Delete Column(s)) | KiCad › Common | falta | 8 | — | P2 |
| KC-159 | Apagar linhas da tabela (Delete Row(s)) | KiCad › Common | falta | 8 | — | P2 |
| KC-160 | Mesclar células (Merge Cells) | KiCad › Common | falta | 8 | — | P2 |
| KC-161 | Desfazer mesclagem de células (Unmerge Cells) | KiCad › Common | falta | 8 | — | P2 |

### Gerenciador de projeto

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KM-001 | Abrir a pasta do projeto (Browse Project Files) | KiCad › Project Manager | não se aplica | — | — | abre o explorador de arquivos do sistema |
| KM-002 | Arquivar projeto (zip) (Archive Project...) | KiCad › Project Manager | falta | 6 | — | P1; parcial: o .fzz já é um zip com o sketch e as peças |
| KM-003 | Fechar projeto (Close Project) | KiCad › Project Manager | falta | 6 | — | parcial: Novo descarta o sketch aberto |
| KM-004 | Conversor de imagem em símbolo ou footprint (Image Converter) | KiCad › Project Manager | falta | 5 | — | o logo de imagem do Fritzing entra na fase 3 |
| KM-005 | Editor de folha de desenho (Drawing Sheet Editor) | KiCad › Project Manager | falta | 15 | — | P3 |
| KM-006 | Editor de footprints (Footprint Editor) | KiCad › Project Manager | falta | 5 | — | P1; parcial: o editor de peças edita a vista PCB (SVG e terminais) |
| KM-007 | Editor de PCB (PCB Editor) | KiCad › Project Manager | feita | 0 | e2e/circuit.spec.ts | vista PCB |
| KM-008 | Editor de esquemático (Schematic Editor) | KiCad › Project Manager | feita | 0 | e2e/circuit.spec.ts | vista Esquemático |
| KM-009 | Editor de símbolos (Symbol Editor) | KiCad › Project Manager | falta | 5 | — | P1; parcial: editor de peças do Fritzing (.fzp) |
| KM-010 | Clonar projeto de repositório (Clone Project from Repository...) | KiCad › Project Manager | falta | 15 | — | P2; git |
| KM-011 | Novo jobset (New Jobset File...) | KiCad › Project Manager | falta | 13 | — | P2 |
| KM-012 | Novo projeto (New Project...) | KiCad › Project Manager | falta | 6 | — | P1; parcial: Novo cria um sketch vazio e Exemplos abre um pronto; faltam projeto KiCad e modelos |
| KM-013 | Abrir projeto de demonstração (Open Demo Project...) | KiCad › Project Manager | feita | 0 | e2e/samples.spec.ts | Arquivo › Exemplos (Fritzing); demos do KiCad na fase 6 |
| KM-014 | Abrir jobset (Open Jobset File...) | KiCad › Project Manager | falta | 13 | — | P2 |
| KM-015 | Abrir projeto (Open Project...) | KiCad › Project Manager | feita | 0 | tests/sketch.test.ts, e2e/circuit.spec.ts | Abrir .fzz; projeto KiCad na fase 6 |
| KM-016 | Abrir editor de texto (Open Text Editor) | KiCad › Project Manager | não se aplica | — | — | programa do sistema |
| KM-017 | Gerenciador de plugins e conteúdo (Plugin and Content Manager) | KiCad › Project Manager | falta | 16 | — | P3 |
| KM-018 | Restaurar projeto do histórico local (Restore Project from Local History...) | KiCad › Project Manager | falta | 15 | — | P2 |
| KM-019 | Calculadora (Calculator Tools) | KiCad › Project Manager | falta | 10 | — | P1 |
| KM-020 | Painel de histórico local (Local History) | KiCad › Project Manager | falta | 15 | — | P2 |
| KM-021 | Desarquivar projeto (zip) (Unarchive Project...) | KiCad › Project Manager | falta | 6 | — | P1 |
| KM-022 | Visualizador de Gerber (Gerber Viewer) | KiCad › Project Manager | falta | 13 | — | P2 |

### Seções dos manuais (eeschema, kicad, cli, pl_editor)

| ID | Manual | Seção | Fase | Linhas da matriz |
|---|---|---|---|---|
| MS-001 | eeschema | Introduction to the KiCad Schematic Editor › The Schematic Editor User Interface | 2 | KC-034, KC-074, KC-076 |
| MS-002 | eeschema | Introduction to the KiCad Schematic Editor › Navigating the editing canvas | 2 | KC-009, KC-051–KC-054, KC-059, KC-085, KC-089–KC-094, KC-097, KC-098, KC-102 |
| MS-003 | eeschema | Introduction to the KiCad Schematic Editor › Hotkeys | 2 | KC-012, KC-013, KC-148, KC-149 |
| MS-004 | eeschema | Introduction to the KiCad Schematic Editor › Selection and the selection filter | 15 | KC-132–KC-137, KC-141, KS-145, KS-146 |
| MS-005 | eeschema | Introduction to the KiCad Schematic Editor › Left toolbar display controls | 2 | KC-011, KC-016, KC-021, KC-037, KC-043, KC-044, KC-080–KC-082, KC-084, KS-010, KS-029–KS-032, KS-053, KS-060 |
| MS-006 | eeschema | Schematic Creation and Editing › Introduction | — | — |
| MS-007 | eeschema | Schematic Creation and Editing › Schematic editing operations | 8 | KS-098, KS-121, KS-122, KS-125–KS-127, KS-143, KS-144, KC-107, KC-108, KC-110, KC-112–KC-114, KC-120, KC-125–KC-127, KC-135 |
| MS-008 | eeschema | Schematic Creation and Editing › Grids and snapping | 2 | KS-007, KC-024, KC-025, KC-027–KC-033, KC-082 |
| MS-009 | eeschema | Schematic Creation and Editing › Editing object properties | 8 | KS-115–KS-118, KS-124, KS-133, KC-076 |
| MS-010 | eeschema | Schematic Creation and Editing › Working with symbols | 8 | KS-035, KS-037, KS-044–KS-047, KS-062, KS-093, KS-098, KS-111, KS-112, KS-140–KS-142, KC-071 |
| MS-011 | eeschema | Schematic Creation and Editing › Reference designators and symbol annotation | 8 | KS-009, KS-010, KS-028 |
| MS-012 | eeschema | Schematic Creation and Editing › Electrical connections | 8 | KS-090, KS-104 |
| MS-013 | eeschema | Schematic Creation and Editing › Wires | 8 | KS-029–KS-032, KS-104–KS-106, KS-110, KS-128, KS-158, KS-159 |
| MS-014 | eeschema | Schematic Creation and Editing › Labels | 8 | KS-065–KS-069, KS-085, KS-087, KS-088, KS-091, KS-134–KS-137 |
| MS-015 | eeschema | Schematic Creation and Editing › Buses | 8 | KS-064, KS-084, KS-102, KS-107 |
| MS-016 | eeschema | Schematic Creation and Editing › Power symbols | 0 | KS-095 |
| MS-017 | eeschema | Schematic Creation and Editing › No-connection flags | 8 | KS-094 |
| MS-018 | eeschema | Schematic Creation and Editing › Net classes | 8 | KS-108 |
| MS-019 | eeschema | Schematic Creation and Editing › Component classes | 8 | — |
| MS-020 | eeschema | Schematic Creation and Editing › Rule areas | 8 | KS-077 |
| MS-021 | eeschema | Schematic Creation and Editing › Graphics and text | 8 | KS-027, KS-071–KS-076, KS-081, KS-082, KS-089, KS-096, KS-103, KS-138, KS-139, KC-008, KC-038, KC-062, KC-111, KC-138–KC-140, KC-154–KC-161 |
| MS-022 | eeschema | Schematic Creation and Editing › Groups | 8 | KC-106, KC-121–KC-123, KC-128, KC-136 |
| MS-023 | eeschema | Schematic Creation and Editing › Aligning objects | 8 | KS-001–KS-007 |
| MS-024 | eeschema | Schematic Creation and Editing › Schematic editing convenience functions | 8 | KS-129–KS-132, KS-134–KS-139 |
| MS-025 | eeschema | Schematic Creation and Editing › Schematic Setup | 8 | KS-042 |
| MS-026 | eeschema | Schematic Creation and Editing › Opening legacy schematics | 16 | KS-038, KS-040 |
| MS-027 | eeschema | Multiple sheets and hierarchical schematics | 8 | KS-015, KS-041, KS-060, KS-070, KS-078, KS-080, KS-083, KS-088, KS-097, KS-100, KS-101, KS-113, KS-147–KS-154 |
| MS-028 | eeschema | Symbols and Symbol Libraries › Managing symbol libraries | 5 | KC-007, KC-046, KC-055, KC-086, KC-143, KC-153 |
| MS-029 | eeschema | Symbols and Symbol Libraries › Browsing symbol libraries | 5 | KC-010, KC-026, KC-039, KC-067, KC-077 |
| MS-030 | eeschema | Creating and editing symbols › Symbol Editor overview | 5 | KC-078, KS-207, KS-209, KS-214–KS-216, KS-218 |
| MS-031 | eeschema | Creating and editing symbols › Browsing, modifying, and saving symbols | 5 | KS-014, KS-018, KS-020, KS-194–KS-197, KS-199–KS-203, KS-208, KS-210–KS-213 |
| MS-032 | eeschema | Creating and editing symbols › Creating a new symbol library | 5 | KC-046 |
| MS-033 | eeschema | Creating and editing symbols › Creating a new symbol | 5 | KS-206 |
| MS-034 | eeschema | Creating and editing symbols › Editing symbol properties | 5 | — |
| MS-035 | eeschema | Creating and editing symbols › Symbol units and alternate body styles | 5 | KS-220 |
| MS-036 | eeschema | Creating and editing symbols › Symbol graphics | 5 | KS-188–KS-191, KS-193 |
| MS-037 | eeschema | Creating and editing symbols › Symbol pins | 5 | KS-114, KS-119, KS-123, KS-155–KS-157, KS-192 |
| MS-038 | eeschema | Creating and editing symbols › Symbol fields | 5 | — |
| MS-039 | eeschema | Creating and editing symbols › Footprint filters | 5 | — |
| MS-040 | eeschema | Creating and editing symbols › Jumper pins | 5 | — |
| MS-041 | eeschema | Creating and editing symbols › Embedding files | 5 | KC-103–KC-105 |
| MS-042 | eeschema | Creating and editing symbols › Creating power symbols | 5 | — |
| MS-043 | eeschema | Creating and editing symbols › Creating derived symbols | 5 | KS-198, KS-204, KS-221 |
| MS-044 | eeschema | Creating and editing symbols › Bulk editing symbol fields | 5 | KS-217, KS-219 |
| MS-045 | eeschema | Creating and editing symbols › Checking symbols | 5 | KS-061 |
| MS-046 | eeschema | Creating and editing symbols › Importing symbols | 5 | KS-205 |
| MS-047 | eeschema | Assigning Footprints | 8 | KS-011, KS-026, KS-115, KC-072 |
| MS-048 | eeschema | Design blocks | 15 | KS-079, KS-086, KS-092, KS-099, KS-161–KS-167, KC-151 |
| MS-049 | eeschema | Design variants | 15 | KS-008, KS-039, KS-044 |
| MS-050 | eeschema | Inspecting a schematic › Find tool | 8 | KC-115–KC-119, KC-129, KC-130 |
| MS-051 | eeschema | Inspecting a schematic › Search panel | 8 | KC-131 |
| MS-052 | eeschema | Inspecting a schematic › Net highlighting | 8 | KS-012, KS-024, KS-025 |
| MS-053 | eeschema | Inspecting a schematic › Net navigator | 8 | KS-034, KS-036, KS-054, KS-120 |
| MS-054 | eeschema | Inspecting a schematic › Cross-probing from the PCB | 2 | KS-043 |
| MS-055 | eeschema | Inspecting a schematic › Electrical rules checking | 8 | KS-049–KS-051, KS-063, KC-004–KC-006, KC-118 |
| MS-056 | eeschema | Generating Outputs › Printing | 3 | KC-057 |
| MS-057 | eeschema | Generating Outputs › Plotting | 8 | KS-013, KC-056 |
| MS-058 | eeschema | Generating Outputs › Generating a bill of materials | 8 | KS-021–KS-023, KS-045 |
| MS-059 | eeschema | Generating Outputs › Generating a Netlist | 8 | KS-019 |
| MS-060 | eeschema | Importing schematics from other applications | 16 | — |
| MS-061 | eeschema | Forward and back annotation › Update PCB from Schematic (forward annotation) | 0 | KC-087 |
| MS-062 | eeschema | Forward and back annotation › Update Schematic from PCB (back annotation) | 0 | KC-088 |
| MS-063 | eeschema | Simulator › Assigning models | 9 | KS-033, KS-047 |
| MS-064 | eeschema | Simulator › Value notation | 9 | — |
| MS-065 | eeschema | Simulator › SPICE directives | 9 | — |
| MS-066 | eeschema | Simulator › Running simulations | 9 | KS-058, KS-169, KS-172, KS-175–KS-177 |
| MS-067 | eeschema | Simulator › Viewing simulation results | 9 | KS-055, KS-056, KS-168, KS-171, KS-183–KS-187, KC-095, KC-096, KC-099, KC-100 |
| MS-068 | eeschema | Simulator › Tuning components | 9 | KS-178 |
| MS-069 | eeschema | Simulator › Saving simulation setups | 9 | KS-170, KS-173, KS-174 |
| MS-070 | eeschema | Simulator › Exporting simulation results | 9 | KS-179–KS-182 |
| MS-071 | eeschema | Simulator › Troubleshooting simulations | 9 | — |
| MS-072 | eeschema | Simulator › Helpful hints | 9 | — |
| MS-073 | eeschema | Advanced Topics › Configuration and Customization | 2 | KC-149 |
| MS-074 | eeschema | Advanced Topics › Text variables | 15 | — |
| MS-075 | eeschema | Advanced Topics › Text expressions | 15 | — |
| MS-076 | eeschema | Advanced Topics › Database Libraries | 5 | — |
| MS-077 | eeschema | Advanced Topics › HTTP Libraries | 5 | KS-160 |
| MS-078 | eeschema | Advanced Topics › Custom Netlist and BOM Formats | — | KS-022, KS-023 |
| MS-079 | eeschema | Actions reference | — | KS-001–KS-221, KC-001–KC-161 |
| MS-080 | kicad | Introduction (System Requirements) | — | — |
| MS-081 | kicad | Installing and Upgrading KiCad | — | — |
| MS-082 | kicad | Installing and Upgrading KiCad › First time setup | 5 | KC-152, KC-153 |
| MS-083 | kicad | Installing and Upgrading KiCad › Migrating design files from previous versions | 4 | — |
| MS-084 | kicad | Using the KiCad project manager | 6 | KM-003, KM-007–KM-009, KM-015, KC-075 |
| MS-085 | kicad | Using the KiCad project manager › Standalone mode | — | — |
| MS-086 | kicad | Using the KiCad project manager › Creating a new project | 6 | KM-012, KM-013 |
| MS-087 | kicad | Using the KiCad project manager › Importing a project from another EDA tool | 16 | — |
| MS-088 | kicad | Using the KiCad project manager › Project backups and autosave | 1 | F-233, KP-124 |
| MS-089 | kicad | Using the KiCad project manager › Saving and loading project archives | 6 | KM-002, KM-021 |
| MS-090 | kicad | Using the KiCad project manager › Git integration | 15 | KM-010 |
| MS-091 | kicad | KiCad files and folders › Project files | 6 | — |
| MS-092 | kicad | KiCad files and folders › Schematic editor files and folders | 4 | — |
| MS-093 | kicad | KiCad files and folders › Board editor files and folders | 4 | — |
| MS-094 | kicad | KiCad files and folders › Common files | 4 | — |
| MS-095 | kicad | KiCad files and folders › Fabrication and documentation files | 13 | — |
| MS-096 | kicad | KiCad files and folders › Storing and sending KiCad files | 6 | KM-002 |
| MS-097 | kicad | Paths and libraries configuration › KiCad path variables | 5 | KC-143 |
| MS-098 | kicad | Paths and libraries configuration › Advanced environment variables | 5 | KC-143 |
| MS-099 | kicad | Paths and libraries configuration › Libraries configuration | 5 | KC-151–KC-153 |
| MS-100 | kicad | Jobsets | 13 | KM-011, KM-014 |
| MS-101 | kicad | Project templates | 6 | KM-012 |
| MS-102 | kicad | Plugin and Content Manager | 16 | KM-017, KC-003 |
| MS-103 | kicad | KiCad preferences › Common preferences | 2 | KC-149 |
| MS-104 | kicad | KiCad preferences › Mouse and touchpad preferences | 2 | — |
| MS-105 | kicad | KiCad preferences › SpaceMouse preferences | 2 | — |
| MS-106 | kicad | KiCad preferences › Hotkey preferences | 2 | KC-148 |
| MS-107 | kicad | KiCad preferences › Version control preferences | 15 | — |
| MS-108 | kicad | KiCad preferences › Data collection preferences | — | — |
| MS-109 | kicad | KiCad preferences › Packages and updates preferences | 16 | — |
| MS-110 | kicad | KiCad preferences › Plugins preferences | 16 | — |
| MS-111 | kicad | KiCad preferences › Maintenance preferences | 2 | — |
| MS-112 | kicad | Actions reference | — | KM-001–KM-022 |
| MS-113 | cli | Introduction to the KiCad Command-Line Interface | 13 | — |
| MS-114 | cli | Footprint commands › Footprint export | 13 | — |
| MS-115 | cli | Footprint commands › Footprint upgrade | 13 | — |
| MS-116 | cli | Jobset commands | 13 | KM-011, KM-014 |
| MS-117 | cli | PCB commands › PCB DRC | 13 | — |
| MS-118 | cli | PCB commands › PCB export: 3D PDF | 13 | — |
| MS-119 | cli | PCB commands › PCB export: BREP (OCCT) | 13 | — |
| MS-120 | cli | PCB commands › PCB export: drill file | 13 | — |
| MS-121 | cli | PCB commands › PCB export: DXF | 13 | — |
| MS-122 | cli | PCB commands › PCB export: GenCAD | 13 | — |
| MS-123 | cli | PCB commands › PCB export: Gerber | 13 | — |
| MS-124 | cli | PCB commands › PCB export: GLB | 13 | — |
| MS-125 | cli | PCB commands › PCB export: HPGL | 13 | — |
| MS-126 | cli | PCB commands › PCB export: IPC-2581 | 13 | — |
| MS-127 | cli | PCB commands › PCB export: IPC-D-356 | 13 | — |
| MS-128 | cli | PCB commands › PCB export: ODB++ | 13 | — |
| MS-129 | cli | PCB commands › PCB export: PDF | 13 | — |
| MS-130 | cli | PCB commands › PCB export: PLY | 13 | — |
| MS-131 | cli | PCB commands › PCB export: position file | 13 | — |
| MS-132 | cli | PCB commands › PCB export: PostScript | 13 | — |
| MS-133 | cli | PCB commands › PCB export: statistics | 13 | — |
| MS-134 | cli | PCB commands › PCB export: STEP | 13 | — |
| MS-135 | cli | PCB commands › PCB export: STL | 13 | — |
| MS-136 | cli | PCB commands › PCB export: STEPZ | 13 | — |
| MS-137 | cli | PCB commands › PCB export: U3D | 13 | — |
| MS-138 | cli | PCB commands › PCB export: SVG | 13 | — |
| MS-139 | cli | PCB commands › PCB export: VRML | 13 | — |
| MS-140 | cli | PCB commands › PCB export: XAO | 13 | — |
| MS-141 | cli | PCB commands › PCB import | 13 | — |
| MS-142 | cli | PCB commands › PCB render | 13 | — |
| MS-143 | cli | PCB commands › PCB upgrade | 13 | — |
| MS-144 | cli | Schematic commands › Schematic ERC | 13 | KS-063 |
| MS-145 | cli | Schematic commands › Schematic export: bill of materials | 13 | KS-021 |
| MS-146 | cli | Schematic commands › Schematic export: DXF | 13 | KC-056 |
| MS-147 | cli | Schematic commands › Schematic export: HPGL | 13 | KC-056 |
| MS-148 | cli | Schematic commands › Schematic export: netlist | 13 | KS-019 |
| MS-149 | cli | Schematic commands › Schematic export: PDF | 13 | KC-056 |
| MS-150 | cli | Schematic commands › Schematic export: PostScript | 13 | KC-056 |
| MS-151 | cli | Schematic commands › Schematic export: bill of materials (legacy BOM scripts) | — | KS-022, KS-023 |
| MS-152 | cli | Schematic commands › Schematic export: SVG | 13 | KC-056 |
| MS-153 | cli | Schematic commands › Schematic upgrade | 13 | — |
| MS-154 | cli | Symbol commands › Symbol export | 13 | KS-202 |
| MS-155 | cli | Symbol commands › Symbol upgrade | 13 | — |
| MS-156 | cli | Version commands | 13 | — |
| MS-157 | pl_editor | Introduction to the KiCad Drawing Sheet Editor | 15 | KM-005 |
| MS-158 | pl_editor | Drawing Sheet Editor files | 15 | — |
| MS-159 | pl_editor | Theory of operations | 15 | — |
| MS-160 | pl_editor | Text and keywords | 15 | — |
| MS-161 | pl_editor | Constraints | 15 | — |
| MS-162 | pl_editor | Invoking the Drawing Sheet Editor | 15 | KM-005 |
| MS-163 | pl_editor | Drawing Sheet Editor Commands | 15 | — |
| MS-164 | pl_editor | Properties editor | 15 | — |
| MS-165 | pl_editor | Design Inspector window | 15 | — |
| MS-166 | pl_editor | Interactive editing | 15 | KC-050 |

### Resumo

| Tabela | Linhas | feita | falta | não se aplica |
|---|---|---|---|---|
| Editor de esquemático (KS) | 221 | 33 | 186 | 2 |
| Ações comuns (KC) | 161 | 80 | 72 | 9 |
| Gerenciador de projeto (KM) | 22 | 4 | 16 | 2 |
| Total | 404 | 117 | 274 | 13 |

| Fase | Linhas de ações |
|---|---|
| 0 | 66 |
| 2 | 51 |
| 3 | 4 |
| 5 | 62 |
| 6 | 8 |
| 8 | 139 |
| 9 | 25 |
| 10 | 8 |
| 12 | 1 |
| 13 | 3 |
| 15 | 20 |
| 16 | 4 |
| — | 13 |

Seções dos manuais: 166 linhas (MS-001 a MS-166).

| Fase | Seções |
|---|---|
| 0 | 3 |
| 1 | 1 |
| 2 | 12 |
| 3 | 1 |
| 4 | 4 |
| 5 | 25 |
| 6 | 6 |
| 8 | 27 |
| 9 | 10 |
| 13 | 45 |
| 15 | 17 |
| 16 | 6 |
| — | 9 |

## KiCad — PCB, 3D, GerbView e calculadora

Fonte das ações: `pcbnew/pcbnew_actions_reference.adoc` do KiCad 10.0.7, na ordem da tabela (o mesmo nome em inglês aparece mais de uma vez quando o KiCad tem ações distintas com o mesmo rótulo, como Line Modes e Highlight Net). Prioridade P1/P2/P3 da seção 11 do `FRIZING_KICAD.md` no início da Nota quando a função aparece lá.

### Editor de PCB

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KP-001 | Alinhar pela base (Align to Bottom) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-002 | Alinhar pelo centro horizontal (Align to Horizontal Center) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-003 | Alinhar pelo centro vertical (Align to Vertical Center) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-004 | Alinhar pela esquerda (Align to Left) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-005 | Alinhar pela direita (Align to Right) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-006 | Alinhar pelo topo (Align to Top) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Alinhar; alinha pela caixa da seleção, não pelo item sob o cursor |
| KP-007 | Distribuir na horizontal pelos centros (Distribute Horizontally by Centers) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-008 | Distribuir na horizontal com vãos iguais (Distribute Horizontally with Even Gaps) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-009 | Distribuir na vertical pelos centros (Distribute Vertically by Centers) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-010 | Distribuir na vertical com vãos iguais (Distribute Vertically with Even Gaps) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-011 | Criar matriz de cópias (Create Array…) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-012 | Posicionar automaticamente os footprints fora da placa (Place Off-Board Footprints) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-013 | Posicionar automaticamente os footprints selecionados (Place Selected Footprints) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-014 | Passar a trilha em roteamento para a próxima camada (Switch Track to Next Layer) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: Mover trilha para a outra face, só depois de traçada |
| KP-015 | Passar a trilha em roteamento para a camada anterior (Switch Track to Previous Layer) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: Mover trilha para a outra face, só depois de traçada |
| KP-016 | Ver a placa por baixo (Flip Board View) | KiCad › PCB Editor | falta | 3 | — | View from Below do Fritzing, ausente (seção 10) |
| KP-017 | Zoom automático ao trocar de footprint (Automatic zoom) | KiCad › PCB Editor | falta | 5 | — | visualizador de footprints |
| KP-018 | Gráficos em contorno (Sketch Graphic Items) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-019 | Diminuir a opacidade da camada (Decrease Layer Opacity) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: a face não escolhida fica com opacidade fixa de 0,18 |
| KP-020 | Aumentar a opacidade da camada (Increase Layer Opacity) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: a face não escolhida fica com opacidade fixa de 0,18 |
| KP-021 | Ativar o cobre de baixo (Switch to Copper (B.Cu) Layer) | KiCad › PCB Editor | feita | 0 | e2e/pcb.spec.ts | aba Base no cabeçalho da PCB (trilhas novas embaixo); sem o atalho PgDn |
| KP-022 | Ativar a camada interna 1 (Switch to Inner Layer 1) | KiCad › PCB Editor | falta | 10 | — | P1 (placa de 4 camadas); só há duas camadas de cobre |
| KP-023 | Ativar a camada interna 10 (Switch to Inner Layer 10) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-024 | Ativar a camada interna 11 (Switch to Inner Layer 11) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-025 | Ativar a camada interna 12 (Switch to Inner Layer 12) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-026 | Ativar a camada interna 13 (Switch to Inner Layer 13) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-027 | Ativar a camada interna 14 (Switch to Inner Layer 14) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-028 | Ativar a camada interna 15 (Switch to Inner Layer 15) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-029 | Ativar a camada interna 16 (Switch to Inner Layer 16) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-030 | Ativar a camada interna 17 (Switch to Inner Layer 17) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-031 | Ativar a camada interna 18 (Switch to Inner Layer 18) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-032 | Ativar a camada interna 19 (Switch to Inner Layer 19) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-033 | Ativar a camada interna 2 (Switch to Inner Layer 2) | KiCad › PCB Editor | falta | 10 | — | P1 (placa de 4 camadas); só há duas camadas de cobre |
| KP-034 | Ativar a camada interna 20 (Switch to Inner Layer 20) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-035 | Ativar a camada interna 21 (Switch to Inner Layer 21) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-036 | Ativar a camada interna 22 (Switch to Inner Layer 22) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-037 | Ativar a camada interna 23 (Switch to Inner Layer 23) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-038 | Ativar a camada interna 24 (Switch to Inner Layer 24) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-039 | Ativar a camada interna 25 (Switch to Inner Layer 25) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-040 | Ativar a camada interna 26 (Switch to Inner Layer 26) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-041 | Ativar a camada interna 27 (Switch to Inner Layer 27) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-042 | Ativar a camada interna 28 (Switch to Inner Layer 28) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-043 | Ativar a camada interna 29 (Switch to Inner Layer 29) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-044 | Ativar a camada interna 3 (Switch to Inner Layer 3) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-045 | Ativar a camada interna 30 (Switch to Inner Layer 30) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-046 | Ativar a camada interna 4 (Switch to Inner Layer 4) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-047 | Ativar a camada interna 5 (Switch to Inner Layer 5) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-048 | Ativar a camada interna 6 (Switch to Inner Layer 6) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-049 | Ativar a camada interna 7 (Switch to Inner Layer 7) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-050 | Ativar a camada interna 8 (Switch to Inner Layer 8) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-051 | Ativar a camada interna 9 (Switch to Inner Layer 9) | KiCad › PCB Editor | falta | 10 | — | P2; só há duas camadas de cobre |
| KP-052 | Ativar a próxima camada (Switch to Next Layer) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: Topo/Base escolhidos por clique, sem comando de avançar |
| KP-053 | Alternar entre os pares de camadas predefinidos (Cycle Layer Pair Presets) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-054 | Ativar a camada anterior (Switch to Previous Layer) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: Topo/Base escolhidos por clique, sem comando de voltar |
| KP-055 | Alternar a camada do par ativo (Toggle Layer) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: Topo/Base escolhidos por clique, sem atalho |
| KP-056 | Ativar o cobre de cima (Switch to Component (F.Cu) layer) | KiCad › PCB Editor | feita | 0 | e2e/pcb.spec.ts | aba Topo no cabeçalho da PCB (trilhas novas em cima); sem o atalho PgUp |
| KP-057 | Ratsnest local dos itens selecionados (Local Ratsnest) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-058 | Modo de cor de net (3 estados) (Net Color Mode (3-state)) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-059 | Mostrar o próximo footprint (Display next footprint) | KiCad › PCB Editor | falta | 5 | — | P1; visualizador de footprints |
| KP-060 | Pads em contorno (Sketch Pads) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-061 | Mostrar o footprint anterior (Display previous footprint) | KiCad › PCB Editor | falta | 5 | — | P1; visualizador de footprints |
| KP-062 | Ratsnest com linhas curvas (Curved Ratsnest Lines) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-063 | Modo do ratsnest (3 estados) (Ratsnest Mode (3-state)) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: ratsnest sempre visível nas duas faces |
| KP-064 | Reparar a placa (Repair Board) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-065 | Painel de aparência (Appearance) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: Ambas/Topo/Base esmaece a outra face; mostrar e ocultar camadas do Fritzing fica na fase 3 |
| KP-066 | Inspetor de nets (Net Inspector) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: o painel Projeto lista os nós com a tensão simulada |
| KP-067 | Mostrar os números dos pads (Show Pad Numbers) | KiCad › PCB Editor | falta | 10 | — | P2; parcial: o nome do pino aparece só sob o cursor |
| KP-068 | Console de scripts (Scripting Console) | KiCad › PCB Editor | não se aplica | — | — | console Python embutido no wxWidgets; extensões entram pela API da fase 16 |
| KP-069 | Mostrar o ratsnest (Show Ratsnest) | KiCad › PCB Editor | falta | 3 | — | parcial: ratsnest sempre visível; a camada de ratsnest do Fritzing liga e desliga (seção 10) |
| KP-070 | Textos em contorno (Sketch Text Items) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-071 | Trilhas em contorno (Sketch Tracks) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-072 | Vias em contorno (Sketch Vias) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-073 | Mostrar só o contorno das zonas (Draw Zone Outlines) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-074 | Mostrar o preenchimento das zonas (Draw Zone Fills) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-075 | Alternar a exibição das zonas (Toggle Zone Display) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-076 | Gerenciador de zonas (Zone Manager...) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-077 | Criar arco a partir da seleção (Create Arc from Selection) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-078 | Criar área de regra a partir da seleção (Create Rule Area from Selection...) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-079 | Criar linhas gráficas a partir da seleção (Create Lines from Selection...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-080 | Criar polígono gráfico a partir da seleção (Create Polygon from Selection...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-081 | Criar trilhas a partir das linhas selecionadas (Create Tracks from Selection) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-082 | Criar zona de cobre a partir da seleção (Create Zone from Selection...) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-083 | Criar contornos deslocados a partir da seleção (Create Outsets from Selection...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-084 | Verificador de regras de projeto (DRC) (Design Rules Checker) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: DRC do Fritzing (folga entre nets, borda, furo fora da placa) com navegação no painel Problemas |
| KP-085 | Editor gráfico de regras do DRC (DRC Rule Editor) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-086 | Abrir no editor de footprints (Open in Footprint Editor) | KiCad › PCB Editor | falta | 5 | — | P1; parcial: Editar (editor de peças) abre a peça do sketch |
| KP-087 | Editar o footprint da biblioteca (Edit Library Footprint…) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-088 | Anexar outra placa (Append Board...) | KiCad › PCB Editor | falta | 6 | — | P1; lê .kicad_pcb; não descrito nos capítulos do manual |
| KP-089 | Atribuir classe de net por padrão de nome (Assign Netclass...) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-090 | Largura da trilha vinda da trilha de origem (Automatically select track width) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-091 | Configuração da placa (Board Setup...) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: largura, folga e via gravadas no sketch, na aba Roteamento |
| KP-092 | Limpar o realce de net (Clear Net Highlighting) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-093 | Reunir e embutir os modelos 3D (Collect And Embed 3D Models) | KiCad › PCB Editor | falta | 12 | — | P2 |
| KP-094 | Origem dos arquivos de furação e posição (Drill/Place File Origin) | KiCad › PCB Editor | falta | 13 | — | parcial: origem fixa no canto inferior esquerdo da placa |
| KP-095 | Zerar a origem de furação (Reset Drill Origin) | KiCad › PCB Editor | falta | 13 | — | parcial: origem fixa no canto inferior esquerdo da placa |
| KP-096 | Exportar associação de footprints (.cmp) (Export Footprint Association (.cmp) File...) | KiCad › PCB Editor | falta | 13 | — | usado na anotação reversa |
| KP-097 | Exportar os footprints da placa para uma biblioteca (Export Footprints...) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-098 | Exportar GenCAD (Export GenCAD...) | KiCad › PCB Editor | falta | 13 | — | P3 |
| KP-099 | Exportar Hyperlynx (Hyperlynx...) | KiCad › PCB Editor | falta | 13 | — | P3 |
| KP-100 | Exportar IDFv3 (Export IDFv3...) | KiCad › PCB Editor | falta | 12 | — | P3 |
| KP-101 | Exportar STEP, GLB, BREP, XAO, PLY ou STL (Export STEP/GLB/BREP/XAO/PLY/STL...) | KiCad › PCB Editor | falta | 12 | — | P2 (GLB, STEP), P3 (demais) |
| KP-102 | Exportar Specctra DSN (Export Specctra DSN...) | KiCad › PCB Editor | falta | 13 | — | P3 |
| KP-103 | Exportar VRML (Export VRML...) | KiCad › PCB Editor | falta | 12 | — | P3 |
| KP-104 | Lista de materiais (Bill of Materials...) | KiCad › PCB Editor | feita | 0 | tests/cam.test.ts, e2e/export.spec.ts | Exportar › Lista de materiais (HTML, CSV, PDF) |
| KP-105 | Netlist IPC-D-356 (IPC-D-356 Netlist File…) | KiCad › PCB Editor | feita | 0 | tests/cam.test.ts, e2e/export.spec.ts | Exportar › Netlist IPC-D-356A |
| KP-106 | Arquivos de furação (Drill Files (.drl)...) | KiCad › PCB Editor | falta | 13 | — | P1; parcial: um Excellon só (PTH e NPTH em ferramentas separadas) dentro do zip do Gerber, sem mapa de furos nem opções |
| KP-107 | Gerbers para fabricação (Gerbers (.gbr)...) | KiCad › PCB Editor | falta | 13 | — | P1; parcial: RS-274X de cobre, máscara, pasta, serigrafia e contorno, sem X2/X3, arquivo de job, escolha de camadas nem opções |
| KP-108 | Arquivo IPC-2581 (IPC-2581 File (.xml)...) | KiCad › PCB Editor | falta | 13 | — | P2 |
| KP-109 | Saída ODB++ (ODB++ Output File...) | KiCad › PCB Editor | falta | 13 | — | P2 |
| KP-110 | Arquivo de posição dos componentes (Component Placement (.pos, .gbr)...) | KiCad › PCB Editor | feita | 0 | tests/cam.test.ts, e2e/export.spec.ts | Pick-and-place no formato do Fritzing (.xy, mil); .pos, CSV e Gerber de posição do KiCad na fase 13 |
| KP-111 | Relatório de footprints (Footprint Report (.rpt)...) | KiCad › PCB Editor | falta | 13 | — | P3 |
| KP-112 | Ocultar a net no ratsnest (Hide Net in Ratsnest) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-113 | Realçar a net sob o cursor (Highlight Net) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-114 | Realçar as nets selecionadas (Highlight Net) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-115 | Importar netlist (Import Netlist...) | KiCad › PCB Editor | falta | 6 | — | P1; as vistas já compartilham o grafo; falta ler netlist de arquivo |
| KP-116 | Importar sessão Specctra (Import Specctra Session...) | KiCad › PCB Editor | falta | 16 | — | P3 |
| KP-117 | Modo de linha a 45° (Line Modes) | KiCad › PCB Editor | falta | 10 | — | parcial: Shift prende o trecho do fio a 0°/45°/90°; sem modo fixo para desenho e arraste |
| KP-118 | Modo de linha em qualquer ângulo (Line Modes) | KiCad › PCB Editor | falta | 10 | — | parcial: o fio por cliques e o arraste de dobra já são livres na PCB; sem modo para escolher |
| KP-119 | Próximo modo de linha (Line Modes) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-120 | Modo de linha horizontal e vertical (Line Modes) | KiCad › PCB Editor | falta | 10 | — | parcial: Fios ortogonais (90°) só na protoboard e no esquemático |
| KP-121 | Travar (Lock) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Peça › Travar peça; trava peças, não trilhas |
| KP-122 | Importar placa de outro programa (Non-KiCad Board File...) | KiCad › PCB Editor | falta | 16 | — | P2 (Eagle, EasyEDA), P3 |
| KP-123 | Colocar footprints (Place Footprints) | KiCad › PCB Editor | feita | 0 | e2e/circuit.spec.ts | peças do painel Peças entram na PCB; footprints do KiCad na fase 5 |
| KP-124 | Recuperar o arquivo de resgate (Rescue) | KiCad › PCB Editor | feita | 1 | e2e/robust.spec.ts | P1; a recuperação do salvamento automático cobre a PCB, que está no mesmo documento (spec 06 §6.3) |
| KP-125 | Ir para o editor de esquemático (Switch to Schematic Editor) | KiCad › PCB Editor | feita | 0 | e2e/circuit.spec.ts | aba Esquemático (Ctrl+2) |
| KP-126 | Mostrar a net no ratsnest (Show Net in Ratsnest) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-127 | Alternar entre as duas últimas nets realçadas (Toggle Last Net Highlight) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-128 | Alternar trava (Toggle Lock) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | Travar peça (marcável); sem o atalho L |
| KP-129 | Alternar o realce de net (Toggle Net Highlight) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-130 | Largura de trilha predefinida anterior (Switch Track Width to Previous) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: uma largura só, a das regras |
| KP-131 | Próxima largura de trilha predefinida (Switch Track Width to Next) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: uma largura só, a das regras |
| KP-132 | Destravar (Unlock) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | desmarcar Travar peça |
| KP-133 | Tamanho de via predefinido anterior (Decrease Via Size) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: um tamanho só, o das regras |
| KP-134 | Próximo tamanho de via predefinido (Increase Via Size) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: um tamanho só, o das regras |
| KP-135 | Duplicar a zona em outra camada (Duplicate Zone onto Layer…) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-136 | Unir zonas (Merge Zones) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-137 | Levar o footprint do assistente ao editor (Export footprint to editor) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-138 | Restaurar os parâmetros do assistente (Reset wizard parameters) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-139 | Próxima página do assistente (Select next wizard page) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-140 | Página anterior do assistente (Select previous wizard page) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-141 | Escolher o assistente de footprint (Show wizards selector) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-142 | Refazer todos os geradores (Rebuild All Generators) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-143 | Reajustar todos os padrões de comprimento (Update All Tuning Patterns) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-144 | Refazer os geradores selecionados (Rebuild Selected Generators) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-145 | Gerenciador de geradores (Generators Manager) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-146 | Trocar o footprint (Change Footprint…) | KiCad › PCB Editor | falta | 5 | — | P1; parcial: trocar o encapsulamento no inspetor troca a peça dentro da família |
| KP-147 | Trocar footprints em lote (Change Footprints...) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-148 | Limpar gráficos redundantes (Cleanup Graphics...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-149 | Limpar trilhas e vias (Cleanup Tracks & Vias...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-150 | Editar teardrops (Edit Teardrops...) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-151 | Editar propriedades de textos e gráficos em lote (Edit Text & Graphics Properties...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-152 | Editar propriedades de trilhas e vias em lote (Edit Track & Via Properties...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-153 | Apagar em lote (Global Deletions...) | KiCad › PCB Editor | falta | 10 | — | parcial: Apagar trilhas autoroteadas e Remover preenchimento; não descrito nos capítulos do manual |
| KP-154 | Remover pads sem uso das camadas internas (Remove Unused Pads...) | KiCad › PCB Editor | falta | 10 | — | requer camadas internas |
| KP-155 | Trocar camadas (Swap Layers...) | KiCad › PCB Editor | falta | 10 | — | parcial: Mover trilha para a outra face nas trilhas selecionadas; não descrito nos capítulos do manual |
| KP-156 | Atualizar o footprint pela biblioteca (Update Footprint…) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-157 | Atualizar footprints pela biblioteca (Update Footprints from Library...) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-158 | Comparar footprint com a biblioteca (Compare Footprint with Library) | KiCad › PCB Editor | falta | 10 | — | P1 (DRC footprint × biblioteca) |
| KP-159 | Resolução de folga entre dois itens (Clearance Resolution) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-160 | Resolução de restrições do item (Constraints Resolution) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-161 | Estatísticas da placa (Show Board Statistics) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-162 | Mostrar associações de footprint e símbolo (Show Footprint Associations) | KiCad › PCB Editor | falta | 6 | — | não descrito nos capítulos do manual |
| KP-163 | Cota alinhada (Draw Aligned Dimensions) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-164 | Aplicar o layout do bloco de projeto (Apply Design Block Layout) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-165 | Desenhar arcos (Draw Arcs) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-166 | Inverter o sentido do arco (Switch Arc Posture) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-167 | Adicionar código de barras (Add Barcode) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-168 | Desenhar curva de Bézier (Draw Bezier Curve) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-169 | Cota de centro (Draw Center Dimensions) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-170 | Inverter as setas da cota (Switch Dimension Arrows) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-171 | Desenhar círculos (Draw Circles) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-172 | Fechar o contorno (Close Outline) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-173 | Diminuir a largura da linha (Decrease Line Width) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-174 | Apagar o último ponto (Delete Last Point) | KiCad › PCB Editor | falta | 10 | — | só para gráficos e zonas, que não existem |
| KP-175 | Desenhar tabelas (Draw Tables) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-176 | Desenhar polígonos (Draw Polygons) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-177 | Aumentar a largura da linha (Increase Line Width) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-178 | Desenhar chamadas (leaders) (Draw Leaders) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-179 | Desenhar linhas (Draw Lines) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-180 | Cota ortogonal (Draw Orthogonal Dimensions) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-181 | Tabela de características da placa (Add Board Characteristics) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-182 | Colocar bloco de projeto (Place Design Block) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-183 | Importar gráficos (DXF, SVG) (Import Graphics...) | KiCad › PCB Editor | falta | 10 | — | P1; logo de imagem e placa a partir de imagem do Fritzing ficam na fase 3 |
| KP-184 | Colocar bloco de projeto ligado ao grupo (Place Linked Design Block) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-185 | Colocar ponto de referência (Place Point) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-186 | Colocar imagem de referência (Place Reference Images) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-187 | Tabela de stackup (Add Stackup Table) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-188 | Cota radial (Draw Radial Dimensions) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-189 | Desenhar retângulos (Draw Rectangles) | KiCad › PCB Editor | falta | 10 | — | P1 (contorno livre) |
| KP-190 | Desenhar área de regra (keepout) (Draw Rule Areas) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: bloqueador retangular do Fritzing para preenchimento e autorouter |
| KP-191 | Gravar no bloco de projeto ligado (Save to Linked Design Block) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-192 | Posicionar a âncora do footprint (Place the Footprint Anchor) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-193 | Adicionar zona semelhante (Add a Similar Zone) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-194 | Escrever texto (Draw Text) | KiCad › PCB Editor | falta | 10 | — | parcial: logo de texto do Fritzing na serigrafia ou no cobre |
| KP-195 | Caixa de texto (Draw Text Boxes) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-196 | Colocar vias soltas (Place Vias) | KiCad › PCB Editor | feita | 0 | tests/edit.test.ts, e2e/pcb.spec.ts | via do acervo do Fritzing ou dobra convertida em via |
| KP-197 | Desenhar zona de cobre (Draw Filled Zones) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: preencher a face com cobre ou com terra (sementes) e preenchimento unitário por clique, sem contorno, prioridade nem térmicos configuráveis |
| KP-198 | Recorte de zona (Add a Zone Cutout) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-199 | Buscar footprint pela referência e mover (Get and Move Footprint) | KiCad › PCB Editor | falta | 10 | — | parcial: o painel Projeto leva até a peça e a seleciona |
| KP-200 | Chanfrar linhas (Chamfer Lines...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-201 | Aplicar a largura atual às trilhas selecionadas (Change Track Width) | KiCad › PCB Editor | falta | 3 | — | parcial: o inspetor mostra a largura sem editar; o Fritzing troca a largura da trilha no inspetor |
| KP-202 | Apagar a trilha inteira (Delete Full Track) | KiCad › PCB Editor | feita | 0 | tests/edit.test.ts | Apagar fio leva a cadeia direta até os conectores; sem o atalho Shift+Del |
| KP-203 | Cantos dogbone (Dogbone Corners...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-204 | Duplicar incrementando (Duplicate and Increment) | KiCad › PCB Editor | falta | 10 | — | parcial: Duplicar (Ctrl+D) sem incrementar |
| KP-205 | Editar cantos em tabela (Edit Corners...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-206 | Estender linhas até se encontrarem (Extend Lines to Meet) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-207 | Arredondar linhas (Fillet Lines...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-208 | Arredondar trilhas (Fillet Tracks) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-209 | Trocar de face (Change Side / Flip) | KiCad › PCB Editor | falta | 10 | — | peças só na face de cima; trilhas trocam pelo menu |
| KP-210 | Emendar formas (Heal Shapes) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-211 | Interseção de polígonos (Intersect Polygons) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-212 | União de polígonos (Merge Polygons) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-213 | Espelhar na horizontal (Mirror Horizontally) | KiCad › PCB Editor | falta | 10 | — | parcial: espelhar só no esquemático |
| KP-214 | Espelhar na vertical (Mirror Vertically) | KiCad › PCB Editor | falta | 10 | — | parcial: espelhar só no esquemático |
| KP-215 | Mover o canto para a posição exata (Move Corner To...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-216 | Mover com valor exato (Move Exactly…) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-217 | Mover o ponto médio para a posição exata (Move Midpoint To...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-218 | Agrupar e mover footprints (Pack and Move Footprints) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-219 | Propriedades (Properties…) | KiCad › PCB Editor | falta | 10 | — | parcial: o inspetor edita valores, título, tamanho e furo das peças; a trilha mostra a largura sem editar |
| KP-220 | Girar no sentido anti-horário (Rotate Counterclockwise) | KiCad › PCB Editor | feita | 0 | tests/engine.test.ts, e2e/edit.spec.ts | Girar 90° anti-horário ([); também 45° e 180° |
| KP-221 | Girar no sentido horário (Rotate Clockwise) | KiCad › PCB Editor | feita | 0 | tests/engine.test.ts, e2e/edit.spec.ts | Girar 90° horário (]); também 45° e 180° |
| KP-222 | Simplificar polígonos (Simplify Polygons) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-223 | Pular para o próximo item (Skip) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-224 | Subtrair polígonos (Subtract Polygons) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-225 | Trocar as posições dos selecionados (Swap) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-226 | Trocar as nets entre portas (Swap Gate Nets) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-227 | Trocar as nets entre dois pads (Swap Pad Nets) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-228 | Copiar com ponto de referência (Copy with Reference...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-229 | Mover (Move) | KiCad › PCB Editor | feita | 0 | e2e/edit.spec.ts | arrastar, ou as setas (Shift multiplica por 10) |
| KP-230 | Mover um a um (Move Individually) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-231 | Mover com ponto de referência (Move with Reference...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-232 | Tentar concluir a rota (Attempt Finish) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: Criar trilha a partir do ratsnest traça a ligação desviando de peças |
| KP-233 | Autorrotear os pads selecionados (Attempt Finish Selected (Autoroute)) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: o autorouter roteia a placa inteira, não só a seleção |
| KP-234 | Quebrar a trilha (Break Track) | KiCad › PCB Editor | feita | 0 | tests/edit.test.ts | Adicionar dobra divide a trilha no ponto |
| KP-235 | Pular o item atual da rota em sequência (Cancel Current Item) | KiCad › PCB Editor | falta | 11 | — |  |
| KP-236 | Rotear a partir da outra ponta (Route From Other End) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-237 | Largura de trilha e via sob medida (Custom Track/Via Size…) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: largura e via globais nas regras da aba Roteamento |
| KP-238 | Alternar o modo do roteador (Cycle Router Mode) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-239 | Rotear par diferencial (Route Differential Pair) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-240 | Dimensões do par diferencial (Differential Pair Dimensions...) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-241 | Arrastar trilha mantendo 45° (Drag 45 Degree Mode) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: arrastar um trecho reto mantém os ângulos, sem empurrar |
| KP-242 | Arrastar junta em qualquer ângulo (Drag Free Angle) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: arrastar a dobra move o vértice livre, sem empurrar |
| KP-243 | Roteador em modo de realce de colisão (Router Highlight Mode) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-244 | Colocar via cega ou enterrada (Place Blind/Buried Via) | KiCad › PCB Editor | falta | 11 | — | requer camadas internas |
| KP-245 | Colocar microvia (Place Microvia) | KiCad › PCB Editor | falta | 11 | — | requer camadas internas |
| KP-246 | Colocar via passante na ponta da rota (Place Through Via) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: converter a dobra em via depois de traçar |
| KP-247 | Rotear os selecionados em sequência (Route Selected) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-248 | Rotear os selecionados a partir da outra ponta (Route Selected From Other End) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-249 | Escolher camada e colocar via cega ou enterrada (Select Layer and Place Blind/Buried Via…) | KiCad › PCB Editor | falta | 11 | — | requer camadas internas |
| KP-250 | Escolher camada e colocar microvia (Select Layer and Place Micro Via...) | KiCad › PCB Editor | falta | 11 | — | requer camadas internas |
| KP-251 | Escolher camada e colocar via passante (Select Layer and Place Through Via…) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-252 | Definir o par de camadas (Set Layer Pair...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-253 | Ajustes do roteador interativo (Interactive Router Settings…) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-254 | Roteador em modo empurrar (Router Shove Mode) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-255 | Rotear trilha individual (Route Single Track) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: trilha por cliques que sai dos pinos em 45° e desvia de peças, sem empurrar nem realce de colisão |
| KP-256 | Inverter a postura da trilha (Switch Track Posture) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-257 | Cantos a 45° (Track Corner Mode 45) | KiCad › PCB Editor | falta | 11 | — | P1; parcial: a trilha por cliques já sai a 45°, sem troca de modo |
| KP-258 | Cantos a 90° (Track Corner Mode 90) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-259 | Cantos em arco de 45° (Track Corner Mode Arc 45) | KiCad › PCB Editor | falta | 11 | — |  |
| KP-260 | Cantos em arco de 90° (Track Corner Mode Arc 90) | KiCad › PCB Editor | falta | 11 | — |  |
| KP-261 | Alternar o modo de canto (Track Corner Mode Switch) | KiCad › PCB Editor | falta | 11 | — |  |
| KP-262 | Desfazer o último trecho (Undo Last Segment) | KiCad › PCB Editor | feita | 0 | e2e/circuit.spec.ts | Backspace desfaz a última dobra do fio em andamento |
| KP-263 | Roteador em modo contornar (Router Walkaround Mode) | KiCad › PCB Editor | falta | 11 | — | P1 |
| KP-264 | Desmarcar as trilhas da net (Deselect All Tracks in Net) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-265 | Filtrar a seleção por tipo (Filter Selected Items...) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-266 | Pegar o footprint desligado mais próximo (Grab Nearest Unconnected Footprints) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-267 | Selecionar e expandir a conexão (Select/Expand Connection) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-268 | Selecionar as trilhas da net (Select All Tracks in Net) | KiCad › PCB Editor | falta | 10 | — | parcial: Selecionar todas as trilhas da placa, não por net |
| KP-269 | Selecionar no esquemático (Select on Schematic) | KiCad › PCB Editor | feita | 2 | e2e/navigation.spec.ts | Peça › Ver no esquemático: a mesma seleção, centralizada |
| KP-270 | Selecionar a folha do esquemático (Sheet) | KiCad › PCB Editor | falta | 10 | — | depende das folhas hierárquicas (fase 8) |
| KP-271 | Selecionar os itens da mesma folha (Items in Same Hierarchical Sheet) | KiCad › PCB Editor | falta | 10 | — | depende das folhas hierárquicas (fase 8) |
| KP-272 | Selecionar os footprints desligados (Select All Unconnected Footprints) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-273 | Desrotear o trecho (Unroute Segment) | KiCad › PCB Editor | falta | 11 | — | parcial: Apagar fio até as dobras |
| KP-274 | Desrotear os selecionados (Unroute Selected) | KiCad › PCB Editor | falta | 11 | — | parcial: Apagar trilhas autoroteadas, só na placa toda |
| KP-275 | Ajustar o comprimento do par diferencial (Tune Length of a Differential Pair) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-276 | Ajustar o skew do par diferencial (Tune Skew of a Differential Pair) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-277 | Ajustar o comprimento de uma trilha (Tune Length of a Single Track) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-278 | Forma poligonal de micro-ondas (Draw Microwave Polygonal Shapes) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-279 | Gap de micro-ondas (Draw Microwave Gaps) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-280 | Linha de micro-ondas (Draw Microwave Lines) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-281 | Stub de micro-ondas (Draw Microwave Stubs) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-282 | Stub em arco de micro-ondas (Draw Microwave Arc Stubs) | KiCad › PCB Editor | falta | 10 | — | não descrito nos capítulos do manual |
| KP-283 | Verificador de footprint (Footprint Checker) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-284 | Copiar footprint na biblioteca (Copy Footprint) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-285 | Criar footprint pelo assistente (Create Footprint...) | KiCad › PCB Editor | falta | 5 | — | P1; parcial: DIP, pin header e perfboard/stripboard gerados (peças paramétricas do Fritzing) |
| KP-286 | Recortar footprint na biblioteca (Cut Footprint) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-287 | Apagar footprint da biblioteca (Delete Footprint from Library) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-288 | Duplicar footprint na biblioteca (Duplicate Footprint) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-289 | Editar o footprint escolhido na árvore (Edit Footprint) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-290 | Exportar o footprint atual (Export Current Footprint...) | KiCad › PCB Editor | falta | 5 | — | parcial: o editor de peças baixa a peça como .fzpz |
| KP-291 | Propriedades do footprint (Footprint Properties...) | KiCad › PCB Editor | falta | 5 | — | P1; parcial: metadados da peça no editor de peças |
| KP-292 | Importar footprint de arquivo (Import Footprint...) | KiCad › PCB Editor | falta | 5 | — | parcial: importar peça .fzpz |
| KP-293 | Carregar o footprint da placa (Load footprint from current PCB) | KiCad › PCB Editor | falta | 5 | — | parcial: Editar (editor de peças) na peça do sketch |
| KP-294 | Novo footprint (New Footprint) | KiCad › PCB Editor | falta | 5 | — | P1; parcial: o editor de peças grava uma peça nova a partir de outra |
| KP-295 | Tabela de pads (Pad Table...) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-296 | Colar footprint na biblioteca (Paste Footprint) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-297 | Renomear footprint (Rename Footprint...) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-298 | Reparar footprint (Repair Footprint) | KiCad › PCB Editor | falta | 5 | — |  |
| KP-299 | Inserir o footprint na placa (Insert footprint into PCB) | KiCad › PCB Editor | falta | 5 | — | parcial: a peça gravada no editor pode trocar a do sketch |
| KP-300 | Gerar áreas de regra de posicionamento (Generate Placement Rule Areas...) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-301 | Repetir o layout entre canais (Repeat Layout...) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-302 | Aplicar as propriedades padrão aos pads selecionados (Paste Default Pad Properties to Selected) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-303 | Copiar as propriedades do pad como padrão (Copy Pad Properties to Default) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-304 | Levar as propriedades do pad aos outros (Push Pad Properties to Other Pads...) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-305 | Propriedades padrão de pad (Default Pad Properties…) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-306 | Renumerar pads (Renumber Pads…) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-307 | Editar o pad como formas gráficas (Edit Pad as Graphic Shapes) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-308 | Adicionar pad (Add Pad) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-309 | Concluir a edição do pad (Finish Pad Edit) | KiCad › PCB Editor | falta | 5 | — | P1 |
| KP-310 | Apagar bloco de projeto (Delete Design Block) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-311 | Propriedades do bloco de projeto (Properties…) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-312 | Gravar a placa como bloco de projeto (Save Board as Design Block...) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-313 | Gravar a seleção como bloco de projeto (Save Selection as Design Block...) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-314 | Painel de blocos de projeto (Design Blocks) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-315 | Atualizar o bloco de projeto pela placa (Update Design Block from Board) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-316 | Atualizar o bloco de projeto pela seleção (Update Design Block from Selection) | KiCad › PCB Editor | falta | 15 | — | P2 |
| KP-317 | Criar canto (Create Corner) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-318 | Editar arco mantendo o centro (Keep Arc Center, Adjust Radius) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-319 | Editar arco mantendo as pontas (Keep Arc Endpoints or Direction of Starting Point) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-320 | Editar arco mantendo raio e centro (Keep Arc Radius and Center, adjust angle) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-321 | Chanfrar canto (Chamfer Corner) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-322 | Remover canto (Remove Corner) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-323 | Deslocamento exato interativo (Interactive Offset Tool) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-324 | Posicionar em relação a (Position Relative To…) | KiCad › PCB Editor | falta | 10 | — | P2 |
| KP-325 | Reanotação geográfica (Geographical Reannotate...) | KiCad › PCB Editor | falta | 8 | — | P1 |
| KP-326 | Abrir a pasta de plugins (Open Plugin Directory) | KiCad › PCB Editor | não se aplica | — | — | abre o gerenciador de arquivos do sistema na pasta de plugins Python |
| KP-327 | Editar tabela (Edit Table...) | KiCad › PCB Editor | falta | 10 | — |  |
| KP-328 | Preencher rascunho das zonas selecionadas (Draft Fill Selected Zone(s)) | KiCad › PCB Editor | falta | 10 | — | P1 |
| KP-329 | Preencher todas as zonas (Fill All Zones) | KiCad › PCB Editor | falta | 10 | — | P1; parcial: Preencher com cobre ou com terra refaz o cobre da face inteira, sem zonas |
| KP-330 | Esvaziar as zonas selecionadas (Unfill Selected Zone(s)) | KiCad › PCB Editor | feita | 0 | e2e/pcb.spec.ts | selecionar o preenchimento e apagar; não há zona que guarde o contorno |
| KP-331 | Esvaziar todas as zonas (Unfill All Zones) | KiCad › PCB Editor | feita | 0 | e2e/pcb.spec.ts | Roteamento › Preenchimento de cobre › Remover preenchimento |
| KP-332 | Diminuir a amplitude do padrão de comprimento (Decrease Amplitude) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-333 | Aumentar a amplitude do padrão de comprimento (Increase Amplitude) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-334 | Diminuir o espaçamento do padrão de comprimento (Decrease Spacing) | KiCad › PCB Editor | falta | 11 | — | P2 |
| KP-335 | Aumentar o espaçamento do padrão de comprimento (Increase Spacing) | KiCad › PCB Editor | falta | 11 | — | P2 |

### Visualizador 3D

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| K3-001 | Mostrar modelos 3D marcados como não montar (Show 3D Models marked DNP) | KiCad › 3D Viewer | falta | 12 | — | P1; não montar depende das variantes (fase 15) |
| K3-002 | Mostrar modelos 3D fora do arquivo de posição (Show 3D Models not in POS File) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-003 | Mostrar modelos 3D de tipo não especificado (Show Unspecified 3D Models) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-004 | Mostrar modelos 3D SMD (Show SMD 3D Models) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-005 | Mostrar modelos 3D PTH (Show Through Hole 3D Models) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-006 | Copiar a imagem 3D (Copy 3D image to clipboard) | KiCad › 3D Viewer | falta | 12 | — | P2 |
| K3-007 | Exportar a imagem 3D (Export Image...) | KiCad › 3D Viewer | falta | 12 | — | P2; parcial: Exportar › Como imagem só das vistas 2D |
| K3-008 | Virar a placa (Flip Board) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-009 | Vista inicial (Home View) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-010 | Cores de CAD (Render CAD Colors) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-011 | Cores sólidas dos modelos (Render Solid Colors) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-012 | Materiais realistas (Render Realistic Materials) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-013 | Mover a placa para baixo (Move Board Down) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-014 | Mover a placa para a esquerda (Move Board Left) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-015 | Mover a placa para a direita (Move Board Right) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-016 | Mover a placa para cima (Move Board Up) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-017 | Sem grade 3D (No 3D Grid) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-018 | Definir o pivô de rotação (Set Pivot) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-019 | Recarregar a placa no 3D (Reload board) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-020 | Girar em X no sentido horário (Rotate X Clockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-021 | Girar em X no sentido anti-horário (Rotate X Counterclockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-022 | Girar em Y no sentido horário (Rotate Y Clockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-023 | Girar em Y no sentido anti-horário (Rotate Y Counterclockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-024 | Girar em Z no sentido horário (Rotate Z Clockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-025 | Girar em Z no sentido anti-horário (Rotate Z Counterclockwise) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-026 | Grade 3D de 10 mm (3D Grid 10mm) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-027 | Grade 3D de 1 mm (3D Grid 1mm) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-028 | Grade 3D de 2,5 mm (3D Grid 2.5mm) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-029 | Grade 3D de 5 mm (3D Grid 5mm) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-030 | Mostrar as caixas dos modelos (Show Model Bounding Boxes) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-031 | Painel de aparência do 3D (Show Appearance Manager) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-032 | Navegador 3D (cubo de orientação) (Show 3D Navigator) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-033 | Projeção ortográfica (Toggle Orthographic Projection) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-034 | Render por raytracing (Use raytracing) | KiCad › 3D Viewer | falta | 12 | — | P2 |
| K3-035 | Vista de trás (View Back) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-036 | Vista de baixo (View Bottom) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-037 | Vista da frente (View Front) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-038 | Vista da esquerda (View Left) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-039 | Vista da direita (View Right) | KiCad › 3D Viewer | falta | 12 | — | P1 |
| K3-040 | Vista de cima (View Top) | KiCad › 3D Viewer | falta | 12 | — | P1 |

### Comuns só da PCB

Nenhuma linha: as 161 ações da seção Common de `pcbnew_actions_reference.adoc` são idênticas, em nome, atalho e descrição, às 161 da seção Common de `eeschema_actions_reference.adoc`, e ficam na parte do outro agente.

### GerbView

Sem tabela de ações no manual; uma linha por função descrita em `gerbview/gerbview.adoc`.

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KG-001 | Carregar arquivos Gerber RS-274X e X2 (Load Gerber files) | KiCad › GerbView | falta | 13 | — | P2; os Gerbers do CircuitMaster só são conferidos nos testes (build/gerber) |
| KG-002 | Carregar arquivos de furação Excellon (Load Excellon drill files) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-003 | Até 32 arquivos abertos ao mesmo tempo, um por camada (Up to 32 files) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-004 | Limpar todas as camadas (Clear all layers) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-005 | Tamanho da página (Set page size) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-006 | Imprimir camadas (Print) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-007 | Redesenhar a vista (Redraw view) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-008 | Ampliar e reduzir (Zoom in or out) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-009 | Enquadrar a página (Zoom to fit page) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-010 | Zoom na seleção (Zoom to selection) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-011 | Escolher a camada ativa (Select active layer) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-012 | Informações da camada ativa (Display info about active layer) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-013 | Realçar os itens do componente, X2 (Highlight items belonging to selected component) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-014 | Realçar os itens da net, X2 (Highlight items belonging to selected net) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-015 | Realçar os itens com o atributo, X2 (Highlight items with the selected attribute) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-016 | Realçar os itens do D-code na camada ativa (Highlight items of selected D Code) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-017 | Selecionar itens (Select items) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-018 | Medir entre dois pontos (Measure between two points / Measure Tool) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-019 | Mostrar e ocultar a grade (Toggle grid visibility) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-020 | Coordenadas polares (Toggle polar coordinates display) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-021 | Unidades polegada, mil ou mm (Select inch, mils, or millimeter units) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-022 | Cursor em cruz de tela inteira (Toggle full-screen cursor) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-023 | Flashes em contorno (Display flashed items in sketch mode) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-024 | Linhas em contorno (Display lines in sketch mode) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-025 | Polígonos em contorno (Display polygons in sketch mode) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-026 | Objetos negativos em cor fantasma (Show negative objects in ghost color) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-027 | Mostrar D-codes (Show/hide D Codes) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-028 | Comparar camadas em modo diferença (Display layers in diff mode) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-029 | Esmaecer as camadas inativas (Toggle inactive layers dimmed) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-030 | Mostrar e ocultar o gerenciador de camadas (Show/hide layer manager) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-031 | Espelhar os Gerbers (Show Gerbers as mirror image) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-032 | Gerenciador de camadas: visibilidade, camada ativa, cor e ordem (Layers Manager › Layers) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-033 | Aba Itens: cor e exibição da grade, dos D-codes e dos negativos (Layers Manager › Items) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-034 | Exportar para o editor de PCB (Export to PCB Editor) | KiCad › GerbView | falta | 13 | — | P2; flashes viram vias e linhas viram trilhas |
| KG-035 | Listar D-codes (List DCodes) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-036 | Mostrar o código-fonte da camada (Show Source) | KiCad › GerbView | falta | 13 | — | P2 |
| KG-037 | Limpar a camada atual (Clear Current Layer) | KiCad › GerbView | falta | 13 | — | P2 |

### Calculadora

Sem tabela de ações no manual; uma linha por ferramenta descrita em `pcb_calculator/pcb_calculator.adoc`.

| ID | Função | Origem | Status | Fase | Teste | Nota |
|---|---|---|---|---|---|---|
| KK-001 | Reguladores: resistores de regulador linear e LDO, tipo padrão e de 3 terminais (Regulators) | KiCad › Calculadora | falta | 10 | — | P1 |
| KK-002 | Atenuadores de RF: PI, T, T em ponte e divisor resistivo (RF-Attenuators) | KiCad › Calculadora | falta | 10 | — | P1 |
| KK-003 | Série E: combinações de resistores padrão para um valor, excluindo valores (E-Series) | KiCad › Calculadora | falta | 10 | — | P1; parcial: o cartão de valor anda pela série E12 com ‹ › |
| KK-004 | Código de cores do resistor por tolerância (Color-Code) | KiCad › Calculadora | falta | 10 | — | P1; parcial: o resistor da protoboard desenha as faixas do valor |
| KK-005 | Linha de transmissão: microstrip, coplanar, coplanar com terra, guia retangular, coaxial, microstrip acoplada, stripline, par trançado (TransLine) | KiCad › Calculadora | falta | 10 | — | P1 |
| KK-006 | Via: propriedades elétricas e térmicas de via ou furo metalizado (Via Size) | KiCad › Calculadora | falta | 10 | — | P1 |
| KK-007 | Largura de trilha por corrente e elevação de temperatura, IPC-2221 (Track Width) | KiCad › Calculadora | falta | 10 | — | P1; a seção 11.4 pede também IPC-2152 |
| KK-008 | Espaçamento elétrico mínimo por tensão, inclusive acima de 500 V (Electrical Spacing) | KiCad › Calculadora | falta | 10 | — | P1 |
| KK-009 | Classes de placa: classes IPC-6011 e tipos IPC-6012 (Board-Classes) | KiCad › Calculadora | falta | 10 | — | P1 |

### Seções dos manuais (pcbnew, gerbview, pcb_calculator)

Fase = fase do que falta na seção (0 quando todas as linhas estão feitas). "Comuns (…)" aponta para ações da seção Common, que estão na parte do outro agente.

| ID | Manual | Seção | Fase | Linhas da matriz |
|---|---|---|---|---|
| MP-001 | pcbnew | Actions reference | — | fonte das tabelas Editor de PCB e Visualizador 3D: KP-001–KP-335, K3-001–K3-040 (Common com o outro agente) |
| MP-002 | pcbnew | Introduction to the KiCad PCB Editor (interface, navegação, atalhos) | 2 | KP-125; Comuns (zoom, pan, preferências, atalhos) |
| MP-003 | pcbnew | Display and selection controls › Board layers | 3, 10 | KP-016, KP-021–KP-056, KP-252 |
| MP-004 | pcbnew | Display and selection controls › The appearance panel | 10 | KP-019–KP-020, KP-058, KP-065, KP-067, KP-112, KP-126 |
| MP-005 | pcbnew | Display and selection controls › Selection and the selection filter | 10, 15 | KP-264–KP-265, KP-267–KP-268, KP-270–KP-271; Comuns (seleção) |
| MP-006 | pcbnew | Display and selection controls › Net highlighting | 10 | KP-092, KP-113–KP-114, KP-127, KP-129 |
| MP-007 | pcbnew | Display and selection controls › Cross-probing from the schematic | 2 | KP-269 |
| MP-008 | pcbnew | Display and selection controls › Left toolbar display controls | 3, 10 | KP-018, KP-057, KP-060, KP-062–KP-063, KP-069–KP-075; Comuns (grade, unidades, cursor) |
| MP-009 | pcbnew | Creating a PCB › Basic PCB concepts | 10 | texto conceitual, sem ação |
| MP-010 | pcbnew | Creating a PCB › Capabilities | 10 | limites do editor (camadas, tamanho), sem ação |
| MP-011 | pcbnew | Creating a PCB › Starting from a schematic | 6 | Comuns (Update PCB from Schematic) |
| MP-012 | pcbnew | Creating a PCB › Starting from scratch | 10 | contorno e camadas: ver Board outlines e Board setup |
| MP-013 | pcbnew | Board setup › Configuring board stackup and physical parameters | 10 | KP-091, KP-181, KP-187 |
| MP-014 | pcbnew | Board setup › Configuring text and graphics | 10 | KP-091 |
| MP-015 | pcbnew | Board setup › Configuring design rules | 10 | KP-089, KP-091 |
| MP-016 | pcbnew | Board setup › Embedding files | 6, 12 | KP-093 |
| MP-017 | pcbnew | Board setup › Importing settings | 6 | importa a configuração de outro .kicad_pcb |
| MP-018 | pcbnew | Editing a board › Placement and drawing operations | 10, 13 | KP-094–KP-095, KP-117–KP-120, KP-167, KP-185, KP-204, KP-216, KP-220–KP-221, KP-223, KP-225, KP-228–KP-231 |
| MP-019 | pcbnew | Editing a board › Grids and snapping | 2 | Comuns (grade); grade por tipo de objeto, seção 11.7 |
| MP-020 | pcbnew | Editing a board › Editing object properties | 10 | KP-219; Comuns (Properties) |
| MP-021 | pcbnew | Editing a board › Board outlines (Edge Cuts) | 10 | KP-077, KP-079–KP-081, KP-083, KP-148, KP-151, KP-163, KP-165–KP-166, KP-168–KP-180, KP-183, KP-188–KP-189, KP-194–KP-195, KP-200, KP-203, KP-205–KP-207, KP-210–KP-215, KP-217, KP-222, KP-224, KP-317–KP-322, KP-327; mesmas ferramentas de desenho na camada Edge.Cuts |
| MP-022 | pcbnew | Editing a board › Working with footprints | 5, 10 | KP-012–KP-013, KP-086–KP-087, KP-123, KP-146–KP-147, KP-156–KP-158, KP-199, KP-209, KP-218, KP-266, KP-272, KP-323–KP-324 |
| MP-023 | pcbnew | Editing a board › Working with pads | 10 | pads soltos na placa; edição de pads no editor de footprints (MP Footprint pads) |
| MP-024 | pcbnew | Editing a board › Working with zones | 10 | KP-076, KP-082, KP-135–KP-136, KP-193, KP-197–KP-198, KP-328–KP-331 |
| MP-025 | pcbnew | Editing a board › Routing tracks and vias | 3, 10, 11 | KP-014–KP-015, KP-090, KP-130–KP-131, KP-133–KP-134, KP-149, KP-152, KP-154, KP-196, KP-201–KP-202, KP-208, KP-232–KP-238, KP-241–KP-251, KP-253–KP-263, KP-273–KP-274 |
| MP-026 | pcbnew | Editing a board › Routing differential pairs | 11 | KP-239–KP-240 |
| MP-027 | pcbnew | Editing a board › Length tuning | 11 | KP-142–KP-145, KP-275–KP-277, KP-332–KP-335 |
| MP-028 | pcbnew | Editing a board › Teardrops | 10 | KP-150 |
| MP-029 | pcbnew | Editing a board › Backdrills and hole post-machining | 10 | P3; propriedades do pad e da via, sem ação própria |
| MP-030 | pcbnew | Editing a board › Graphics and text | 10 | KP-077, KP-079–KP-081, KP-083, KP-148, KP-151, KP-163, KP-165–KP-166, KP-168–KP-180, KP-183, KP-188–KP-189, KP-194–KP-195, KP-200, KP-203, KP-205–KP-207, KP-210–KP-215, KP-217, KP-222, KP-224, KP-317–KP-322, KP-327 |
| MP-031 | pcbnew | Editing a board › Rule areas (keepouts) | 10 | KP-078, KP-190 |
| MP-032 | pcbnew | Editing a board › Locking | 10 | KP-121, KP-128, KP-132; trava de peças feita, trava de trilhas falta |
| MP-033 | pcbnew | Editing a board › Groups | 10 | Comuns (Group, Ungroup, Enter/Leave Group) |
| MP-034 | pcbnew | Editing a board › Aligning objects | 0 | KP-001–KP-006 |
| MP-035 | pcbnew | Editing a board › Distributing objects | 10 | KP-007–KP-010 |
| MP-036 | pcbnew | Editing a board › Arrays | 10 | KP-011 |
| MP-037 | pcbnew | Editing a board › Using reference images | 10 | KP-186 |
| MP-038 | pcbnew | Editing a board › Pin and gate swapping | 10 | KP-226–KP-227 |
| MP-039 | pcbnew | Forward and back annotation › Update PCB From Schematic | 6 | KP-115; Comuns (Update PCB from Schematic) |
| MP-040 | pcbnew | Forward and back annotation › Update Schematic from PCB | 6 | Comuns (Update Schematic from PCB) |
| MP-041 | pcbnew | Forward and back annotation › Geographical re-annotation | 8 | KP-325 |
| MP-042 | pcbnew | Inspecting a board › Design rules checking | 10 | KP-084, KP-158–KP-160 |
| MP-043 | pcbnew | Inspecting a board › Board Statistics | 10 | KP-161 |
| MP-044 | pcbnew | Inspecting a board › Measurement tool | 10 | Comuns (Measure Tool) |
| MP-045 | pcbnew | Inspecting a board › Find tool | 10 | Comuns (Find, Find Next, Find Previous) |
| MP-046 | pcbnew | Inspecting a board › Search panel | 10 | Comuns (Search) |
| MP-047 | pcbnew | Inspecting a board › 3D Viewer | 12 | K3-001–K3-040; Comuns (3D Viewer) |
| MP-048 | pcbnew | Inspecting a board › Net inspector | 10 | KP-066 |
| MP-049 | pcbnew | Importing boards from other EDA tools | 16 | KP-122 |
| MP-050 | pcbnew | Importing boards from other EDA tools › Importing Specctra session files | 16 | KP-116 |
| MP-051 | pcbnew | Generating outputs › Plotting (Gerber / PostScript / SVG / DXF / PDF) | 13 | KP-107; Comuns (Plot) |
| MP-052 | pcbnew | Generating outputs › Drill files | 13 | KP-106 |
| MP-053 | pcbnew | Generating outputs › IPC-2581 | 13 | KP-108 |
| MP-054 | pcbnew | Generating outputs › ODB++ | 13 | KP-109 |
| MP-055 | pcbnew | Generating outputs › Component placement (position) files | 13 | KP-110; formatos .pos, CSV e Gerber de posição faltam |
| MP-056 | pcbnew | Generating outputs › Footprint reports | 13 | KP-111 |
| MP-057 | pcbnew | Generating outputs › IPC-D-356 netlists | 0 | KP-105 |
| MP-058 | pcbnew | Generating outputs › Bill of Materials | 0 | KP-104 |
| MP-059 | pcbnew | Generating outputs › Printing | 13 | Comuns (Print) |
| MP-060 | pcbnew | Generating outputs › Specctra DSN | 13 | KP-102 |
| MP-061 | pcbnew | Generating outputs › GenCAD | 13 | KP-098 |
| MP-062 | pcbnew | Generating outputs › VRML | 12 | KP-103 |
| MP-063 | pcbnew | Generating outputs › IDF | 12 | KP-100 |
| MP-064 | pcbnew | Generating outputs › 3D models (STEP / GLB / BREP / XAO / PLY / STL / STPZ / U3D / PDF) | 12 | KP-101 |
| MP-065 | pcbnew | Generating outputs › Footprint association (CMP) files | 13 | KP-096 |
| MP-066 | pcbnew | Generating outputs › Hyperlynx | 13 | KP-099 |
| MP-067 | pcbnew | Design variants | 15 | K3-001 (não montar) depende disto |
| MP-068 | pcbnew | Footprints and footprint libraries › Managing footprint libraries | 5 | KP-097; Comuns (Manage Footprint Libraries) |
| MP-069 | pcbnew | Footprints and footprint libraries › Browsing footprint libraries | 5 | KP-017, KP-059, KP-061; Comuns (Footprint Library Browser) |
| MP-070 | pcbnew | Creating and editing footprints › Footprint editor overview, browsing, modifying and saving | 5 | KP-284, KP-286–KP-290, KP-292–KP-293, KP-296–KP-297, KP-299; Comuns (Footprint Editor) |
| MP-071 | pcbnew | Creating and editing footprints › Creating a new footprint library | 5 | Comuns (biblioteca nova) |
| MP-072 | pcbnew | Creating and editing footprints › Creating a new footprint | 5 | KP-294 |
| MP-073 | pcbnew | Creating and editing footprints › Editing footprint properties | 5 | KP-192, KP-291 |
| MP-074 | pcbnew | Creating and editing footprints › Footprint pads | 5 | KP-295, KP-302–KP-309 |
| MP-075 | pcbnew | Creating and editing footprints › Footprint graphics and text | 5 | mesmas ferramentas de KP Graphics and text no editor de footprints |
| MP-076 | pcbnew | Creating and editing footprints › Footprint fields | 5 | campos do footprint, sem ação própria |
| MP-077 | pcbnew | Creating and editing footprints › Footprint layers | 5 | camadas do footprint, sem ação própria |
| MP-078 | pcbnew | Creating and editing footprints › Clearance overrides | 5 | folga por footprint e por pad, sem ação própria |
| MP-079 | pcbnew | Creating and editing footprints › Pad connections, net ties, and jumper pads | 5 | P1; propriedades do footprint, sem ação própria |
| MP-080 | pcbnew | Creating and editing footprints › 3D models | 5 | P1; modelo 3D com deslocamento no footprint; ver também fase 12 |
| MP-081 | pcbnew | Creating and editing footprints › Embedding files | 5 | P2 |
| MP-082 | pcbnew | Creating and editing footprints › Rule areas | 5 | mesmas ações de KP Rule areas no editor de footprints |
| MP-083 | pcbnew | Creating and editing footprints › Reference images | 5 | mesmas ações de KP Reference images no editor de footprints |
| MP-084 | pcbnew | Creating and editing footprints › Footprint wizards | 5 | KP-137–KP-141, KP-285 |
| MP-085 | pcbnew | Creating and editing footprints › Checking footprints | 5 | KP-283, KP-298 |
| MP-086 | pcbnew | Multichannel layout | 11 | KP-300–KP-301 |
| MP-087 | pcbnew | Design blocks | 15 | KP-164, KP-182, KP-184, KP-191, KP-310–KP-316 |
| MP-088 | pcbnew | Advanced topics › Configuration and Customization | 2 | Comuns (preferências, atalhos, cores) |
| MP-089 | pcbnew | Advanced topics › Text variables | 15 | P2 |
| MP-090 | pcbnew | Advanced topics › Text expressions | 15 | P2 |
| MP-091 | pcbnew | Advanced topics › Graphical design rule editor | 10 | KP-085 |
| MP-092 | pcbnew | Advanced topics › Custom design rules | 10 | P2; linguagem de regras, editada em Board Setup (KP-091) |
| MP-093 | pcbnew | Advanced topics › Scripting | 16 | KP-068, KP-326; API de extensões; o console Python não se aplica |
| MP-094 | pcbnew | Advanced topics › IDF component outlines | 12 | P3; formato de contorno usado pela exportação IDF (KP-100) |
| MP-095 | gerbview | Introduction to GerbView | 13 | KG-001–KG-003 |
| MP-096 | gerbview | Interface › Main window | 13 | descrição da janela; funções nas linhas KG-001–KG-037 |
| MP-097 | gerbview | Interface › Top toolbar | 13 | KG-001–KG-002, KG-004–KG-016 |
| MP-098 | gerbview | Interface › Left toolbar | 13 | KG-017–KG-031 |
| MP-099 | gerbview | Interface › Layers Manager | 13 | KG-032–KG-033 |
| MP-100 | gerbview | Commands in menu bar › File menu | 13 | KG-034 |
| MP-101 | gerbview | Commands in menu bar › Tools menu | 13 | KG-018, KG-035–KG-037 |
| MP-102 | gerbview | Printing | 13 | KG-005–KG-006 |
| MP-103 | pcb_calculator | Introduction | 10 | lista as ferramentas: KK-001–KK-009 (Comuns: Calculator Tools) |
| MP-104 | pcb_calculator | Calculators › Regulators | 10 | KK-001 |
| MP-105 | pcb_calculator | Calculators › RF-Attenuators | 10 | KK-002 |
| MP-106 | pcb_calculator | Calculators › E-Series | 10 | KK-003 |
| MP-107 | pcb_calculator | Calculators › Color-Code | 10 | KK-004 |
| MP-108 | pcb_calculator | Calculators › TransLine | 10 | KK-005 |
| MP-109 | pcb_calculator | Calculators › Via Size | 10 | KK-006 |
| MP-110 | pcb_calculator | Calculators › Track Width | 10 | KK-007 |
| MP-111 | pcb_calculator | Calculators › Electrical Spacing | 10 | KK-008 |
| MP-112 | pcb_calculator | Calculators › Board-Classes | 10 | KK-009 |

### Resumo

| Tabela | Linhas | feita | falta | não se aplica |
|---|---|---|---|---|
| Editor de PCB | 335 | 27 | 306 | 2 |
| Visualizador 3D | 40 | 0 | 40 | 0 |
| Comuns só da PCB | 0 | 0 | 0 | 0 |
| GerbView | 37 | 0 | 37 | 0 |
| Calculadora | 9 | 0 | 9 | 0 |
| **Total** | **421** | **27** | **392** | **2** |

| Fase | 0 | 1 | 2 | 3 | 5 | 6 | 8 | 10 | 11 | 12 | 13 | 15 | 16 | — | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Editor de PCB | 25 | 1 | 1 | 3 | 41 | 3 | 1 | 182 | 47 | 4 | 11 | 12 | 2 | 2 | 335 |
| Visualizador 3D | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40 | 0 | 0 | 0 | 0 | 40 |
| Comuns só da PCB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| GerbView | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 37 | 0 | 0 | 0 | 37 |
| Calculadora | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| **Total** | **25** | **1** | **1** | **3** | **41** | **3** | **1** | **191** | **47** | **44** | **48** | **12** | **2** | **2** | **421** |

Seções dos manuais: 112 linhas (MP-001–MP-112).
