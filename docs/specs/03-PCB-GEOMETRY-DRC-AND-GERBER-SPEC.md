# 03 — GEOMETRIA DA PCB, DRC, PLANO DE COBRE E MANUFATURA (GERBER/EXCELLON)

Especificação funcional *clean room* da conversão da vista PCB em arquivos de fabricação (RS-274X, Excellon,
pick-and-place, BOM), do preenchimento de cobre (*copper/ground fill*), da verificação de regras (DRC) e do
autorouter, conforme o Fritzing 1.0.8, e da arquitetura vetorial equivalente do CircuitMaster (Clipper2/WASM).

O Fritzing de referência mistura caminhos **vetoriais** e **raster** (DRC, recortes e partes não suportadas do
Gerber são rasterizados). O CircuitMaster deve produzir resultados **geometricamente equivalentes ou melhores**
usando apenas álgebra de polígonos; a seção 10 define a tolerância de equivalência.

---

## 1. SISTEMAS DE COORDENADAS

| Espaço | Unidade | Origem | Eixo Y |
|---|---|---|---|
| Cena PCB | px (1/90 in) | arbitrária | para baixo |
| Placa (CAM) | mil (1/1000 in) | canto superior esquerdo do retângulo envolvente da placa | para baixo |
| Gerber | 1 µin (formato 2.6 em polegadas) | canto inferior esquerdo da placa | para cima |
| Excellon | 0,1 mil (1/10.000 in) | canto inferior esquerdo da placa | para cima |
| Pick-and-place | mil | canto inferior esquerdo da placa | para cima |

Seja $B = (B_x, B_y, B_w, B_h)$ o retângulo envolvente da placa na cena (px). Para um ponto de cena $(x, y)$:

$$x_{mil} = (x - B_x)\cdot\tfrac{1000}{90},\qquad y_{mil} = (y - B_y)\cdot\tfrac{1000}{90}$$
$$X_{gerber} = \mathrm{round}(1000\,x_{mil}),\qquad Y_{gerber} = \mathrm{round}\big(1000\,(H_{mil} - y_{mil})\big),\quad H_{mil} = B_h\cdot\tfrac{1000}{90}$$

Larguras e raios seguem a mesma escala (sem inversão).

---

## 2. GEOMETRIA DE CADA SAÍDA

### 2.1 Seleção de itens

Para cada saída, entram apenas itens **visíveis na PCB** cuja caixa **colide com a placa**, nas camadas listadas,
em ordem de $z$, renderizados "só preto" (cores ignoradas), com pernas elásticas incluídas como traços e
**elementos de ponto terminal ocultos** (o retângulo `terminalId` nunca vai para o cobre). Vale para peças e
para trilhas: trilha cuja caixa não toca a caixa da placa (ex.: trilha de outra placa do mesmo sketch) não entra.

**Qual placa.** Com uma só placa na vista PCB, é ela. Com várias, exportação para produção, DRC, autorouter e
preenchimento de cobre usam a placa **selecionada**; sem exatamente uma placa selecionada a operação não roda e
pede que o usuário selecione a placa, porque cada uma trabalha com uma placa por vez.

| Saída | Camadas de origem | Observações |
|---|---|---|
| Cobre inferior | Copper0, Copper0Trace, GroundPlane0 | sempre |
| Cobre superior | Copper1, Copper1Trace, GroundPlane1 | só se a placa tem 2 camadas |
| Máscara inferior/superior | Copper0 / Copper1 (**sem trilhas**) | logos de cobre excluídos; dilatação de 5 mil |
| Pasta inferior/superior | Copper0 / Copper1 | só pads SMD (remove pads de conectores THT e furos); sem dilatação |
| Serigrafia superior | Silkscreen1, Silkscreen1Label | recortada pela máscara superior |
| Serigrafia inferior | Silkscreen0, Silkscreen0Label | recortada pela máscara inferior |
| Contorno | Board | ver 2.6 |
| Furação | Copper0, Copper1 | ver 4 |

Remoções antes de converter (exceto furação): círculos de **não conectores** (`id` contendo `nonconn`) com
`stroke-width = 0` (furos puros) não são desenhados no cobre/máscara/serigrafia.

### 2.2 Pads em forma de anel desenhados como `path`

Conectores marcados como "anel" (documento 01, 3.5) são substituídos por um círculo equivalente antes da
conversão: centro = centro da caixa do path; $r$ e largura de traço = os do conector (convertidos para mil). Assim
viram *flash* no cobre e furo na furação.

### 2.3 Primitivas e achatamento

Toda transformação é aplicada à geometria (achatamento de CTM). Primitivas resultantes:
círculo, retângulo, linha, polilinha, polígono, *path*. Cada primitiva tem: preenchimento (`fill` ausente ⇒
preto; `none` ⇒ sem preenchimento), traço (`stroke` presente e ≠ `none`), largura, terminação (`butt`, `round`,
`square`).

**Referência**: são convertidos diretamente apenas: círculos, retângulos sem cantos arredondados, linhas,
polilinhas, polígonos e paths compostos só de `M/L/H/V/Z` com um único `Z`. O resto — texto, elipses, retângulos
com `rx`/`ry`, traços tracejados, paths com arcos/curvas (`A/C/Q/S/T`) ou múltiplos `Z`, imagens e paths sob
transformação com escala — é **rasterizado a 1000 dpi** (1 mil/pixel) e emitido como varredura horizontal de
segmentos de 1 mil com terminação quadrada.

