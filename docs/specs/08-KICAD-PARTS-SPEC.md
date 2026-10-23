# 08 — BIBLIOTECAS DO KICAD COMO PEÇAS

Fase 5 do plano: qualquer símbolo das bibliotecas do KiCad vira peça do CircuitMaster nas três vistas — o símbolo é o
esquemático, o footprint é a PCB e a protoboard sai do footprint —, entra no mesmo catálogo das peças do acervo do
Fritzing, sem separação de origem (§5), e grava no `.fzz` como peça própria, que o Fritzing abre. Sobre a camada da spec 07 (acervo em `/kicad`, `core/Sexpr`, `kicad-cli`).

## 1. MÓDULOS

| Módulo | O que faz |
|---|---|
| `core/KicadDraw` | geometria comum: mm → mil, caixa, arco de três pontos, cabeçalho do SVG, escape de XML |
| `core/KicadSymbol` | lê o `.kicad_sym` (com `extends`, unidades, estilo 0 e o De Morgan fora) e desenha o esquemático |
| `core/KicadFootprint` | lê o `.kicad_mod` (pads, furos, giro, camadas, `fp_*`) e desenha a PCB e a protoboard |
| `core/KicadPart` | `moduleId`, caminhos, footprint padrão, o `.fzp` e o pacote; `readKicadPart` lê do acervo |

A `Library` só conhece o prefixo `cm:`: os módulos do KiCad carregam por import dinâmico, fora do JavaScript
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
- Protoboard: quando todo pino tem pad e os pads são passantes na grade de 0,1 in, o contorno de fabricação (F.Fab) e
  os pads em metal, com o furo de cada conector como `connectorNpin` (o furo fica no `(at)` do pad; o cobre pode estar
  deslocado dele); senão (SMD, passo fora de 0,1 in, pad com outro nome ou sem footprint), uma **placa adaptadora**
  gerada: os pinos a 0,1 in em duas fileiras numeradas como um CI DIP (uma fileira até 3 pinos; fileiras a 300 mil, ou
  600 acima de 28 pinos) e o nome no meio. Os símbolos de alimentação (GND, VCC) só existem no esquemático. Dos 22.905
  símbolos, 2.924 entram pelo footprint, 19.815 pela placa adaptadora e 166 ficam só no esquemático; todo pino tem lugar
  na protoboard e cai na grade (`build/kicad-breadboard-report.txt`).
- Quadro: pads, serigrafia, fabricação e cerca, com 20 mil de folga.
- Oráculo: a caixa de cada pad do cobre de cima e cada furo, transladados ao canto, são os do `kicad-cli fp export
  svg --layers F.Cu` (até 0,02 mm, a aproximação dos arcos), e cada conector do nosso SVG ocupa a caixa do pad.
- Ainda não: pads `trapezoid` e `custom` ficam no retângulo do tamanho; o furo oblongo vira o redondo do lado menor;
  SMD só na face de baixo e pads repetidos de um número não viram conector.

## 4. PEÇA DE TRÊS VISTAS (`core/KicadPart`)

- `moduleId` = `cm:<Biblioteca>:<Símbolo>` (prefixo do próprio CircuitMaster, sem citar a origem), com
  `@<BibliotecaFp>:<Footprint>` quando o footprint é escolhido; os arquivos do pacote são `part.cm_<Biblioteca>_<Símbolo>.fzp` e afins.
- Footprint: o escolhido, senão o campo `Footprint`, senão o primeiro footprint passante da lista padrão que casa
  com o `ki_fp_filters` do símbolo (resistor axial, eletrolítico radial, cerâmico, indutor axial, diodo DO-41, LED de
  5 mm, cristal HC49, trimpot, TO-92). Sem nenhum, a peça só existe no esquemático, como a Fonte DC do Fritzing.
- `.fzp`: título = nome do símbolo, rótulo = prefixo do `Reference`, família = biblioteca, propriedades `kicad
  symbol`, `description`, `footprint`, `datasheet` e `package`; autor "KiCad (CC BY-SA 4.0)", a atribuição que vai no
  `.fzz`. Conector SMD é do tipo `pad`, os demais `male`.
- A `Library` monta o pacote (`.fzp` e os SVG das vistas) na primeira carga e o trata como peça de pacote: o `.fzz`
  gravado leva a peça inteira e reabre sem o acervo do KiCad.
- **Peças básicas simulam** como a equivalente do Fritzing (`KICAD_EQUIVALENTS` em `core/Properties`): resistor
  (`R`, `R_Small`, `R_US`), capacitor (`C`, `C_Small`), eletrolítico (`C_Polarized…`), indutor, LED e diodo da
  biblioteca `Device`. A equivalente dá as propriedades editáveis do inspetor (resistência, capacitância…), a
  família, que liga os efeitos da simulação (fumaça, brilho), e o `<spice>`: os mesmos modelos do LED de 5 mm e do
  1N4001 do acervo do Fritzing, com os pinos citados pelo número do KiCad (`#1`, `#2`; no diodo e no LED o pino 1 é o
  catodo), e os pinos ganham os nomes que os efeitos procuram (`Pin 0`, `+`, `anode`…).
