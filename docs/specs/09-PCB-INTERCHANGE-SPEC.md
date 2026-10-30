# 09 — INTERCÂMBIO DE PLACAS: ALTIUM, KICAD, EAGLE E GERBER

Importação e exportação de placas de outros programas e visualização de arquivos de fabricação. A implementação
está em `src/core/Board` (modelo neutro), `src/core/Altium`, `src/core/Kicad`, `src/core/Eagle`,
`src/core/GerberReader` e `src/engine/Board` (montagem do documento); a interface, em `src/ui/GerberViewer`, no menu
Arquivo › Exportar › Para outro programa de PCB e no Abrir (Ctrl+O).

## 1. FONTES

| Formato | Fonte da especificação |
|---|---|
| KiCad `.kicad_pcb` | documentação oficial do formato S-expression (dev-docs.kicad.org, "Board File Format") |
| EAGLE `.brd` | XML com o `eagle.dtd` distribuído com o EAGLE 6+; regras de anel (*restring*) do manual |
| Altium `.PcbDoc` | descrição pública do importador do KiCad (dev-docs.kicad.org, "Altium import") completada pela leitura dos exemplos que acompanham o Altium Designer (enquadramento dos sub-registros, flags de texto, pilha de camadas) |
| Gerber RS-274X / X2 | especificação de formato da Ucamco; Excellon conforme o uso comum (cabeçalho M48) |

Nenhum código de terceiros foi transcrito. O KiCad 10 instalado serviu só de **oráculo**: as placas foram lidas pelo
importador dele e comparadas com as nossas leituras e com os arquivos que gravamos.

## 2. MODELO NEUTRO (`BoardData`)

- Unidade **mil**, eixo Y **para baixo** (como a cena), origem livre (a importação normaliza pelo contorno).
- `outline`: polígonos fechados do contorno (furos internos pela regra par-ímpar).
- `footprints`: referência, valor, nome do pacote, origem `(x, y)`, giro (graus, horário na tela), face e **pads em
  coordenadas absolutas** (o leitor já aplica giro e espelho do componente).
- Pad: nome, centro, largura × altura, giro, forma (`circle`, `rect`, `oval`, `polygon` com contorno relativo ao
  centro), furo (0 = SMD), metalizado, face (`top`, `bottom`, `both`) e net.
- `tracks` (segmentos com largura, face e net; arcos achatados em passos de 10°), `vias` (diâmetro, furo, net),
  `zones` (áreas de cobre: polígonos já preenchidos, traços de um preenchimento hachurado ou, no EAGLE, o contorno a
  despejar com folga das outras nets, folga da borda, largura mínima e alívio térmico), `silk` (traços e regiões de
  serigrafia soltos), `copper` (camadas de cobre do arquivo), `inner` e `dropped` (itens que nenhum campo representa).
- `inner`: trilhas e áreas das **camadas internas** (`layer` 1 = In1, de cima para baixo) e vias **cegas ou enterradas**
  (`from`/`to`: 0 = cima, `copper − 1` = baixo). Os leitores marcam os itens com o número de camada do arquivo e
  `settleInner` os renumera pela pilha (Altium: lista `LAYERnNEXT` a partir da TopLayer; KiCad: `InN.Cu` do cabeçalho;
  EAGLE: `layerSetup` das regras), acrescenta depois as camadas usadas fora da pilha e devolve às vias comuns a via de
  cima a baixo. Os planos negativos do Altium (`InternalPlane`) não são lidos.
- Footprint: além da serigrafia, `courtyard` (área ocupada pela peça) e `fab` (desenho de montagem), só de tela.
- Conversões do referencial do footprint: `toLocal`/`toBoard` (giro e, na face de baixo, espelho em X), usadas pelos
  formatos que guardam pads locais (EAGLE); o KiCad guarda pads locais **sem** espelho (o ângulo do pad no arquivo é
  absoluto) e o Altium guarda pads absolutos.

## 3. EXPORTAÇÃO (DOCUMENTO → ARQUIVO)

1. A arte da PCB (spec 03 §2) dá contorno, condutores, furos, serigrafia e peças posicionadas.
2. Cada peça vira um footprint na posição e giro da arte; cada conector com cobre vira um pad: a **maior** forma do
   conector é o pad (o anel fino em volta do furo de um pad não circular fica de fora); furo é o do centro do pad
   (até 1/4 do menor lado — uma via dentro de um pad SMD não vira furo dele). Contorno que é retângulo alinhado ou
   oval (todos os pontos na borda, 0,5 mil) vira a forma simples, que todo formato tem.