**CircuitMaster**: tudo vira polígono vetorial:
- curvas Bézier e arcos achatados com erro cordal ≤ 0,05 mil (ou arcos nativos G02/G03 quando a saída permitir);
- texto convertido em contornos com a fonte embutida (OCR-A/Droid Sans) e preenchido;
- elipses/retângulos arredondados → polígonos;
- traços → `offset` aberto do Clipper2 com a terminação e junção do SVG;
- imagens raster → vetorização por *marching squares* a 1 mil (equivalente ao raster de referência).

### 2.4 Recorte pela placa

- Elementos cuja AABB ultrapassa o retângulo da placa por mais de 0,1 mil são **descartados por inteiro** na
  referência (não recortados). Círculos descartados assim, se o seu furo interno ($r - w/2$) ainda couber na placa,
  reaparecem como anel fino (raio $+4$ mil, traço 2 mil) para não perder o furo.
- CircuitMaster: recortar geometricamente cada polígono pelo **polígono real da placa** (interseção Clipper2) e
  emitir aviso para elementos recortados.

### 2.5 Máscara de solda, pasta e serigrafia

- **Máscara**: cada pad (camada Copper0/1, sem trilhas) é preenchido e dilatado por **5 mil** de cada lado
  (traço aumentado em 10 mil). Abertura = $\mathrm{pad} \oplus D(5\,\mathrm{mil})$.
- **Pasta**: pads de conectores SMD sem dilatação; pads THT (conector presente nas duas faces) e furos excluídos.
- **Serigrafia**: elementos que colidem com a abertura de máscara da mesma face são removidos; o restante é
  recortado pixel a pixel na referência. CircuitMaster: $\mathrm{silk} \setminus \mathrm{máscara}$ por
  diferença de polígonos.

### 2.6 Contorno da placa

- Do grupo `board`, se houver várias folhas, usa-se apenas a de `id = boardoutline` (marcada na carga da placa:
  folha única ou a de maior área de AABB).
- **Recortes internos** (furos na placa) só são aceitos se o path tiver subcaminhos `M … z` separados (gerados
  por "diferença" no editor vetorial); cada subcaminho vira um contorno próprio. Subcaminho sem `M` inicial ⇒ erro
  "não é possível processar os recortes".
- O contorno é **desenhado no eixo do vetor** com abertura circular de **0,2032 mm (8 mil)** (configurável);
  círculos de contorno usam arco completo (`G75`, `G03`).

---

## 3. GERBER RS-274X

### 3.1 Arquivos e sufixos (prefixo = nome do sketch)

| Arquivo | Sufixo |
|---|---|
| Cobre superior | `_copperTop.gtl` |
| Cobre inferior | `_copperBottom.gbl` |
| Máscara superior / inferior | `_maskTop.gts` / `_maskBottom.gbs` |
| Pasta superior / inferior | `_pasteMaskTop.gtp` / `_pasteMaskBottom.gbp` |
| Serigrafia superior / inferior | `_silkTop.gto` / `_silkBottom.gbo` |
| Contorno | `_contour.gm1` |
| Furação (Excellon) | `_drill.txt` |
| Pick-and-place | `_pnp.xy` |

Placa de uma camada: não gera cobre/máscara/pasta superiores.

### 3.2 Estrutura de referência

```
G04 MADE WITH FRITZING*
G04 WWW.FRITZING.ORG*
G04 DOUBLE SIDED*            (ou SINGLE SIDED)
G04 HOLES PLATED*            (ou HOLES NOT PLATED)
G04 CONTOUR ON CENTER OF CONTOUR VECTOR*
%FSLAX26Y26*%
%MOIN*%
%ADD10C,0.075000*%           (aberturas, numeradas a partir de D10 na ordem do primeiro uso)
...
G04 COPPER1*                 (nome da camada em maiúsculas)
%FSLAX26Y26*%
%MOIN*%
D10*
X1234567Y2345678D03*
...
G04 End of Copper1*
M02*
```

Modo legado (opção desligável no app de referência): `%ASAXBY*%`, `%FSLAX23Y23*%`, `%MOIN*%`, `%OFA0B0*%`,
`%SFA1.0B1.0*%`, `%LN<CAMADA>*%`, `G90*`, `G70*`, `G54` antes de cada `Dnn`, coordenadas em mil.

**CircuitMaster** deve emitir RS-274X conforme a especificação (FS e MO uma única vez, antes das aberturas;
`%LPD*%`; atributos X2 opcionais `%TF.FileFunction,Copper,L1,Top*%` etc.), mantendo os mesmos sufixos, as
mesmas aberturas e as mesmas coordenadas. Um modo "compatível" reproduz a ordem de referência das seções
(comentários, FS/MO, aberturas, corpo, `M02`), com comentários `G04` próprios do CircuitMaster — nunca o texto de
autoria do Fritzing.

### 3.3 Aberturas

Texto da abertura com 6 casas decimais em polegadas; deduplicação pelo texto; D-code a partir de 10.