- **As outras simulam pelos campos `Sim.*`** (`core/KicadSim`, porte do `eeschema/sim` do KiCad): `Sim.Device`,
  `Sim.Type`, `Sim.Params` e `Sim.Pins` dão o elemento e o `.model`, com os pinos do modelo ligados aos do símbolo como
  o KiCad liga (sem `Sim.Pins`, na ordem dos números) e o derivado herdando os campos do pai — por isso 173 transistores
  de `Transistor_BJT` simulam pelo `Q_NPN_*`/`Q_PNP_*` de que derivam e 126 diodos de `Diode` pelo `1N4001` e afins. Cobertos: diodo, NPN e PNP
  (Gummel-Poon, VBIC), JFET, MOSFET (VDMOS, MOS1–3), chave por tensão, fontes de tensão e corrente (DC, SIN, PULSE, EXP,
  AM, SFFM, PWL; o PULSE sem período vira um pulso só, como o KiCad força no ngspice 46+) e subcircuito de
  `Simulation_SPICE.sp` (amp-ops, varistor), cada `.subckt` com os que ele chama, um por modelo. Sem os campos, o
  resistor, capacitor, indutor ou fonte de 2 pinos sai do prefixo da referência e do `Value` (`4k7`, `3,3u`, `DC 5`),
  como o `InferSimModel`; o valor vai para a notação do SPICE (`M` → `Meg`, `µ` → `u`). Fica sem simular, em vez de
  derrubar o circuito: XSPICE (o ngspice do navegador não tem; o potenciômetro duplo), IBIS, linha de transmissão,
  fontes de ruído e aleatórias, SPICE cru, modelo comportamental, biblioteca fora do acervo, valor que não é número e
  pino obrigatório sem ligação (o voltímetro diferencial).
- **Amp-ops sem `Sim.*`** (além do KiCad, que pede o modelo ao usuário): reconhecidos pela descrição (`opamp`,
  `operational amplifier`) e pelos pinos `+`, `-` e saída de cada unidade, com `V+`/`V-`; uma linha por unidade com o
  macro-modelo do simulador: LM358/LM2904/LM324/LM2902 pelo do LM358, TL07x/TL08x pelo do TL082 e os outros pelo
  genérico `CM_OPAMP` (µA741 da folha de dados).
- Mais equivalentes: as variantes de LED e de diodo da `Device`, os potenciômetros da `Device` e da
  `Simulation_SPICE` (o botão e a resistência no inspetor, como o trimpot do acervo) e a bateria, a pilha e a `VDC` (a tensão editável e o sinal da fonte, como a
  fonte DC do acervo).
- **Trocar o footprint** (KP-146): o `.fzp` guarda o footprint em uso (`footprint`, "Biblioteca:Nome") e os filtros do
  símbolo; o inspetor oferece os footprints da listagem que casam com os filtros, e escolher um troca a instância
  pela peça `…@Biblioteca:Nome`, que mantém os fios (os conectores são os mesmos pinos). Nome que não existe nas
  bibliotecas dá mensagem e não troca. A peça sem footprint mostra o campo vazio: escolher um dá a protoboard e a
  PCB.
- **Abrir um arquivo do KiCad** (KS-205, KP-292): Arquivo › Abrir aceita `.kicad_sym` e `.kicad_mod`, e as peças
  entram em Meus itens como as de um `.fzpz`. Cada símbolo com pinos de uma biblioteca vira peça
  `cm:<arquivo>:<Símbolo>`, o derivado com o pai do mesmo arquivo (derivado sem o pai fica fora, como no KiCad) e o
  footprint do campo `Footprint` lido das bibliotecas. Um footprint avulso vira peça com um símbolo gerado: uma caixa
  com um pino por pad, metade de cada lado, na ordem dos pads. Arquivo ilegível, sem pads ou sem símbolos com pinos
  dá a causa na barra de status.

## 5. UM CATÁLOGO SÓ

**Decisão do usuário (2026-10-23):** o CircuitMaster é um produto próprio, concorrente dos dois e compatível com os
dois. As peças do acervo do Fritzing e das bibliotecas do KiCad formam um catálogo só, com uma busca e categorias
próprias; nada na interface separa ou rotula a origem (abas, subtítulos, campos do inspetor, mensagens). Fritzing e
KiCad só aparecem onde o assunto é compatibilidade de arquivos e nos créditos (Ajuda › Sobre).

- O servidor de dados monta `symbols-index.json`, um texto `biblioteca⇥nome⇥descrição⇥palavras-chave` por símbolo
  (0,3 s para os 22.905), com as outras listagens.
- O indexador carrega esse resumo 1,5 s depois de o acervo ficar pronto (ou na hora, se o catálogo o pede antes) e
  monta as entradas em lotes de 2.000, então a primeira busca de quem acabou de abrir não divide o worker com a carga.
  A família do símbolo é o nome da biblioteca (`Amplifier Operational`), como a família das outras peças.