3. Vias vêm das instâncias `via`; furos sem conector viram footprints `HOLE` com pad não metalizado; trilhas vêm dos
   condutores `trace`; `fab` e `courtyard` de cada peça (grupos do SVG, na face da peça) vão para o footprint.
   **Áreas de cobre** vêm dos condutores `fill`: uma por área desenhada (contorno gravado na propriedade `zone`) ou, nos
   outros preenchimentos, uma por contorno externo de primeiro nível (a ilha dentro do furo de outro fragmento fica na
   área dele); `fill` = o cobre já calculado, `pour` = contorno, folga e borda do preenchimento (`GPG_Keepout`, borda
   ≥ 30 mil) e alívio térmico quando há net. A net é a do conector do preenchimento, a do terminal `netKey` (área
   importada) ou, pelo nome, a da área desenhada ou a de terra do "Preencher com terra"; o "Preencher com cobre" sai sem net.
4. **Nets**: grupos da netlist da PCB com dois ou mais membros, chamados `N1, N2…` na ordem da netlist (o modelo do
   Fritzing não guarda nome de net).
5. **Camadas internas** guardadas na placa (§4.7) voltam em `inner` com `copper` do arquivo de origem; a net de cada item
   é a do terminal guardado para ela (segue as mudanças da netlist) ou, sem ele, o nome do arquivo de origem. Gerber,
   PDF/SVG de corrosão e pick-and-place não as levam: a mensagem da exportação avisa.
6. Escritores:
   - **KiCad**: formato 20240108 (KiCad 8+), camadas F.Cu, In1.Cu… e B.Cu, vias cegas e enterradas como `via blind`, contorno em Edge.Cuts, pad poligonal como `custom`,
     fab/courtyard em F/B.Fab e F/B.CrtYd. Área de cobre como `zone` só com o contorno, a net, a folga, a largura mínima e
     o alívio: o KiCad preenche (tecla B), porque o `filled_polygon` dele não tem furos (seria preciso fraturar cada furo
     até a borda).
   - **EAGLE**: XML 9.6, uma biblioteca `circuitmaster` com um pacote por footprint no referencial do elemento (face de
     baixo = `rot` com `M`); pads repetidos ganham `@n`; regras de anel zeradas para o diâmetro gravado valer;
     fab em 51/52 e courtyard em 39/40; área de cobre como `polygon` da net (`isolate` = folga, `thermals`), que o
     EAGLE despeja; área sem net vai no sinal `~loose`. Camadas internas em 2, 3… (`Route2`…), via com `extent` e
     `layerSetup` de núcleos e pré-impregnados alternados (`(1+2*3+16)` em quatro camadas).
   - **Altium**: `.PcbDoc` binário (§7) com as `MidLayer` na pilha V9 (um dielétrico entre cada par de cobres) e na lista
     V6, que liga só o cobre (`1 → 2… → 32`, com 0 nas pontas; serigrafia, pasta e máscara apontam para a sua face),
     como nos arquivos atuais do Altium; via com camada de início e fim; fab na mecânica 13 e courtyard na 15
     (habilitadas); área de cobre como regiões sólidas `Regions6` (KIND=0, contorno e furos), não como polígono
     redespejável (o importador do KiCad não as mostra).

## 4. IMPORTAÇÃO (ARQUIVO → DOCUMENTO)

1. Sem contorno no arquivo: retângulo em volta de tudo com 50 mil de margem.
2. **Peça por footprint posicionado**: o SVG da PCB leva pads e serigrafia relativos à origem do footprint com giro e
   face já aplicados (a instância entra sem transformação; na face de baixo, `bottom` = verdadeiro). Footprints iguais
   na mesma posição relativa compartilham a peça (`cm-import-<hash>`). Pad passante circular é um anel
   (`r = (D + d)/4`, traço `(D − d)/2`); não circular, a forma mais um anel de 1 mil no furo; SMD circular leva
   `drill="0"`. Esquemático e protoboard usam os símbolos DIP gerados (`generic_ic_dip_N`). Pads de mesmo nome formam um
   **bus** (os vários GND de um conector são o mesmo pino, como nas peças do Fritzing). As peças vão embutidas no `.fzz`.