| Primitiva | Abertura | Uso |
|---|---|---|
| Círculo cheio ou com furo, cobre com furação | `C,<(2r+w)/1000>` | *flash* `D03` no centro |
| Círculo `fill="none"` fora do cobre/máscara, ou cobre com `drill="0"/"no"/"false"` | `C,<(2r+w)/1000>X<(2r−w)/1000>` | *flash* com furo |
| Retângulo cheio (ou cobre/máscara) | `R,<(W+w)/1000>X<(H+w)/1000>` | *flash* no centro |
| Retângulo `fill="none"` (não cobre/máscara) | `R,…X…X<(W−w)/1000>X<(H−w)/1000>` | *flash*; em serigrafia vira 4 segmentos |
| Traço de linha/polilinha/polígono/path | `C,<w/1000>` (mín. 5 mil em polígonos) | `D02` início, `D01` segmentos |
| Traço com `stroke-linecap="square"` em path | `R,<w/1000>X<w/1000>` | idem |
| Preenchimento de polígono/path | região `G36*` … `G37*` (abertura de 0,1 mil selecionada antes) | contorno fechado |
| Contorno da placa | `C,<largura do contorno>` (padrão 0,008 in) | todos os desenhos |

Círculos com $r < 0{,}001$ mil são ignorados. Retângulos com `rx`/`ry` não nulos contam como "inválidos" (e na
referência foram rasterizados antes). Comandos de path fora de `M/L/H/V/Z` marcam o path como inválido; o total de
inválidos por camada é reportado ao usuário.

### 3.4 Regras por primitiva

- **Círculo** (não contorno): selecionar abertura e `X…Y…D03*`.
- **Retângulo**: centro $(x + W/2,\ y + H/2)$; *flash*; em contorno ou serigrafia sem preenchimento, desenhar o
  perímetro com abertura circular de largura $w$.
- **Linha**: `D02` no início (se não contínua com a anterior, encerra antes com `D02`), `D01` no fim.
- **Polilinha/polígono**: lista de pontos; polígono fecha no primeiro ponto; região se preenchido; traço se tem
  `stroke` (sempre em máscara e contorno).
- **Path**: `M` (primeiro par `D02`, pares seguintes como `L`), `L`, `Z` (fecha com `D01` no início do
  subcaminho e `D02`); relativo/absoluto conforme a letra.
- Cada primitiva termina com `D02*`.

---

## 4. EXCELLON (FURAÇÃO)

### 4.1 Classificação de furos

Fonte: todos os `<circle>` das camadas Copper0+Copper1 da placa.

- Círculos com `drill` ∈ {`0`, `no`, `false`} são ignorados.
- Diâmetro do furo $d = (2r - w)/1000$ in; $d \le 0$ ⇒ ignorado.
- **Não metalizado** se `stroke-width = 0` (furo puro); **metalizado** se tem anel ($w > 0$).
- Pads THT presentes nas duas faces geram o mesmo furo duas vezes; as coordenadas são deduplicadas por ferramenta.

### 4.2 Arquivo de referência

```
; NON-PLATED HOLES START AT T1
; THROUGH (PLATED) HOLES START AT T100
M48
INCH
T1C0.125984
T100C0.038000
%
T1
X012345Y006789
T100
X001000Y002000
T00
M30
```

- Ferramentas não metalizadas a partir de `T1`; metalizadas a partir de
  $T_p = \big(\lfloor (n_{np} + 0)/100 \rfloor + 1\big)\cdot 100$ (normalmente `T100`).
- Diâmetro em polegadas com 6 casas (`C%f`).
- Coordenadas: inteiros de 0,1 mil **truncados** (não arredondados), com zeros à esquerda até 6 dígitos, sem ponto
  decimal; $Y$ invertido como no Gerber.
- Rasgos (furos oblongos) não são exportados pela referência.

**CircuitMaster**: emitir `INCH,LZ` (ou `METRIC,LZ` por opção) e `FMAT,2` para eliminar ambiguidade;
coordenadas idênticas; suporte opcional a rasgos (`G85`) para pads oblongos.

---

## 5. PICK-AND-PLACE, BOM, GRAVÁVEL E IPC-D-356A

### 5.1 `_pnp.xy`

Cabeçalho:
```
# Pick And Place List
# eMail=
#
# Project=<prefixo>
# Date=<hora>
# CreatedBy=Fritzing <versão>
#
# Coordinates in mils, always center of component
# Origin 0/0=Lower left corner of PCB. Rotation in degree (0-360, math. pos.)
RefDes,Description,Package,X,Y,Rotation,Side,Mount
Description: resistance;capacitance;inductance;voltage;current;power;mpn;mn;
```
Uma linha por item com conectores que colide com a placa (exceto planos de cobre):
`RefDes,"<valores separados por ;>","<package>",X,Y,Rot,Side,Mount`.

- Descrição: valores das chaves `resistance, capacitance, inductance, voltage, current, power, mpn, mn` (local
  sobre a peça), cada um seguido de `;`, com `,` trocada por `_`.
- $X, Y$ = centro da caixa do item em mil relativo ao canto inferior esquerdo da placa ($Y$ para cima).
- Rotação $= \mathrm{atan2}(m_{12}, m_{11})$ em graus.
- `Side` = `Top`/`Bottom`. `Mount`: `MANUAL` se `package` vazio; `THT` se contém `THT`; `SMT` se contém `SMD`;
  `THT` se contém DIP, DIL, ZIP, SIP, PFM ou um encapsulamento TO conhecido (TO-3 … TO-264, TO92, TO220), exceto
  se contém `LEADLESS` (então `SMT`); senão `SMT`.
- Ordenação: lado, montagem, $X+Y$, RefDes.

### 5.2 BOM