- **Busca**: uma ordenação só. Os símbolos que têm todos os termos (ou um sinônimo de `core/Search`) passam por um
  filtro simples (2 ms nos 22.905; até 300, os de nome igual ou começando pelo primeiro termo primeiro) e entram na
  mesma nota de `core/Search` com as demais peças; as sugeridas e as dos bins Core e Simulador seguem à frente. A busca
  não espera os símbolos: quando chegam, o indexador avisa (`symbols`) e o painel refaz a busca em curso. O painel
  desenha 60 resultados por vez, com "Mostrar mais (N)" no fim.
- O `.fzp` gerado tem o autor "CircuitMaster": a licença das bibliotecas (CC BY-SA 4.0 com a exceção para projetos e
  arquivos gerados) não pede atribuição na peça; o crédito fica em Ajuda › Sobre. Redistribuir as bibliotecas como
  coleção exigiria a licença e a atribuição junto.

## 6. CATÁLOGO EM CATEGORIAS (`core/Category`)

- Categorias próprias, com os nomes dos grupos das peças sugeridas: Instrumentos, Esquema e mecânica, Placas e
  protótipo, Microcontroladores, Comunicação, Sensores, Conectores, Fontes, CIs, Saída, Entrada, Semicondutores,
  Passivos e Outros.
- A categoria sai de regras (expressões regulares) testadas primeiro na família — no acervo a família da peça, nas
  bibliotecas o nome da biblioteca — e, sem regra para ela, no nome e na descrição, com os termos de peça discreta
  antes dos de CI (o "gate" do IGBT e o "flash" da lâmpada não fazem deles CIs). A biblioteca genérica (`Device`) é
  classificada assim, símbolo a símbolo. Das 25.130 peças, 140 ficam em Outros.
- Família: o nome sem o fabricante na frente ("SparkFun", "Adafruit") nem "IC"/"series" no fim, então o 555 do acervo
  ("Timer IC") e os da biblioteca ("Timer") são uma família só; famílias com menos de 3 peças ficam juntas em
  "Diversos", no fim da categoria. Os fios e as peças obsoletas ficam fora.
- Aba **Catálogo** do painel de peças (uma das três: Básicos, Catálogo, Meus itens): primeiro "Coleções", com os
  bins de fabricante e o do simulador recolhidos (em vez de abas extras), depois as categorias em seções, as famílias dentro delas e as peças de cada família
  pedidas ao indexador quando a seção abre. O ícone de um símbolo das bibliotecas é o próprio desenho do esquemático,
  feito quando o item aparece na tela e invertido no tema escuro como no quadro.

## 7. PLANO DE TESTES

| Teste | Onde |
|---|---|
| Símbolo: pinos, unidades, derivado; o esquemático tem `connectorNpin` e `connectorNterminal` por pino | `tests/kicad.test.ts` |
| Oráculo dos símbolos: traços dos pinos iguais ao `sym export svg` | `tests/kicad.test.ts` |
| Footprint: pads, furos, giro e camadas; cada conector do SVG ocupa a caixa do pad | `tests/kicad.test.ts` |
| Oráculo dos footprints: pads e furos iguais ao `fp export svg` em 9 footprints (passante, SMD, oval, girado, furo oblongo, sem metal) | `tests/kicad.test.ts` |
| Todos os símbolos: cada pino tem lugar na protoboard e cai na grade de 0,1 in (footprint ou placa adaptadora) | `tests/kicad.test.ts` |
| Peça de três vistas pela `Library`: pinos nas três vistas, pacote do `.fzz`, footprint padrão e escolhido | `tests/kicad.test.ts` |
| Fio no esquemático liga as mesmas portas na protoboard e na PCB | `tests/kicad.test.ts` |
| Busca: o símbolo sai na mesma lista, sem rótulo de origem; pôr no quadro, as três vistas e o `.fzz` com a peça | `e2e/kicad.spec.ts` |
| Categoria pela família e, na biblioteca genérica, pelo nome e descrição; famílias de origens diferentes juntas | `tests/category.test.ts` |
| Catálogo: 25 mil peças em categorias e famílias, o 555 do acervo e o NE555P na mesma família, pôr no quadro | `e2e/kicad.spec.ts` |
| Resistor e LED do KiCad acendem o LED com a fonte DC; eletrolítico do KiCad carrega com τ = RC | `tests/kicad.test.ts` |
| Footprint no inspetor: as opções do filtro, a troca mantém os fios, nome inexistente avisa | `e2e/kicad.spec.ts` |
| Campos `Sim.*`: transistor herdado, fontes, chave, diodo, subcircuito com dependências; inferência pelo `Value`; notação | `tests/kicad.test.ts` |
| Simulação: BC547 como chave acende o LED, amp-op seguidor, bateria e potenciômetro dividem pelo botão, fonte senoidal roda | `tests/kicad.test.ts` |
| Abrir `.kicad_sym` (vários símbolos, derivado) e `.kicad_mod` (símbolo gerado): peças em Meus itens com as três vistas; arquivo ruim dá a causa | `tests/kicad.test.ts` · `e2e/kicad.spec.ts` |