3. A placa vira uma peça `board` com o contorno (`boardoutline`) e a serigrafia solta.
   Courtyard e fab do footprint vão nos grupos `courtyard` e `fab` do SVG da peça: camadas próprias do CircuitMaster,
   só de documentação (fora do Gerber, do DRC e do cobre), no fim da lista de camadas da PCB para não mudar o `z` das
   camadas do Fritzing.
4. **Nets** como ligações diretas entre os pinos de cada net: aparecem no ratsnest do esquemático e da PCB.
5. **Trilhas e vias** pelo `applyPlan` do autorouter com largura e furo por item e **sem** a marca de autoroteável
   (o "apagar trilhas autoroteadas" as preserva). Ligações pela geometria: trilha que termina no meio de outra da mesma
   face a parte (junção em T); pontas da mesma face a até 0,5 mil se ligam; a ponta liga ao pad quando o cobre se
   encontra (dentro do contorno ou a até meia largura da trilha dele — o Fritzing liga por topologia e a ponta pode
   parar na borda); a via liga às trilhas cujas pontas caem nela e ao pad sob ela. Índice em células de 100 mil.
6. **Áreas de cobre** viram preenchimentos (`GroundPlaneModuleID`, o mesmo do preenchimento do Fritzing, spec 03 §6),
   um por fragmento, na face da área: o preenchimento gravado (união par-ímpar) mais o hachurado engrossado pela meia
   largura; no EAGLE, o despejo `abertura((contorno ∩ placa ⊖ borda) − (cobre das outras nets ⊕ folga) − alívio, largura/2)`
   sem as ilhas que não tocam o cobre da net nem os raios do alívio. Entram no Gerber; o DRC não os testa, como no Fritzing.
7. **Camadas internas** (`inner`) não entram na edição: ficam em JSON na propriedade `inner` da placa importada (salva no
   `.fz`), em mil a partir do canto da placa — o referencial da exportação —, com `copper` e, por net do arquivo, um
   terminal dela (`nets`). A aba Documento mostra a contagem de camadas. Limites: mover uma peça não leva as trilhas
   internas, e a tela, o DRC e o Gerber não as veem.
8. O documento abre na PCB, sem salvar, e a barra de status diz quantas nets ficaram roteadas, quantos itens das camadas
   internas ficaram guardados e quantos ficaram de fora.

Recusados com o motivo: PcbDoc ASCII, KiCad anterior à versão 4 (`PCBNEW-BOARD`) e EAGLE binário (anterior ao 6).

## 5. KICAD

- S-expression lida e gravada pelo `core/Sexpr` (spec 07): o leitor tira as aspas e os escapes dos textos, e o
  `.kicad_pcb` gravado passa pelo `Prettify` do KiCad, no mesmo formato que o KiCad grava. mm → mil × 1000/25,4. Y já
  para baixo.
- `(at x y a)`: `a` anti-horário na tela ⇒ giro do modelo = −a. Posição do pad: local ao footprint girada pelo
  footprint; ângulo do pad absoluto.
- Pads `thru_hole`/`np_thru_hole`/`smd`/`connect`; formas circle, rect, oval, roundrect (retângulo), trapezoid
  (retângulo), custom (polígono do `gr_poly` dos `primitives`). Furo oval: o menor lado.
- Net por `(net n "nome")` ou `(net "nome")`. Arcos (`start`/`mid`/`end`) pelo círculo dos três pontos.
- Contorno: traços de Edge.Cuts encadeados pelas pontas (1 mil).
- Áreas: `zone` fora de `keepout`, nas faces de `layer`/`layers` (`*.Cu`, `F&B.Cu`), com os `filled_polygon` da face;
  zona sem preenchimento gravado (a que o CircuitMaster exporta) é despejada pelo contorno com a folga de `connect_pads`
  (também na borda: a do KiCad fica no `.kicad_pro`), a `min_thickness` e o alívio, como o polígono do EAGLE.
  Gráficos de F/B.CrtYd são courtyard e de F/B.Fab, fab.

## 6. EAGLE

- mm, Y para cima, `rot="[S][M]R<graus>"` anti-horário; M = espelhado na face de baixo (o SMD troca de face).
- Diâmetro real do pad = máximo entre o diâmetro do pacote e `furo + 2·clamp(rvPadTop·furo, rlMinPadTop, rlMaxPadTop)`
  das `designrules` do arquivo (padrão 25%, 10–20 mil; via: `ViaOuter`, 8–20 mil). Formas: round, square, octagon,
  long (oval 2:1), offset (oval). SMD com `roundness` 100 é circular/oval.