- Itens de BOM de todas as vistas (peças reais; sem fios, notas, logos, réguas, símbolos).
- Lista de montagem: uma linha por instância com rótulo, valor elétrico, `mn`, `mpn`, título e propriedades.
- Lista de compras: agrupamento pela chave `valor elétrico | mn | mpn | título | propriedades`, com quantidade.
- Propriedades: todas as exibidas no inspetor exceto `family`, como `"<nome> <valor>; …"`.
- Saídas: HTML (modelo próprio do CircuitMaster), CSV e PDF.

### 5.3 Exportação gravável (*etchable*, SVG/PDF para fotolito caseiro)

Arquivos `<prefixo>etch_copper_bottom`, `etch_mask_bottom`, `etch_paste_mask_bottom`, (com 2 camadas também
`etch_copper_top`, `etch_mask_top`, `etch_paste_mask_top`), `etch_silk_top`, `etch_silk_bottom`, cada um em
`.svg` ou `.pdf` e **em duas versões: normal e `_mirror`** (espelhada, para transferência pela face do toner).

| Arquivo | Camadas | Tratamento |
|---|---|---|
| cobre | GroundPlane, Copper, CopperTrace da face | preto sobre branco |
| máscara | Copper da face (logos de cobre ocultos) | pads preenchidos e dilatados 5 mil por lado |
| pasta | Copper da face (furos e logos ocultos) | só pads SMD |
| serigrafia | Silkscreen e rótulos da face | aberturas de máscara apagadas em branco |

O contorno da placa é mesclado em cada arquivo. SVG em 72 unidades/in; PDF na resolução da impressora.

### 5.4 Netlist de teste elétrico IPC-D-356A

Nets da vista PCB com **apenas trilhas de PCB conduzindo** (fios de breadboard, fios de esquemático e ratsnest
ignorados; barramentos internos ignorados), incluindo nets unitárias e as duas faces. Planos de cobre excluídos.

Cabeçalho (registros de largura fixa):
```
C  <comentário de autoria do CircuitMaster>
C  <versão>
P  CODE  00
P  UNITS CUST 1
P  TITLE <nome do arquivo>
P  VER   IPC-D-356A
```
`UNITS CUST 1` = milímetros com resolução de 0,001 mm; coordenadas relativas ao canto inferior esquerdo da placa,
$Y$ para cima: $u = \mathrm{round}(px / 90 \cdot 25{,}4 \cdot 1000)$.

Registro por ponto de teste (formato `%03d%-14.14s   %-6.6s-%4.4s%1s%1s%04d%1sA%02dX%+07dY%+07dX%04dY%04dR%03d S%1d`):
código (`317` furo passante, `017` continuação do furo na outra face, `327` SMD), rótulo da net, rótulo da peça,
pino, `M` se o conector tem mais de uma conexão, `D` se furado, diâmetro do furo $2r - w$, `P`/`U`
(metalizado se $w > 0$), acesso (`01` cobre superior, `16` inferior, `00` outro), $X$, $Y$ do centro do pad,
largura (diâmetro externo $2r + w$ se furado, senão largura do pad), altura (0 se circular), rotação
anti-horária em graus (0–359), máscara `S0`. Fim: `999`.

- Pino: `connectorId` se tiver até 4 caracteres; senão o primeiro número do id (até 4 dígitos); senão os 4
  primeiros caracteres; nomes contendo `anode` → `A`, `catho` → `C`; nomes `-`/`+` → `-`/`+`.
- Rótulo da net: `NET<n><rótulo da 1ª peça><rótulo da última>`, ou `NET<n>-GND` se algum conector tem `gnd` no
  nome. Ordenação: nets por rótulo da primeira peça (decrescente), empate por $x$ (decrescente); conectores por
  $x + y$ do centro (decrescente).
- Conector THT: emite `317` na face da peça e `017` na outra.

---

## 6. PREENCHIMENTO DE COBRE (COPPER/GROUND FILL)

### 6.1 Modos

| Modo | Sementes | Resultado (`fillType`) |
|---|---|---|
| Ground fill | conectores marcados `groundFillSeed`; se nenhum, exige exatamente um conector aterrado candidato | `ground` |
| Copper fill | nenhuma | `plain` |
| Fill unitário (soltar no ponto) | ponto do clique | `individual` |

Conector aterrado = nome `gnd`, `vss` ou `ground` (sem diferenciar maiúsculas). As sementes são expandidas para
toda a net equipotencial (todas as arestas). Durante o ground fill, as **trilhas da net de terra são ocultadas**
(o preenchimento passa por cima delas).

### 6.2 Algoritmo (vetorial, referência atual; resolução 30.000 unidades/in)

Notação: $\oplus_r$ = *offset* com junção redonda de raio $r$ (negativo = erosão); $k$ = keepout do fill
(`GPG_Keepout`, padrão **10 mil**).

1. $C$ = união de todo o cobre da face (pads, trilhas, planos existentes, blockers), com traços convertidos em
   polígonos.
2. $Z$ = retângulos das sementes; $C_g = C \cap Z$ (cobre de terra); $C' = C \setminus Z$.
3. Placa $P$ (polígono do contorno). Faixa de borda: se $k < 30$ mil, $E = \mathrm{offset}_{linha}(\partial P,\ 30 - k)$
   (anel centrado na borda); senão $E = \emptyset$.
