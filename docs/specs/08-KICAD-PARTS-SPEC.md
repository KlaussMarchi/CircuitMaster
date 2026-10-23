# 08 — BIBLIOTECAS DO KICAD COMO PEÇAS

Fase 5 do plano: qualquer símbolo do KiCad vira peça do CircuitMaster nas três vistas — o símbolo é o esquemático, o
footprint é a PCB e a protoboard sai do footprint —, aparece na mesma busca das peças do Fritzing e grava no `.fzz`
como peça própria, que o Fritzing abre. Sobre a camada da spec 07 (acervo em `/kicad`, `core/Sexpr`, `kicad-cli`).

## 1. MÓDULOS

| Módulo | O que faz |
|---|---|
| `core/KicadDraw` | geometria comum: mm → mil, caixa, arco de três pontos, cabeçalho do SVG, escape de XML |
| `core/KicadSymbol` | lê o `.kicad_sym` (com `extends`, unidades, estilo 0 e o De Morgan fora) e desenha o esquemático |
| `core/KicadFootprint` | lê o `.kicad_mod` (pads, furos, giro, camadas, `fp_*`) e desenha a PCB e a protoboard |
| `core/KicadPart` | `moduleId`, caminhos, footprint padrão, o `.fzp` e o pacote; `readKicadPart` lê do acervo |

A `Library` só conhece o prefixo `kicad:`: os módulos do KiCad carregam por import dinâmico, fora do JavaScript
inicial.

## 2. SÍMBOLO → ESQUEMÁTICO

- Cada arquivo de `<Biblioteca>.kicad_symdir` tem um símbolo. O derivado (`extends`) herda desenho e pinos do pai
  (no KiCad o pai é sempre raiz: um nível só) e sobrepõe os campos.
- Subsímbolo `NOME_U_E`: unidade `U` (0 = todas) e estilo `E` (0 = todos, 1 = normal, 2 = De Morgan, que fica fora).
- Pinos únicos pelo número, na ordem do símbolo, viram `connector0…N-1`; pinos empilhados com o mesmo número são um
  conector. Desenho em mil, `y` para baixo, as unidades lado a lado a 200 mil; cada pino tem o retângulo
  `connectorNpin` no traço e o `connectorNterminal` na ponta onde o fio liga; pino oculto só leva os dois retângulos.
- Corpo: retângulo, círculo, arco de três pontos, polilinha, Bézier e texto (markup `~{}`, `_{}`, `^{}`), traço
  mínimo de 6 mil, preenchimento `outline` preto e `background` amarelo-claro como no Eeschema.
- Oráculo: os traços dos pinos de cada unidade, transladados ao canto, são os mesmos do `kicad-cli sym export svg`.

## 3. FOOTPRINT → PCB E PROTOBOARD

- Pad: número, tipo (`thru_hole`, `smd`, `np_thru_hole`, `connect`), forma, centro, giro (anti-horário na tela),
  tamanho, furo (redondo ou oblongo), deslocamento do furo, camadas e a razão do canto do `roundrect`.
- Conector: o primeiro pad de cada número no cobre de cima (ou passante), menos os furos sem metal; ligado ao pino
  do símbolo de mesmo número.
- PCB no padrão do Fritzing, em mil: `silkscreen` (F.SilkS), `silkscreen0` (B.SilkS), `copper1` com os SMD e, dentro
  dele, `copper0` com os passantes, então os dois cobres acham o mesmo pad. SMD é `connectorNpad`; passante é
  `connectorNpin`. O corpo do pad é círculo ou retângulo com canto (oval: metade do lado menor; `roundrect`: a
  razão), girado; o furo metalizado é o anel do Fritzing, de diâmetro `2r − largura` e largura até o lado menor do
  pad, de onde o CAM tira o furo (spec 03 §2.3); furo sem metal é círculo sem traço.
- Protoboard: o contorno de fabricação (F.Fab) e os pads em metal no mesmo lugar, cada um o `connectorNpin`; as peças
  passantes de 0,1 in encaixam nos furos.
- Quadro: pads, serigrafia, fabricação e cerca, com 20 mil de folga.
- Oráculo: a caixa de cada pad do cobre de cima e cada furo, transladados ao canto, são os do `kicad-cli fp export
  svg --layers F.Cu` (até 0,02 mm, a aproximação dos arcos), e cada conector do nosso SVG ocupa a caixa do pad.
- Ainda não: pads `trapezoid` e `custom` ficam no retângulo do tamanho; o furo oblongo vira o redondo do lado menor;
  SMD só na face de baixo e pads repetidos de um número não viram conector.

## 4. PEÇA DE TRÊS VISTAS (`core/KicadPart`)

- `moduleId` = `kicad:<Biblioteca>:<Símbolo>`, com `@<BibliotecaFp>:<Footprint>` quando o footprint é escolhido.
- Footprint: o escolhido, senão o campo `Footprint`, senão o primeiro footprint passante da lista padrão que casa
  com o `ki_fp_filters` do símbolo (resistor axial, eletrolítico radial, cerâmico, indutor axial, diodo DO-41, LED de
  5 mm, cristal HC49, trimpot, TO-92). Sem nenhum, a peça só existe no esquemático, como a Fonte DC do Fritzing.
- `.fzp`: título = nome do símbolo, rótulo = prefixo do `Reference`, família = biblioteca, propriedades `kicad
  symbol`, `description`, `footprint`, `datasheet` e `package`; autor "KiCad (CC BY-SA 4.0)", a atribuição que vai no
  `.fzz`. Conector SMD é do tipo `pad`, os demais `male`.
- A `Library` monta o pacote (`.fzp` e os SVG das vistas) na primeira carga e o trata como peça de pacote: o `.fzz`
  gravado leva a peça inteira e reabre sem o acervo do KiCad.

## 5. BUSCA UNIFICADA

- O servidor de dados monta `symbols-index.json` (biblioteca, nome, descrição, palavras-chave de cada símbolo; 0,3 s
  para os 22.905) com as outras listagens.
- O indexador, depois do acervo do Fritzing, carrega esse resumo; a busca devolve as peças do Fritzing pela nota de
  `core/Search` e, depois, até 100 símbolos do KiCad que têm todos os termos: o nome igual ao primeiro termo, depois o
  que começa por ele, nomes curtos antes. A busca espera o resumo, então a primeira busca depois de abrir já os vê.
- No painel de peças o símbolo aparece com a família "KiCad · <Biblioteca>" e põe como qualquer peça.

## 6. PLANO DE TESTES

| Teste | Onde |
|---|---|
| Símbolo: pinos, unidades, derivado; o esquemático tem `connectorNpin` e `connectorNterminal` por pino | `tests/kicad.test.ts` |
| Oráculo dos símbolos: traços dos pinos iguais ao `sym export svg` | `tests/kicad.test.ts` |
| Footprint: pads, furos, giro e camadas; cada conector do SVG ocupa a caixa do pad | `tests/kicad.test.ts` |
| Oráculo dos footprints: pads e furos iguais ao `fp export svg` em 9 footprints (passante, SMD, oval, girado, furo oblongo, sem metal) | `tests/kicad.test.ts` |
| Peça de três vistas pela `Library`: pinos nas três vistas, pacote do `.fzz`, footprint padrão e escolhido | `tests/kicad.test.ts` |
| Fio no esquemático liga as mesmas portas na protoboard e na PCB | `tests/kicad.test.ts` |
| Busca unificada, pôr no quadro, as três vistas e o `.fzz` com a peça | `e2e/kicad.spec.ts` |