- `curve` nos traços: arco pelo centro na mediatriz da corda. Contorno na camada 20; serigrafia 21/22; furos soltos
  (`plain/hole`) viram footprints `HOLE`.
- Polígono de sinal nas camadas 1/16: contorno pelos vértices (`curve` até o seguinte), despejado com folga
  `max(isolate, mdWireWire)`, borda `mdCopperDimension` (padrão 40 mil), largura mínima `width` e alívio térmico salvo
  `thermals="no"`. Pacote: camadas 39/40 (tKeepout/bKeepout) são courtyard e 51/52 (tDocu/bDocu) fab, como no
  importador do KiCad. Diferença do oráculo: o KiCad troca a borda pela própria (0,5 mm) e a largura mínima por 5 mil;
  com as regras dele, as áreas ficam 4–6% maiores que as dele (raios do alívio mais largos).
- Diferença conhecida do oráculo: o KiCad limita o anel do diâmetro do pacote ao máximo da regra; aqui vale o maior
  dos dois, como diz o manual do EAGLE.

## 7. ALTIUM `.PcbDoc`

### 7.1 Compound File

- OLE Compound File v3 (setores de 512 B, mini setores de 64 B, corte de 4096 B). Um armazenamento por tipo com
  `Header` (uint32 com a contagem) e `Data` (registros).
- Escrita: streams grandes em setores, pequenos no mini stream, FAT ao fim, só a DIFAT do cabeçalho (até ~7 MB);
  irmãos em árvore binária balanceada (nomes comparados por tamanho e depois em maiúsculas), todos pretos.

### 7.2 Registros

- Texto: uint32 + `|CHAVE=VALOR|…` terminado em `\0` (Board6, Nets6, Components6, Polygons6…). Medidas como `123.4mil`.
- Binário: tipo (1 B) e sub-registros com uint32 de tamanho. Unidade 1/10000 mil, Y para cima.

| Registro | Tipo | Sub-registros | Campos usados (deslocamento no sub-registro) |
|---|---|---|---|
| Arco | 1 | 1 (60 B) | camada 0, flags2 2 (2 = keepout), net 3, polígono 5, componente 7, centro 13/17, raio 21, ângulos 25/33 (double), largura 41 |
| Pad | 2 | 6: nome (Pascal), 3 fixos (`00`, `\x04|&|0`, `00`), geometria (194 B), extensão por camada (1131 B ou vazia) | camada 0 (1 cima, 32 baixo, 74 passante), net 3, componente 7, centro 13/17, tamanhos cima/meio/baixo 21/29/37, furo 45, formas 49–51 (1 redondo, 2 retângulo, 3 octógono), giro 52 (double), metalizado 60 |
| Via | 3 | 1 (321 B) | net 3, centro 13/17, diâmetro 21, furo 25, camadas 29/30, diâmetros por camada 75 (32 × int32) |
| Trilha | 4 | 1 (49 B) | camada 0, flags2 2, net 3, polígono 5 (≠ 0xFFFF = preenchimento de polígono), componente 7, pontas 13/17 e 21/25, largura 29 |
| Texto | 5 | 2: geometria (252 B) e texto (Pascal) | componente 7, **comentário 40**, **designador 41** |
| Fill | 6 | 1 | camada 0, flags2 2, net 3, cantos 13/17 e 21/25, giro 29 (double) |
| Região | 11 | 1 | camada 0, flags2 2, net 3, polígono 5, furos 14 (uint16), propriedades 18 (uint32 + texto; `KIND=0` é cobre), contorno (uint32 + pares de double) e cada furo (idem) |

- Componentes (`Components6`): `X`, `Y`, `ROTATION` (formato do Delphi, ` 1.80000000000000E+0002`), `LAYER`
  (TOP; qualquer outro valor — inclusive componentes embutidos em camadas internas — vai para a face de baixo, como no
  oráculo), `PATTERN`. Designador e valor vêm dos textos do componente (bytes 41 e 40), não do `SOURCEDESIGNATOR`,
  que é o do esquemático e difere em projetos multicanal.