4. $N = P \setminus (C' \cup E)$ (região livre).
5. Alívio térmico: $T = (C_g \oplus_k) \setminus S$, onde $S$ são 4 raios retangulares por semente. Com o
   retângulo da semente de centro $(c_x, c_y)$ e meias-dimensões $(a, b)$, meia-largura do raio
   $t = \max(\min(a, b)/3,\ k/2)$:
   - verticais: $x \in [c_x - t,\ c_x + t]$, $y \in [c_y - b - k,\ c_y - b/2]$ e $y \in [c_y + b/2,\ c_y + b + k]$;
   - horizontais: $y \in [c_y - t,\ c_y + t]$, $x \in [c_x + a/2,\ c_x + a + k]$ e $x \in [c_x - a - k,\ c_x - a/2]$.

   Como $C_g$ não foi subtraído de $N$, o fill cobre a semente; subtrair $T$ deixa um anel de folga $k$ em volta
   do pad, interrompido pelos 4 raios, que entram até a metade do pad — é a ligação física do fill à terra.
6. Região de cobre: $F_0 = N \oplus_{-k}$; abertura morfológica com $\rho = \max(k/4,\ 1\,\mathrm{mil})$:
   $F_1 = (F_0 \oplus_{-\rho}) \oplus_{+\rho}$; $F = F_1 \setminus T$ (regra de preenchimento positiva).
7. Separar $F$ em polígonos (contorno externo + furos imediatos). Fill unitário: só o polígono que contém o ponto.
8. Descartar fragmentos com ($\Delta x < 0{,}05$ in **e** $\Delta y < 0{,}05$ in) ou ($\Delta x$ ou $\Delta y < 1/90$ in).
9. Para cada fragmento: um item `GroundPlaneModuleID` na face (`groundplane` = baixo, `groundplane1` = cima), com
   propriedades locais `svg` (SVG do fragmento: `<g id="groundplane|groundplane1"><path fill=… d="M…L…Z…"/>`,
   viewBox em unidades de 1/30.000 in, posição = canto do fragmento) e `fillType`.
10. **Conector do fill**: erodir o fragmento por $1{,}25\cdot0{,}075/2$ in; se sobrar área, colocar um círculo
    `connector0pad` de diâmetro 0,075 in no vértice de menor $x + y$ do fragmento erodido. É por ele que o usuário
    liga trilhas ao fill (o fill não entra automaticamente no netlist na referência).

Margem efetiva à borda da placa: $\max(30\ \mathrm{mil},\ k)$.

**CircuitMaster**: mesmo algoritmo com Clipper2 (inteiros de 64 bits, escala 30.000/in), executado num Web
Worker; adicionalmente associar o fill `ground` à net das sementes (melhora DRC e netlist), mantendo a gravação
compatível no `.fz`.

### 6.3 Blockers

Itens `…BlockerModuleID` (retângulos de exclusão) entram em $C'$ como obstáculo: o fill não ocupa a área e o
autorouter evita.

### 6.3.1 Área de cobre desenhada (extensão do CircuitMaster)

Ferramenta Área de cobre: os vértices são clicados na grade, e o duplo clique ou o clique no primeiro vértice fecha a
área. A área fica na face ativa (de cima com "Ambas"; de baixo em placa de uma face) e se liga à net pelo nome de um
terminal (vazio = sem net). Cobre = o preenchimento do §6.2 com $P \cap$ contorno: com net, no modo terra (alívio
térmico nos pads da net, trilhas da net dentro); sem net, simples. Cada fragmento guarda o contorno, a face e a net na
propriedade `zone` (JSON). "Preencher áreas desenhadas" refaz todas pelo contorno gravado, uma depois da outra, e cada
uma respeita a folga das que já foram. "Preencher" e "Remover" não apagam as áreas desenhadas; apagar o fragmento
selecionado apaga só ele.

### 6.4 Conferência com o Fritzing

Refazendo os dois planos gravados no exemplo Knock (folga 10 mil): a face de baixo dá 5,014 in² contra 5,015 in²
(−0,02%); a de cima dá 5,068 contra 4,649 in² (+9%). Em nenhuma das faces o Fritzing cobre algo que o
CircuitMaster deixa vazio (menos de 0,1% da área); o excesso de cima está 97% numa região só — um recorte
retangular de cantos redondos em volta do resistor e do piezo onde o arquivo atual não tem cobre nenhum na face de
cima. O plano de cima do exemplo foi gravado com outra disposição de peças (o de baixo, refeito, não tem esse
recorte): é dado antigo no `.fzz`, não diferença de regra.

---

## 7. DRC (DESIGN RULE CHECK)

### 7.1 Parâmetros

- Keepout $k$ = `DRC_Keepout` da vista PCB (padrão **10 mil**; aceita unidades: `0.01in`, `0.254mm`…).
- Camadas verificadas: Copper0+Copper0Trace (baixo) e Copper1+Copper1Trace (cima, se 2 camadas). **Planos de
  cobre não são verificados.**
- Nets por vista PCB: relação $R_{PCB}$ do documento 02 (apenas trilhas de PCB, barramentos, travessias de face e
  classes de símbolos conduzem). Conectores **isolados** de uma mesma peça são agrupados como um único grupo (não
  são testados entre si).

### 7.2 Regras (semântica de referência)

1. **Folga entre nets**: violação se a distância entre cobre de grupos diferentes na mesma face for $< k$.
   (Referência: rasteriza a $\max(250,\ 1000/k)$ dpi; o grupo testado em tamanho nominal contra os demais
   dilatados por $k$.) Mensagem: "`<peça>` está sobreposta (camada superior/inferior)".
2. **Borda**: cobre a menos de $k$ da borda da placa (cobre dilatado por $k$ fora da placa, com 1 pixel de
   tolerância). Mensagem: "Muito perto da borda (camada …)".
3. **Furos fora da placa**: não conector (furo de fixação) cuja caixa não está contida na placa.
4. **Cobre faltante**: peça não core cujo `.fzp` declara `copper0` e `copper1` mas cujo SVG não tem o pino em uma
   das faces → "Conector X em Y deveria ter cobre superior e inferior".

### 7.3 Algoritmo vetorial do CircuitMaster

Para cada face $f$:

1. Construir $Q_{g,f}$ = união dos polígonos de cobre de cada grupo $g$ (pads, trilhas com *offset* de meia largura
   e terminação redonda, vias).
2. Candidatos: R-tree das AABB de $Q_{g,f} \oplus k/2$; pares de grupos diferentes com AABB sobrepostas.
3. Violação de folga: $(Q_{g} \oplus_{k/2}) \cap (Q_{h} \oplus_{k/2}) \ne \emptyset$ (equivalente a
   $\mathrm{dist}(Q_g, Q_h) < k$). A região reportada é a interseção.
4. Borda: $(Q_{g} \oplus_{k}) \setminus P \ne \emptyset$.
5. Furos: polígono do não conector $\not\subseteq P$.
6. Saída: lista de violações `{tipo, face, itens, polígono, ponto central}` para destaque na vista e navegação.

Equivalência com a referência: diferenças só são aceitas em casos-limite de discretização (distância entre
$k - 1/\mathrm{dpi}$ e $k$). As dilatações usam $k/2 - 0{,}01$ mil (e $k - 0{,}02$ na borda): distância igual a $k$
passa, e bordas encostadas não viram faixa de área positiva pelo arredondamento das coordenadas inteiras do
Clipper2.

Nos 98 exemplos atuais do Fritzing, verificando cada placa sozinha (§2.1), 6 acusam violação, todas medidas e
reais: curto de cobre (Arduino-no-FTDI, Workshop_03_FlipFlop-w-Button, trilha sobre pad de outra net), trilha a
9,33 mil de pads de CI (Shift_Register_2x), peça fora da placa (full_wave_rectifier) e peças a 1,4–3 mil da borda
(measure_dc_current, simple_button). O color-fader tem duas placas e cada uma passa; verificar uma delas com as
trilhas da outra acusaria, falsamente, trilhas fora da placa.

### 7.4 Regras extras do CircuitMaster (não existem na referência)

Gravadas nos atributos da vista PCB do `.fz`, editáveis na aba Roteamento:

| Atributo | Regra | Padrão |
|---|---|---|
| `DRC_MinTrace` | trilha mais fina que o mínimo (`width`) | 0,127 mm |
| `DRC_MinRing` | anel menor que o mínimo (`ring`): o disco furo + anel tem de caber no cobre dos pads da face em volta do furo metalizado de conector | 0,13 mm |
| `DRC_MinDrill` | furo menor que o mínimo (`drill`), metalizado ou não | 0,3 mm |
| `DRC_NetClasses` | classes de net (JSON `[{name, nets, width, clearance}]`, mil; 0 = regra geral) | nenhuma |

Os padrões são os mínimos de fabricantes comuns de protótipo; nos 98 exemplos do Fritzing nenhum acusa. A net entra na
classe se algum terminal dela tem um dos nomes (`GND`) ou `peça.terminal` (`U1.7`), sem diferença de caixa; vale a
primeira classe. Folga entre dois grupos = a maior entre $k$ e as folgas das classes deles (os dilatados saem uma vez por
folga usada); trilha mínima = a maior entre a geral e a da classe. Cada violação traz o valor medido e o limite.

### 7.5 Empurrar trilhas (push-and-shove, extensão do CircuitMaster)

Com Empurrar ligado (Shift+R), os trechos que o desenho ou o arraste mudou empurram as trilhas de outras nets lógicas
na mesma face que ficariam a menos de $r = (w_a + w_v)/2 + k$: o trecho reto AB da vítima vira A → P1 → P2 → P3 → P4 → B,
com o trecho paralelo afastado para o lado oposto ao agressor pelo que falta para $r$, sobre o intervalo do agressor
projetado em AB mais $r$ de cada lado, e entrada e saída a 45°; as pontas não saem do lugar. Não há desvio se um agressor
cruza o trecho, se há agressores dos dois lados ou se o desvio chegaria a menos da folga de um pad ou de uma trilha de
outra net. Nesses casos a trilha fica como está e o DRC acusa. É uma passada só: a trilha empurrada não empurra as
vizinhas; trechos curvos e vias não entram.

---

### 7.6 Peça na face de baixo

A peça (`kind` part) vai para a face de baixo pelo atributo `bottom="true"` da vista PCB, como no Fritzing: o SVG da
instância é espelhado na horizontal em torno do centro do `viewBox` (a caixa da peça não muda; variante da biblioteca),
cobre e serigrafia passam para a camada da outra face (copper0 ↔ copper1, silkscreen ↔ silkscreen0) no desenho, no z e
na arte (CAM, DRC, roteador, Gerber), e a camada da instância vai para a da outra face. Atalho F; menu da peça "Colocar
na face de baixo/de cima". O footprint importado na face de baixo grava o SVG da vista de cima (já desespelhado), e a
face de baixo da instância espelha de volta.

## 8. AUTOROUTER

### 8.1 Parâmetros

| Chave (atributo da vista PCB no `.fz`) | Significado | Padrão |
|---|---|---|
| `autorouteTraceWidth` | largura da trilha em mil | 24 |
| `autorouteViaHoleSize` | furo da via | `0.4mm` |
| `autorouteViaRingThickness` | anel da via | `0.3mm` |
| `DRC_Keepout` | folga (compartilhada com o DRC) | `0.01in` |
| `GPG_Keepout` | folga do preenchimento de cobre | vazio ⇒ 10 mil |
| ciclos máximos (preferência do usuário) | número de ordenações tentadas | 100 |

### 8.2 Modelo de referência (roteador de labirinto)

- **Grade** uniforme com passo $g = \max(\text{largura de trilha},\ k)$ (px); 1 ou 2 camadas ($z$).
- Valores de célula: obstáculo de placa (fora do contorno, com margem $k$), obstáculo de peça (cobre de outras nets
  dilatado), origem, destino, "evitar" (vizinhança de trilhas já roteadas), obstáculo temporário, livre.
- **Ordem das nets**: crescente pelo número de pinos de outras nets dentro da caixa da net ("pinos internos").
  Cada net é dividida em subnets já conectadas; roteia-se sempre o **par mais próximo** de subnets.
- **Busca**: frentes de onda bidirecionais (origem e destino) com fila de prioridade; custo
  $c = c_{prev} + 1$ por passo em 4 direções; $+2000$ por troca de camada (via, só se a via couber:
  diâmetro $2a + d + 2k$ em células livres); $+7$ ao passar por célula "evitar"; heurística = distância de
  Chebyshev à frente oposta. Encontro das frentes ⇒ caminho por *trace back*.
- **Rip-up por reordenação**: se uma net falha, ela é movida para antes na ordem e tenta-se de novo, até o limite
  de ciclos ou esgotar ordenações. Melhor resultado: mais conexões roteadas; empate ⇒ menos vias.
- **Saída**: trilhas (`PCBTrace | Autoroutable`) com a largura configurada, vias (furo/anel configurados);
  em placa de uma face, jumpers quando permitido. No esquemático, o mesmo motor gera fios esquemáticos.
- Trilhas existentes não marcadas como autoroteáveis são preservadas e tratadas como obstáculos; "apagar trilhas
  autoroteadas" remove só as marcadas.

### 8.3 Implementação do CircuitMaster

- Rust/WASM em Web Worker, grade de bits por camada (obstáculos rasterizados a partir dos polígonos do DRC, com
  dilatação exata pelo Clipper2), A* bidirecional com os mesmos custos e mesma política de reordenação
  (garante resultados comparáveis).
- Na PCB, direções regulares (0°, 45°, 90°) com custo de curva, *gloss* de cada caminho e rip-up dirigido
  dentro de cada ciclo (§8.4); a reordenação entre ciclos continua valendo.
- Pós-processamento: fusão de segmentos colineares.
- Validação obrigatória do resultado pelo DRC vetorial antes de aplicar a transação.
- Cancelável, com progresso por ciclo e melhor resultado parcial disponível.

### 8.3.1 Placa automática e faces (extensão do CircuitMaster)

- **Criar placa e rotear** (aba Roteamento, PCB sem placa): cria `TwoLayerRectanglePCBModuleID` com `width` e
  `height` (mm) iguais à caixa das peças que têm cobre na PCB (instrumentos e símbolos ficam de fora) mais 0,15 in
  de folga em cada lado, com o canto nessa caixa, e roda o autorouter.
- **Faces** (Ambas, Topo, Base no cabeçalho do quadro na PCB): a face não escolhida é desenhada com opacidade 0,18
  (camadas `copper0`, `copper0trace`, `silkscreen0` e `groundplane` são de baixo; as de número 1 e `silkscreen`, de
  cima); com Base escolhida, as trilhas desenhadas à mão vão para `copper0trace`.

### 8.4 Modelo de grade do CircuitMaster

- Passo $g = \max(w, k)/2$ (metade do passo de referência, para passar entre pinos com folga exata); camada 0 =
  cobre de cima, camada 1 = de baixo (placa de uma face: só a de baixo). Centro da célula $(x, y)$ =
  $((x + ½)g,\ (y + ½)g)$ no referencial da placa.
- Cada célula guarda um **dono**: livre, bloqueada ou a net $n$ (a célula está a menos de $k + w/2$ do cobre de $n$
  e só $n$ pode passar). Célula na zona de duas nets, fora de $P \ominus (k + w/2)$, ou em cobre sem conector, é
  bloqueada. A zona é vista dos centros com raio $\sqrt{(k + w/2)^2 + g^2/2}$, o que garante a folga em todo o
  trecho entre dois centros vizinhos, inclusive na diagonal ($g\sqrt2$). Uma segunda tabela marca as células de
  **pad** de cada net (centro dentro do cobre do conector e fora da zona de outra net; pad menor que a célula
  ganha a célula do seu centro): o pad continua acessível à sua net mesmo bloqueado. Sem a restrição da zona,
  trilha mais larga que o pad entrava pela borda virada para o vizinho e invadia a folga dele; se nenhuma célula do
  pad sobra, ficam todas (o DRC aponta).
- Nets a rotear: as do ratsnest da PCB (conectividade completa vista na PCB); os grupos já ligados pela relação
  roteada (trilhas, barramentos) são as subnets; trilhas existentes são cobre da net (não são alvo).
- Por net (ordem crescente de pinos alheios dentro da caixa da net): árvore = primeira subnet; repete ligando a
  subnet mais próxima da árvore por A* multi-origem. Custos em décimos de passo: 10 por passo ortogonal, 14 por
  passo a 45° (só na PCB; a diagonal exige as duas células ortogonais da quina acessíveis), curva de 45° +3, de
  90° +6, de 135° +40, +70 em célula "evitar", via +20000 só se o disco de raio $(d/2 + a - w/2)/g$ estiver
  acessível nas duas camadas; heurística = distância octogonal (Manhattan sem diagonais) à caixa do alvo. O
  caminho entra na árvore (permite junção em T).
- **Gloss** (antes de aceitar o caminho): em cada trecho de uma camada, cada quina é ligada à quina mais adiante
  que ela alcança com uma ligação regular livre — um segmento a 0°/45°/90° ou dois (um diagonal e um ortogonal;
  sem diagonais, um em L), sem curva aguda na saída; sem atalho, fica o trecho original. É o modelo de trajetória
  regular do roteador interativo do Altium (dois pontos quaisquer ligados por no máximo duas direções regulares).
- Ao aceitar um caminho, o disco de raio $\sqrt{(w + k)^2 + g^2/2}/g$ em volta de cada célula (e
  $\sqrt{(d/2 + a + k + w/2)^2 + g^2/2}/g$ em volta de cada via, nas duas camadas) passa a ser da net, ou bloqueado
  se era de outra; o anel seguinte vira "evitar".
- **Rip-up dirigido** (até 40 rodadas por ciclo): a net incompleta é roteada em modo brando, em que células
  tomadas só por trilha de outra net (não por obstáculo fixo) podem ser atravessadas por +300 mais o histórico da
  célula; o histórico de cada célula atravessada sobe 10. As nets donas dessas trilhas saem, a grade é refeita com
  os caminhos restantes, a net incompleta é roteada normalmente e depois as que saíram. Net que nem no modo brando
  completa e não atravessa ninguém é desistida no ciclo. Fica o melhor estado (mais ligações; empate, menos vias).
- Conversão: células → polilinha de centros, fundindo colineares; ponta em pad é ligada ao conector (estendida até
  o ponto terminal); ponta no meio de outro caminho da mesma net divide aquele trecho (dobra com três fios); troca
  de camada cria via com o furo/anel configurados.
- **Esquemático**: uma camada, sem vias, passo = a grade da vista; toda célula que toca a caixa de uma peça ou
  símbolo é bloqueada (notas, réguas e moldura não), o terminal de cada pino é pad da sua subnet e, a partir dele,
  as células bloqueadas na direção do pino (spec 02 §4.3 regra 7) passam a ser da subnet até sair da caixa — pino
  com o terminal dentro da caixa da própria peça (margem do SVG) continua alcançável. Fio reto de outra net pode
  ser cruzado (+4). Se a grade da vista deixa ligações sem rota, repete-se com **meia grade** e fica o resultado
  com mais ligações (empate: a grade da vista). Nos 10 exemplos de referência (Knock, Amplification,
  AnalogInputPot, Button, Op-amp, Relay, Timer, Shift_Register, LCD, Stepper_Motor) o esquemático e a PCB ficam
  100% roteados; só o Shift_Register precisa da meia grade (8 pinos de CI a 0,1" com 2 colunas livres até os
  resistores).

---

## 9. ESTRUTURAS DE DADOS DO MOTOR CAM (CIRCUITMASTER)

| Estrutura | Conteúdo |
|---|---|
| `Shape` | `{kind: circle|rect|polyline|polygon|path, pts, r, w, cap, join, fill, stroke, drill?}` em mil, já achatada |
| `LayerGeom` | `face`, `role` (cobre, máscara, pasta, silk, contorno, furação), `shapes`, `polygons` (Clipper2 `Paths64`) |
| `Aperture` | `{type: C|R, dims[], key}` com `key` = texto de 6 casas; D-code |
| `DrillHit` | `{diam, x, y, plated}` |
| `DrcViolation` | `{type, face, groups, polygon, center}` |

Pipeline (worker): `instâncias PCB → shapes por camada (achatamento) → recorte pela placa → (máscara, pasta,
silk) por booleanas → writers (Gerber, Excellon, PnP) → ZIP`.

---

## 10. PLANO DE TESTES

1. **Gerber**: para sketches de exemplo com PCB, exportar no Fritzing e no CircuitMaster; rasterizar ambos
   (ex.: gerbv) a 0,5 mil e exigir área de XOR ≤ 0,1% da área de cobre por camada; mesmo conjunto de aberturas
   de *flash*.
2. **Excellon**: conjuntos de `(diâmetro, x, y, metalizado)` idênticos (tolerância de 0,1 mil pela truncagem).
3. **Fill**: área e número de fragmentos do ground fill dentro de 0,5% da referência; conector do fill no mesmo
   vértice.
4. **DRC**: mesmas violações (tipo, face, itens) para sketches com violações sintéticas a distâncias
   $k \pm 0{,}5$ mil.
5. **Autorouter**: em sketches de exemplo, número de conexões roteadas ≥ referência e zero violações de DRC.