- Áreas de cobre: regiões `KIND=0` nas faces externas (o preenchimento sólido dos polígonos e as regiões soltas), fills
  e, no polígono hachurado, as trilhas e arcos com polígono ≠ 0xFFFF agrupados por polígono e face. `ShapeBasedRegions6`
  repete as regiões e não é lido.
- Camadas mecânicas 57–72 com nome em `LAYERnNAME`: courtyard/placement (ou "Mechanical 15" sem nome) é courtyard;
  assembly/3D/body/component (ou "Mechanical 13") é fab; `bot` no nome é a face de baixo. Só as primitivas dos componentes.
- Contorno: `VXn/VYn`; `KINDn = 1` faz arco (`CXn, CYn, Rn, SAn → EAn`) até o vértice seguinte, no sentido da ponta
  que coincide com o vértice.
- Escrita: `FileHeader`, `FileHeaderSix`, Board6 com a pilha V9 (`V9_STACK_LAYERn_*`, IDs 0x01000001/0x0100FFFF para
  cobre) e as 82 camadas antigas `LAYERn*` encadeadas serigrafia → cobre de cima → cobre de baixo → serigrafia;
  Nets6, Components6, Pads6 (sem extensão por camada), Tracks6 (cobre e serigrafia de traço), Vias6 e os demais
  armazenamentos vazios. A serigrafia **preenchida** (texto e logos desenhados) não é gravada: em trilhas seriam
  milhares de contornos e o designador já vai no componente.

### 7.3 Conferência das áreas exportadas (oráculo: KiCad 10)

pic_programmer importado e exportado: uma zona GND. Refeita pelo KiCad com as regras do original (folga 20 mil), dá
17,88 in², contra 17,75 do original refeito do mesmo jeito (+0,7%: o contorno exportado é o do cobre, não o da zona
original). Com a folga do documento (10 mil), o KiCad dá 19,42 e o EAGLE 18,50; reabertos no CircuitMaster, 18,65
(KiCad) e 18,44 (EAGLE), na net GND. O `.PcbDoc` exportado relê as regiões e a documentação no nosso leitor; o
oráculo do Altium trava ao carregar e não foi usado.

## 8. VISUALIZADOR DE GERBER

- Abre um `.zip` de fabricação ou um arquivo solto (gbr, gtl, gbl, gts, gbs, gto, gbo, gtp, gbp, gm1, gko, drl, xln,
  txt…); cada arquivo é reconhecido pelo conteúdo (Excellon: `M48` após comentários ou `TnCd`; Gerber: `%FS` ou D01–D03).
- Camada pelo atributo X2 `%TF.FileFunction` ou pelo nome. Ordem de baixo para cima: contorno, cobre de baixo,
  máscara, pasta e serigrafia de baixo, cobre interno, cobre de cima, máscara, pasta e serigrafia de cima, furação.
- RS-274X: `%FS` (zeros à esquerda ou à direita), `%MO`, aberturas C/R/O/P e macros (primitivas 1, 4, 5, 7 como anel,
  20, 21; variáveis `$n` e expressões com `+ - x /`), G01/G02/G03 com G75, D01/D02/D03, regiões G36/G37 e polaridade
  LPD/LPC (a clara pinta com o fundo). Step-and-repeat e blocos de abertura são avisados e não desenhados.
- Excellon: INCH/METRIC com LZ/TZ e `FMAT`, ferramentas `TnCd`, furos e rasgos G85.
- Tela: liga/desliga por camada, roda = zoom no cursor, arrastar = mover, dois cliques = régua; coordenadas e régua
  em mm e mil.

## 9. VALIDAÇÃO

`tests/boardio.test.ts`: Compound File (pequeno, grande, vazio, aninhado); números do Delphi; exportação de um exemplo
relida nos três formatos com os mesmos pads (posição a 0,1 mil e furo), partição em nets, trilhas e vias; reimportação
da placa exportada sem mudar pads nem nets e com as mesmas nets roteadas do original; leitura dos próprios Gerbers
(camadas, todos os furos e contorno do tamanho da placa).

Conferência com o oráculo (KiCad 10.0.6), fora da suíte: leitura de 4 placas do Altium (7.861 pads), 3 demos do KiCad
(2.624 pads) e 2 placas EAGLE da SparkFun com 0 divergência de posição, net e face; arquivos gravados pelos três
escritores relidos pelo KiCad com as mesmas contagens; Gerbers gerados pelo `kicad-cli` com o contorno e os 1.720
furos esperados.
