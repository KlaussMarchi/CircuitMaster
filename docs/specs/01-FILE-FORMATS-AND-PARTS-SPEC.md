# 01 — FORMATOS DE ARQUIVO E PEÇAS

Especificação funcional *clean room* dos formatos `.fzp`, `.fzpz`, `.fz`, `.fzz`, `.fzb`, `.fzbz`, do mapeamento
conector ↔ SVG, da matemática de ancoragem de pinos e das peças paramétricas, conforme observado no Fritzing
**1.0.8** (Qt 6.5–6.10) e no repositório `fritzing-parts` (2.619 arquivos `.fzp` analisados).

Este documento descreve **comportamento observável e contratos de dados**. Não contém código do `fritzing-app`.
Onde a regra vem de uma convenção de biblioteca (QtSvg), ela é descrita matematicamente para reimplementação
independente.

---

## 0. CONVENÇÕES, UNIDADES E REGIME DE LICENÇAS

### 0.1 Unidades

| Símbolo | Definição | Uso |
|---|---|---|
| **px** (unidade de cena) | 1/90 in | coordenadas de tudo que é salvo em `.fz` (posições, fios, legs) |
| **mil** | 1/1000 in | footprints gerados, larguras de trilha (`mils` em `wireExtras`), Gerber |
| **pt** | 1/72 in | SVGs esquemáticos gerados (viewBox em pontos) |
| **mm** | 1/25,4 in | placas redimensionáveis (`width`/`height` locais) |

Constantes: `SVGDPI = 90`, `StandardFritzingDPI = 1000`. Conversões: $px = 90\cdot in$, $mil = 1000\cdot in$,
$px = 0{,}09\cdot mil$.

### 0.2 Conversão de comprimento textual → polegadas (`toInches`)

Aplicada a `width`/`height` de SVG, tamanhos de furo, espaçamentos etc. O sufixo é testado nesta ordem
(sem diferenciar maiúsculas):

| Sufixo | Divisor |
|---|---|
| `cm` | 2,54 |
| `mm` | 25,4 |
| `in` | 1 |
| `px` | 90 (72 se o arquivo for do Adobe Illustrator — ver 3.1) |
| `mil` | 1000 |
| `pt` | 72 |
| `pc` | 6 |
| nenhum | 90 (após remover caracteres não numéricos do fim) |

Valor não numérico → falha (o SVG é rejeitado se for `width`/`height`).

### 0.3 Regime de licenças (consequência prática para o CircuitMaster)

| Origem | Licença | Uso permitido no CircuitMaster |
|---|---|---|
| `fritzing-app/src/**` | GPLv3 | **somente leitura para especificação**; nada copiado |
| `fritzing-parts/**` (`.fzp`, `.svg`, `.fzb`) | CC-BY-SA 3.0 | consumir diretamente como **dados**; exige atribuição e share-alike dos *assets* |
| `fritzing-app/resources/parts/**`, `resources/templates/**` | "part designs" → CC-BY-SA 3.0 (README do app) | idem; os *números* de geometria podem ser usados como dados com atribuição |
| `fritzing-app/resources/properties.xml`, `stripboards.xml`, `vias.xml` | tabelas factuais dentro do repositório GPL | **não copiar o arquivo**; recriar tabelas próprias a partir das regras deste documento |
| Fontes `resources/fonts` (Droid Sans, Noto Sans, OCRA) | licenças próprias (Apache 2.0 / OFL / domínio público) | podem ser embarcadas separadamente |

O código do CircuitMaster (TypeScript/Rust) é independente; os *assets* CC-BY-SA ficam num pacote de dados
separado com `NOTICE` próprio.

---

## 1. ECOSSISTEMA DE PEÇAS

### 1.1 Pastas de origem e precedência

O índice de peças é a união de cinco fontes, carregadas nesta ordem (uma peça é identificada por `moduleId`;
`moduleId` duplicado na carga inicial é **erro** e a segunda definição é descartada):

1. `fritzing-parts/` (pastas `core`, `contrib`, `obsolete`, `user`, recursivo) — peças oficiais.
2. Pasta de peças do usuário (instaladas pelo usuário).
3. Peças internas do aplicativo (`resources/parts/core/*.fzp`, 50 arquivos): fio, via, furo, pad, net label,
   símbolos de alimentação/terra, plano de cobre, logos, placas, jumper, nota, réguas, moldura esquemática.
4. Pasta de *override* opcional.
5. Pasta local de peças (onde `.fzpz` e peças vindas de `.fzz` são instaladas).

Uma peça é **core** quando vem dos recursos internos ou consta da lista core do banco; peças `contrib` são
marcadas pela pasta. Peças `obsolete` continuam carregáveis (para abrir sketches antigos), mas não aparecem
em buscas por padrão.

### 1.2 Resolução de SVG de uma vista

O atributo `image` de `<layers>` é um caminho relativo `"<vista>/<arquivo>.svg"` (ex.: `breadboard/resistor_220.svg`).
O arquivo é procurado em `svg/<pasta>/<image>` para cada `<pasta>` em `core, obsolete, contrib, user` (nesta
ordem), sob cada raiz candidata:

1. raízes específicas do módulo `…/<pasta>/<moduleId-sanitizado>/<image>` (local, usuário, fábrica);
2. pasta local de peças;
3. a raiz do repositório de onde o `.fzp` veio (dois níveis acima do arquivo `.fzp`);
4. a raiz do `fritzing-parts`, a pasta do usuário e a pasta da fábrica de peças geradas;
5. os SVGs internos do aplicativo (`resources/parts/svg/<pasta>/<image>`).

Se nada for encontrado e o nome casar com um **gerador** (seção 8), o SVG é sintetizado e gravado na pasta da
fábrica. O ícone pode reutilizar o SVG de breadboard (`iconView` apontando para `breadboard/...`).

### 1.3 Peças geradas sob demanda — requisito crítico

Pin headers genéricos, CIs DIP/SIP genéricos, *mystery parts*, *screw terminals*, perfboards e stripboards
**não existem como arquivos** em `fritzing-parts`. Eles são reconstruídos a partir do `moduleId` quando um
sketch é aberto, e **não são embutidos no `.fzz`** (verificado nos 124 sketches de exemplo: os 7 que usam peças
geradas — pin headers fêmea, macho e fêmea de dupla fileira, `generic_ic_dip_16_300mil`,
`15.20Stripboard2ModuleID` — não contêm nenhum `part.*` dessas peças).

Consequência: o CircuitMaster precisa de geradores que reproduzam **exatamente** o tamanho da tela SVG e a
posição de cada pino (seção 8). A arte interna pode diferir; geometria de conector não.

### 1.4 Classificação do tipo de item pelo `moduleId`

A ordem de teste importa (primeira regra que casa vence):

| Regra sobre `moduleId` | Tipo |
|---|---|
| `== WireModuleID` | fio |
| `== JumperModuleID` | jumper (PCB) |
| termina com `LogoImageModuleID` ou `LogoTextModuleID` | logo |
| `== GroundPlaneModuleID` | plano de cobre |
| `== NoteModuleID` | nota |
| termina com `2PowerModuleID` | peça comum |
| termina com `PowerModuleID`; `== GroundModuleID`; termina com `NetLabelModuleID`; `== PowerLabelModuleID` | símbolo |
| `== RulerModuleID` | régua |
| `== ViaModuleID` | via |
| `== HoleModuleID` | furo |
| termina com `PerfboardModuleID`, `StripboardModuleID`, `Stripboard2ModuleID` | breadboard (placa de protótipo) |
| texto concatenado de `<properties>` contém `breadboard` | breadboard |
| `<properties>` contém `plain vanilla pcb` **e** (`shield` ou título contém `custom`) | placa fixa |
| `<properties>` contém `plain vanilla pcb` | placa redimensionável |
| demais | peça comum |

Dentro de "peça comum", o comportamento paramétrico é escolhido por sufixo de `moduleId`
(`ResistorModuleID`, `CapacitorModuleID`, `CrystalModuleID`, `ThermistorModuleID`, `ZenerDiodeModuleID`,
`PotentiometerModuleID`, `InductorModuleID`, `LEDModuleID`, `ColorLEDModuleID`, `LEDSuperfluxModuleID`,
`SchematicFrameModuleID`, `PadModuleID`, `BlockerModuleID`, `OscilloscopeModuleID`) ou pela propriedade
`family` (`mystery part`, `screw terminal`, `pin header`, `generic IC`, `generic IC v2`). Um `moduleId` cujo
sufixo esteja na tabela de propriedades editáveis (seção 8.3) também ganha comportamento de "propriedades
editáveis".

`moduleId` especiais adicionais: `__spacer__` (separador de seção em bins), `BreadboardModuleID`,
`Breadboard-RSR03MB102-ModuleID`, `RectanglePCBModuleID`, `TwoLayerRectanglePCBModuleID`, `EllipsePCBModuleID`,
`TwoLayerEllipsePCBModuleID`, `Copper0PadModuleID`, `Copper0BlockerModuleID`, `Copper1BlockerModuleID`,
`LeftNetLabelModuleID`, `v5NetLabelModuleID`, `JustPowerModuleID`, `PhotocellModuleID`, logos por camada
(`Silkscreen0LogoImageModuleID`, `Copper0/1LogoText/ImageModuleID`, `Schematic…`, `Breadboard…`,
`BoardLogoImageModuleID`, `OneLayerBoardLogoImageModuleID`).

---

## 2. FORMATO `.fzp` (DEFINIÇÃO DE PEÇA)

XML UTF-8, raiz `<module>`. Parser tolerante: elementos desconhecidos são ignorados e devem ser **preservados**
em *round-trip* quando o CircuitMaster reexportar a peça.

### 2.1 Árvore completa (censo de 2.619 arquivos)

```
module            @moduleId (obrigatório, não vazio) @fritzingVersion @referenceFile
├── version       texto (inteiro); @replacedby = moduleId substituto
├── title         texto (pode conter entidades, ex. &#8486;)
├── label         prefixo do rótulo de instância ("R", "J", "U"…)
├── author, date (ISO), url, description (texto/HTML simples), taxonomy (a.b.c)
├── tags/tag*     texto
├── properties/property*  @name @showInLabel="yes" @fdata ; texto = valor
├── spice/line* , spice/model*      (seção 04)
├── history*      @date @author @mode(required|recommended|optional) ; texto = descrição
├── faction*      @type(toggle) @name ; off, on, values(@unit)/start,end   — reservado
├── schematic-subparts/subpart*  @id @label ; connectors/connector*(@id)
├── views
│   ├── iconView | breadboardView | schematicView | pcbView   @fliphorizontal @flipvertical ("true")
│   │   └── layers @image ; layer* @layerId @sticky("true")
│   ├── defaultUnits          (editor de peças; ignorar)
│   └── pcbView/label         (editor de peças; ignorar)
├── connectors    @ignoreTerminalPoints("true", sem diferenciar maiúsculas)
│   └── connector* @id @name @type(male|female|wire|pad) @replacedby
│       ├── description
│       ├── erc @etype(VCC|ground) @ignore(ifUnconnected|always)
│       │   ├── voltage @value @valueMin @valueMax
│       │   └── current @value @valueMin @valueMax @flow(source|sink)
│       └── views/{breadboardView|schematicView|pcbView}/p*
│               @layer @svgId @terminalId @legId @hybrid("yes") @replacedby
└── buses/bus* @id ; nodeMember* @connectorId
```

Frequências relevantes: 47.890 conectores; `terminalId` em 40.940 `<p>` esquemáticos e 5.066 de breadboard;
`legId` em 347; `hybrid` em 10.958 `<p>` de PCB e 5.330 esquemáticos; 3.805 barramentos com 13.798 membros;
178 peças com `<spice>`; 47 subpartes esquemáticas em 11 peças.

### 2.2 Metadados

- `title`, `label`, `version`, `author`, `description`, `url` (aparado), `taxonomy`, `date`: texto do primeiro
  elemento homônimo.
- `version/@replacedby`: peça obsoleta; o carregador de sketches pode oferecer troca pelo substituto.
- `connector/@replacedby`: mapeia o conector antigo para o novo `id` na troca obsoleto → novo.
- `history`: migração "suave". `mode` ausente = `optional`. Sinônimos legados: `silent`≡`required`
  (aplica sem perguntar), `forced`≡`recommended` (pergunta sempre), `ask`≡`optional` (pergunta quando
  relevante, pode ser silenciado).

### 2.3 Propriedades

- Chave = `name` **convertido para minúsculas e aparado**; valor = texto do elemento.
- `showInLabel="yes"` (sem diferenciar maiúsculas) → a chave entra na lista de exibição do rótulo da peça.
- Sempre existem as chaves `mn`, `mpn` e `part number` (inseridas vazias se ausentes, e marcadas para exibição).
- `family` define o grupo de troca (*swap*): peças da mesma família são intercambiáveis pelo inspetor,
  escolhendo a combinação de propriedades.
- `layer` (vazia) é inserida automaticamente em peças de PCB para permitir mudar a face (seção 2.5).
- `editable pin labels = true` permite renomear pinos por instância (`localConnectors` no `.fz`).
- `fdata` (2 ocorrências) é atributo do editor; ignorar.

### 2.4 Vistas e camadas

- Nomes de vista: `iconView`, `breadboardView`, `schematicView`, `pcbView`. Outros nomes são ignorados.
- `layers/@image` é o SVG da vista; cada `<layer layerId>` declara uma camada do SVG que a peça ocupa.
  `layerId` desconhecido (`keepout`, `soldermask`, `outline`, `unknown`, `unkown`…) é **ignorado** — por isso o
  resistor declara 6 camadas de PCB mas só `copper0`, `copper1` e `silkscreen` contam.
- `sticky="true"`: itens apoiados sobre esta peça (placas, breadboards) se movem junto com ela.
- `fliphorizontal`/`flipvertical="true"` habilitam espelhamento na vista. **A vista esquemática sempre aceita
  os dois espelhamentos** e sempre ganha a camada `schematicText` (textos do SVG esquemático são separados para
  não espelhar texto).
- **Endireitamento do texto do esquemático.** Com a parte linear $(a, b, c, d)$ da matriz da instância, ela está
  *espelhada* se $ad - bc < 0$ e *de cabeça para baixo* se $d \le -\sqrt{2}/2$ (rotação entre 135° e 225°). Cada
  bloco de texto (o grupo `<g id="label">` que contém o `<text>`, para várias linhas, ou o próprio `<text>` com
  seus `<tspan>`) recebe, em torno do centro da sua caixa nas coordenadas do pai do `<text>`, a escala
  $(s_x, s_y)$: $s_x = -1$ quando exatamente uma das duas condições vale, $s_y = -1$ quando está de cabeça para
  baixo. O texto fica legível na mesma caixa, e as linhas de um bloco mantêm a ordem; em 90°/270° continua
  vertical. Vale para toda peça do esquemático, net labels e símbolos de tensão incluídos.
- Uma vista existe para a peça se ao menos uma camada válida foi declarada.

### 2.5 Normalização de cobre (THT × SMD)

Executada após carregar os conectores, exceto para peças internas do aplicativo:

1. Se a vista PCB não tem `copper0` nem `copper1`: nada a fazer.
2. **THT** (tem `copper0`):
   - se falta `copper1`, ele é adicionado e cada `<p>` de `copper0` é duplicado para `copper1`
     (marca "precisa de copper1": o SVG ganha uma cópia do grupo `copper0` com id `copper1`);
   - se tem `silkscreen` (topo) mas não `silkscreen0`, `silkscreen0` é adicionado e marcado *flipped*;
   - garante a propriedade `layer`.
3. **SMD** (só `copper1`): a peça é marcada `flippedSMD`; adiciona `copper0` como camada *flipped*
   (espelho de `copper1`), idem `silkscreen0` a partir de `silkscreen`; duplica `<p>` de `copper1` para
   `copper0`; garante `layer`.

Assim **todo conector de PCB existe nas duas faces**; para SMD a face oposta só é usada quando a peça é
colocada embaixo (`bottom="true"` no `.fz`, seção 5.4).

### 2.6 Conectores

- `id` (único na peça; convenção `connectorN`), `name` (rótulo, ex. `GND`, `pin1A`), `description`.
- `type`: `male`, `female`, `wire`, `pad`; qualquer outro → `unknown`. Se `unknown` e algum `svgId` termina com
  `pad`, o tipo vira `pad`.
- **Regra de compatibilidade** de encaixe direto (soltar um pino sobre outro): `unknown` nunca conecta;
  `wire` conecta com qualquer tipo; senão só conecta se os tipos forem **diferentes** (macho ↔ fêmea,
  pad ↔ macho etc.). Não se aplica a fios desenhados (fios sempre conectam).
- Cada `<p>` liga o conector a um elemento SVG numa camada:
  - `svgId`: id do elemento cuja caixa delimita o pino;
  - `terminalId`: id do elemento cujo **centro** é o ponto exato de ancoragem de fios (seção 3.6);
  - `legId`: id de uma `<line>` que vira **perna elástica** (breadboard; seção 3.8);
  - `hybrid="yes"`: o conector existe no modelo (participa do netlist) mas é invisível e não clicável na vista;
    pode ter tamanho zero.
- Em PCB um conector costuma ter dois `<p>` (`copper0`, `copper1`) apontando para o mesmo `svgId`.
- Breadboards usam a camada `breadboardbreadboard` também em `schematicView`/`pcbView` (seção 8.8).

### 2.7 Barramentos internos (`<buses>`)

Cada `<bus id>` lista `nodeMember/@connectorId`; todos os conectores listados são **o mesmo nó elétrico dentro
da peça** (fileiras de breadboard, pinos GND repetidos de um Arduino). Membro inexistente é ignorado com aviso.
Um conector pertence a no máximo um barramento. Barramentos são ignorados em subpartes. Peças dinâmicas podem
criar barramentos em tempo de execução (stripboard, seção 8.7; símbolos, seção 8.9).

### 2.8 Subpartes esquemáticas (`<schematic-subparts>`)

Peças com várias unidades (ex.: um CI com 4 portas) declaram `subpart@id@label` com a lista de conectores da
unidade. Para cada subparte é derivada uma peça virtual:

- `moduleId = <moduleIdPai>_<idSubparte>`; `label` substituído pelo `label` da subparte;
- vista esquemática com imagem `<imagemEsquemáticaPai sem .svg>_<idSubparte>.svg`, gerada a partir do SVG pai
  mantendo apenas o elemento de id = `idSubparte` (os demais elementos viram grupos vazios); o deslocamento da
  subparte é preservado;
- as demais vistas reutilizam a camada esquemática (a subparte só aparece no esquemático);
- conectores: apenas os listados, cada um com um único `<p>` na camada `schematic`.

No `.fz`, a instância de subparte referencia o pai com `superpart="<modelIndex do pai>"`.

### 2.9 Dados ERC

`erc/@etype` = `VCC` ou `ground`; `@ignore` = `ifUnconnected` ou `always` (padrão `never`); filhos `voltage` e
`current` com `value`, `valueMin`, `valueMax` (números) e `flow` (`source`/`sink`). Usado para avisos de
conexão e pelo simulador (seção 04).

---

## 3. SVG DE PEÇAS E MATEMÁTICA DE ANCORAGEM

### 3.1 Tamanho físico e viewBox

- Lê-se `width`/`height` do `<svg>` raiz com `toInches` (seção 0.2). Se o arquivo contiver o identificador do
  Adobe Illustrator (`Generator: Adobe Illustrator`, sem diferenciar maiúsculas, normalmente num comentário),
  `px` vale 1/72 in e `width`/`height` em `px` são reescritos em `in`.
- Tamanho zero, `NaN` ou infinito → a vista da peça falha ao carregar.
- Tamanho da peça na cena: $W_{px} = 90\,W_{in}$, $H_{px} = 90\,H_{in}$.
- `viewBox = (v_x, v_y, v_w, v_h)`. Ausente → $(0, 0, W_{px}, H_{px})$ (unidades de usuário = px a 90 dpi,
  semântica QtSvg).
- Fatores de escala usuário → cena: $s_x = W_{px}/v_w$, $s_y = H_{px}/v_h$.

### 3.2 Pipeline de normalização (ordem obrigatória)

Antes de qualquer cálculo de pino, o SVG é normalizado:

1. remover atributos e elementos `sodipodi:`/`inkscape:`;
2. **unidades internas**: valores de atributo entre aspas no formato `<número><px|mm|cm|in|pt|pc>` (após a tag
   `<svg>`) e `stroke-width:<número><unidade>` em `style` são convertidos para unidades de usuário:
   $u = toInches(v)\cdot v_w / W_{in}$;
3. **origem do viewBox**: se $(v_x, v_y) \neq (0,0)$, o viewBox vira $(0,0,v_w,v_h)$ e todo o conteúdo é envolto
   em `<g transform="translate(−v_x,−v_y)">`;
4. remover `<pattern>`, `<marker>` e `<clipPath>`;
5. expandir `<use href="#id" id=…>`: substituído por `<g transform="<transform do use> translate(x,y)">` contendo
   cópia do alvo; atributos `faction*` são preservados no `<g>` (e o `id` do `use` fica no `<g>` quando é
   marcador `faction`);
6. achatar `<tspan>` em `<text>` (sem tspans aninhados, sem `textPath`);
7. (opcional) materializar `stroke-width` herdado;
8. **elevar transformações**: todo elemento com `transform` é envolvido num `<g transform>` e perde o atributo.

Após o passo 8, "transformação do próprio elemento" é sempre identidade; isso torna equivalentes as duas
convenções de CTM descritas abaixo.

### 3.3 Extração por camada

Quando a peça declara mais de uma camada na vista, cada camada é renderizada a partir do **mesmo arquivo** com
apenas a subárvore `<g id="<nomeXmlDaCamada>">`:

- a tela (`width`, `height`, `viewBox`) é preservada → todas as camadas compartilham o mesmo sistema de
  coordenadas;
- transformações dos ancestrais do grupo são preservadas (acumuladas num `<g>` externo), incluindo a correção
  de origem do viewBox;
- grupos aninhados são incluídos: no padrão THT `<g id="copper0"><g id="copper1">…</g></g>`, a camada `copper0`
  contém todo o cobre e `copper1` só a parte interna — ambas com os mesmos pads;
- a vista esquemática não usa o divisor de camadas: a camada `schematic` é o arquivo com textos ocultos e
  `schematicText` é o arquivo apenas com textos (se não houver texto, a camada não é criada).

Cor forçada por camada (apenas visual): `copper0 #f9a435`, `copper1 #fdde68`, trilha `copper0 #f28a00`,
trilha `copper1 #f2c600`, `silkscreen1 #000000`, `silkscreen0 #444444`, placa `#ffffff`. Exceção: preto
(`black`, `#000000`) não é recolorido.

Na tela do CircuitMaster a PCB usa a paleta do Altium no lugar dessas cores (exportações e arquivo continuam com as
do Fritzing): cobre de cima e trilha de cima `#ff3030`, cobre de baixo e trilha de baixo `#3d5cff`, pad de peça com
cobre nas duas faces (passante) `#c8c8c8`, serigrafia de cima e rótulos `#ffff00`, de baixo `#9a9a00`, plano de
terra de cima `#a81c1c`, de baixo `#25349e`, placa `#000000` sobre a área de trabalho `#262626` com grade
`#4a4a4a`, nos dois temas. Na PCB e no esquemático o verde de conector ligado não é pintado (doc 02 §4.2).

### 3.4 Localização do elemento do pino

O elemento com `id == svgId` é procurado em toda a árvore da camada (o arquivo inteiro quando a vista declara uma
única camada, ou só a subárvore do grupo da camada quando declara várias — 3.3); com `id` duplicado vale a
**última** ocorrência em ordem de documento. Elementos cujo `id`
começa com `nonconn` (sem diferenciar maiúsculas) são "não conectores": áreas de cobre sem rede (ex.: furos de
fixação metalizados) que entram no DRC e no Gerber, mas não no netlist. Um não-conector cuja caixa ocupa a tela
inteira é descartado.

### 3.5 Caixa do pino — fórmula

Seja $e$ o elemento do pino e:

- $B_e$ = caixa delimitadora alinhada aos eixos (AABB) da geometria de $e$ **no sistema local de $e$, incluindo a
  própria transformação de $e$**. Quando o traço é pintado (`stroke` ≠ `none` e largura > 0), $B_e$ é a AABB do
  **contorno traçado** (largura `stroke-width`, terminação `stroke-linecap`, junção *miter* com limite 4);
  caso contrário é a AABB geométrica. Para `<line>` sem traço a caixa pode ter largura ou altura zero.
- $M_e$ = produto das transformações de **todos os ancestrais** de $e$ (sem a de $e$).

Então, em unidades de usuário e depois em px locais da peça:

$$R_u = \mathrm{AABB}\big(M_e(B_e)\big)$$
$$R = \big(s_x R_u.x,\; s_y R_u.y,\; s_x R_u.w,\; s_y R_u.h\big)$$

- Se $R_u$ é nula (largura **e** altura zero) e o conector não é `hybrid`, o pino é **invisível** nesta
  camada/face e o conector não é criado nela.
- Para círculos (pads de PCB): `r` e `stroke-width` do `<circle>` (ou do primeiro `<circle>`/`<path>`
  descendente) são guardados. Se o elemento tem transformação não unitária, $r$ e a largura são escalados pela
  razão de larguras $|M(r,0)|/r$. Em px: $r_{px} = |M_e(r,0)|\cdot s_x$ e $w_{px} = |M_e(w,0)|\cdot s_x$.
  Esses valores alimentam DRC, Gerber (*flash*) e conexão ao plano de terra (documento 03).
- Para `<path>` com `stroke` ≠ `none`: Fritzing testa se o caminho é um **anel** (pad redondo desenhado como
  path) rasterizando-o; no CircuitMaster use o teste vetorial equivalente: o path é um anel se a sua forma
  preenchida/traçada for simétrica em x e y e tiver um furo central circular concêntrico; então
  $r = (\min(B.w, B.h) - w)/2$ e marca-se o conector como "path".

> Validação empírica (protótipo independente, seção 10) sobre os 98 sketches de exemplo não obsoletos (os 26 de
> `sketches/core/obsolete` foram salvos pelo 0.7–0.8.4 e usam os esquemáticos antigos da migração 5.4): aplicando
> as seções 3.1–3.8 tal como escritas, coincidem com erro ≤ 0,01 px **2.070 de 2.071** pontas de fio na breadboard
> (incluindo pernas elásticas e rotações) e **2.085 de 2.129** no esquemático. Das 44 divergências
> esquemáticas, 37 são net labels, cujo SVG é regenerado a partir do texto (8.9) e não foi modelado no protótipo;
> as demais são geometria obsoleta gravada nos próprios arquivos. Sem o traço na AABB, 128 pontas esquemáticas
> passam a errar até 0,5 px — o traço **entra** na caixa. Sem a regra do Illustrator (3.1), centenas de pontas
> esquemáticas falham.

### 3.6 Ponto terminal (ancoragem de fios)

O **ponto terminal** $t$ é guardado relativo ao canto superior esquerdo de $R$. A regra 3 tem precedência
sobre a 2 (vale mesmo com `ignoreTerminalPoints`); a 2 tem precedência sobre a 4.

1. Padrão: $t = (R.w/2,\; R.h/2)$ (centro da caixa).
2. Se a peça tem `ignoreTerminalPoints="true"` → padrão (breadboards e perfboards usam isso).
3. **Vista esquemática sem `terminalId`** → regra de extremidade automática:
   - se $|R.w| < 0{,}001$ e $|R.h| < 0{,}001$ → centro;
   - se $R.h \ge 0{,}001$ e $0{,}9 \le R.w/R.h \le 1{,}1$ (quase quadrado) → centro;
   - seja $c = (\lfloor W_{px}\rceil/2,\; \lfloor H_{px}\rceil/2)$ o centro da tela (tamanho arredondado para
     inteiro);
   - se $R.w > R.h$ (pino horizontal): extremidade esquerda $(0, R.h/2)$ se o centro de $R$ está à esquerda de
     $c_x$, senão a direita $(R.w, R.h/2)$;
   - senão (vertical): topo $(R.w/2, 0)$ se o centro está acima de $c_y$, senão base $(R.w/2, R.h)$.
4. Com `terminalId` não vazio e existente: seja $B_t$, $M_t$ como em 3.5 para o elemento terminal;
   $T = \mathrm{centro}(\mathrm{AABB}(M_t(B_t)))$; $t = (s_x T_x - R.x,\; s_y T_y - R.y)$.
   Elemento terminal inexistente ou com caixa nula → padrão (com aviso).

O ponto terminal **pode ficar fora de $R$** (ex.: terminais de esquemático colados na ponta do traço).

### 3.7 Do sistema local da peça para a cena

Cada instância tem posição $p = (x, y)$ (px) e uma transformação afim opcional $A$ salva em
`<transform m11 m12 m13 m21 m22 m23 m31 m32 m33>` (convenção de vetor-linha):

$$x' = m_{11}x + m_{21}y + m_{31},\qquad y' = m_{12}x + m_{22}y + m_{32}$$

($m_{13}, m_{23}, m_{33}$ = 0, 0, 1 em todos os casos práticos.) Rotações e espelhamentos são sempre em torno
do centro da tela da peça $c = (W_{px}/2, H_{px}/2)$:

$$A(q) = L\,(q - c) + c,\quad L \in \{\text{rotações de } k\cdot 45°,\ \text{espelhos}\}$$

Ponto terminal na cena (conector sem perna):

$$P = p + A\big(R.\mathrm{topLeft} + t\big)$$

Exemplo verificado no sketch `Amplification.fzz`: motor com $m_{11}=0, m_{12}=-1, m_{21}=1, m_{22}=0,
m_{31}=40{,}2575, m_{32}=109{,}908$ ⇒ rotação de −90° em torno de $c=(75{,}08;\,34{,}83)$, i.e., peça de
$150{,}16 \times 69{,}65$ px.

### 3.8 Pernas elásticas (`legId`, breadboard)

- O elemento `legId` deve ser uma `<line x1 y1 x2 y2>`; ele **não é desenhado** como parte do SVG (é removido da
  renderização) e passa a ser desenhado pelo editor.
- Cor da perna = `stroke` da linha (padrão `#8C8C8C`); largura = `stroke-width` (padrão 0,029) × $s_x$.
- Extremidades mapeadas por $M_{leg}\cdot T_{própria}$ e escaladas por $(s_x, s_y)$; a extremidade **mais próxima
  do centro da tela** é $p_1$ (raiz, presa ao corpo), a outra é $p_2$ (ponta livre).
- O conector passa a ter posição local $p_1$ e um polígono de perna $[(0,0),\ p_2-p_1]$ em coordenadas do
  conector; o usuário pode dobrar/estender a perna, acrescentando vértices e curvas Bézier por segmento.
- **O ponto de conexão de um conector com perna é o último vértice do polígono**:
  $P = p + A(\mathrm{pos}_{conector} + \mathrm{leg}_{último})$.
- Conectado a um conector fêmea (furo de breadboard), a ponta da perna acompanha o alvo.

### 3.9 Marcadores `faction="lock"`

Elementos (normalmente `<use href="#lock" faction="lock">`) marcam âncoras do ícone de cadeado. Cada marcador é
removido da renderização; sua posição $A_{acum}(0,0)$ (produto das transformações do marcador até a raiz) é
guardada, ordenada por `id`, e convertida para px com $(s_x, s_y)$. Uso puramente visual.

### 3.10 Face inferior (PCB) — espelhamento

Ao colocar uma peça na face de baixo (`bottom="true"`):

- SMD: a camada `copper0` é gerada espelhando o grupo `copper1`; `silkscreen0` espelhando `silkscreen`.
- THT: `copper0` e `copper1` trocam de papel por espelhamento cruzado; `silkscreen0` vem de `silkscreen`.
- Espelho em torno do centro da tela, por padrão no eixo vertical: $x_u' = v_w - x_u$ (orientação configurável
  por sketch; a alternativa espelha $y$).
- O grupo espelhado recebe `flipped="1"`; pinos são recalculados no SVG espelhado (mesmo procedimento 3.5–3.6).

### 3.11 Pino "big dot" e conectores especiais

- Fios têm conectores circulares nas pontas.
- Um plano de cobre tem conector cuja **forma** é o contorno do preenchimento; um fio que se liga a ele ancora no
  **ponto do contorno mais próximo** da outra ponta do fio (projeção ortogonal sobre os segmentos do contorno).

---

## 4. CAMADAS

### 4.1 Tabela de camadas (ordem = empilhamento de baixo para cima)

| # | Vista | Id interno | Nome XML (`layerId`, `layer`) | Exibição |
|---|---|---|---|---|
| 0 | ícone | Icon | `icon` | Ícone |
| 0 | breadboard | BreadboardBreadboard | `breadboardbreadboard` | Breadboard |
| 1 | breadboard | Breadboard | `breadboard` | Peças |
| 2 | breadboard | BreadboardWire | `breadboardWire` | Fios |
| 3 | breadboard | BreadboardLabel | `breadboardLabel` | Rótulos |
| 4 | breadboard | BreadboardRatsnest | `breadboardRatsnest` | Ratsnest |
| 5 | breadboard | BreadboardNote | `breadboardNote` | Notas |
| 6 | breadboard | BreadboardRuler | `breadboardRuler` | Réguas |
| 0 | esquemático | SchematicFrame | `schematicframe` | Moldura |
| 1 | esquemático | Schematic | `schematic` | Peças |
| 2 | esquemático | SchematicText | `schematicText` | Texto |
| 3 | esquemático | SchematicWire | `schematicWire` | **Ratsnest** |
| 4 | esquemático | SchematicTrace | `schematicTrace` | **Fios** |
| 5 | esquemático | SchematicLabel | `schematicLabel` | Rótulos |
| 6 | esquemático | SchematicNote | `schematicNote` | Notas |
| 7 | esquemático | SchematicRuler | `schematicRuler` | Réguas |
| 0 | PCB | Board | `board` | Placa |
| 1 | PCB | GroundPlane0 | `groundplane` | Preenchimento inferior |
| 2 | PCB | Silkscreen0 | `silkscreen0` | Serigrafia inferior |
| 3 | PCB | Silkscreen0Label | `silkscreen0Label` | Rótulos inferiores |
| 4 | PCB | Copper0 | `copper0` | Cobre inferior |
| 5 | PCB | Copper0Trace | `copper0trace` | Trilhas inferiores |
| 6 | PCB | GroundPlane1 | `groundplane1` | Preenchimento superior |
| 7 | PCB | Copper1 | `copper1` | Cobre superior |
| 8 | PCB | Copper1Trace | `copper1trace` | Trilhas superiores |
| 9 | PCB | PcbRatsnest | `ratsnest` | Ratsnest |
| 10 | PCB | Silkscreen1 | `silkscreen` | Serigrafia superior |
| 11 | PCB | Silkscreen1Label | `silkscreenLabel` | Rótulos superiores |
| 12 | PCB | PartImage | `partimage` | Imagem da peça |
| 13 | PCB | PcbNote | `pcbNote` | Notas |
| 14 | PCB | PcbRuler | `pcbRuler` | Réguas |

Atenção às armadilhas de nome: `silkscreen` é a serigrafia **superior**; `groundplane` é o preenchimento
**inferior**; no esquemático `schematicWire` é ratsnest e `schematicTrace` é fio desenhado.

Vista PCB "vista de baixo" inverte a pilha: Board, GroundPlane1, Silkscreen1, Silkscreen1Label, Copper1,
Copper1Trace, GroundPlane0, Copper0, Copper0Trace, Ratsnest, Silkscreen0, Silkscreen0Label, PartImage, notas,
réguas.

### 4.2 Conjuntos e regras

- Cobre inferior = {GroundPlane0, Copper0, Copper0Trace}; superior = {GroundPlane1, Copper1, Copper1Trace}.
- **Não conectáveis diretamente**: qualquer camada do conjunto inferior com qualquer do superior (só via ou
  pad THT atravessam faces). Mesma camada sempre conecta.
- Alternativa de camada: Copper0 ↔ Copper1.
- Face de um item: Copper1, Copper1Trace, GroundPlane1 → topo; demais → baixo.
- Camadas de furação: Copper0 e Copper1. Contorno: Board. Serigrafia: Silkscreen0, Silkscreen1.
- Camadas não cobre de PCB (não geram conectores): Silkscreen0/1, seus rótulos, PartImage.

### 4.3 Coordenada z

Cada camada $i$ de uma vista tem base $z_i = 1{,}5 + i$; cada novo item na camada recebe
$z = z_i + n\cdot 10^{-5}$ ($n$ crescente). Valores observados: peças de breadboard 2,500x; fios de breadboard
3,500x; peças `copper0` 5,500x; trilhas `copper1trace` 9,500x; peças esquemáticas 2,500x; fios esquemáticos
5,500x. O `z` salvo deve ser reaproveitado na carga para manter a ordem de desenho.

---

## 5. FORMATO `.fz` (SKETCH)

### 5.1 Estrutura

```xml
<module fritzingVersion="1.0.8.2026-06-14.1.0.7b1-97-g2bb9ba47a" icon=".png">
  <originalFileName>…</originalFileName>            <!-- só em arquivos de backup -->
  <project_properties>
    <simulator_animation_time_s value="5s"/>
    <simulator_number_of_steps value="400"/>
    <simulator_spice_options value=""/>
    <simulator_time_step_mode value="false"/>
    <simulator_time_step_s value="1us"/>
  </project_properties>
  <boards>
    <board moduleId="…" title="…" instance="PCB1" width="6.88566cm" height="5.36311cm"/>
  </boards>
  <programs pid="…"><program language="…">caminho</program></programs>
  <views>
    <view name="breadboardView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1"
          alignToGrid="0" viewFromBelow="0" colorWiresByLength="0"/>
    <view name="schematicView" … />
    <view name="pcbView" backgroundColor="#333333" gridSize="0.05in" showGrid="1" alignToGrid="1"
          viewFromBelow="0" DRC_Keepout="0.01in" GPG_Keepout="" autorouteTraceWidth="24"
          autorouteViaHoleSize="0.4mm" autorouteViaRingThickness="0.3mm"/>
  </views>
  <instances> <instance …/>* </instances>
</module>
```

- `fritzingVersion` = `M.m.s[modificador].data.git`; modificadores `a`, `b`, `rc` ou vazio. Ausente ou
  malformado → aviso; mais novo que o leitor → aviso.
- `boards`: informativo (tamanho calculado da placa em cm a partir do retângulo da placa em px/90·2,54).
- `views/view`: atributos de grade e as configurações de autorouter/DRC da vista (todas as chaves extras do
  roteador são gravadas como atributos; ver documento 03).

### 5.2 `<instance>`

```xml
<instance moduleIdRef="ResistorModuleID" modelIndex="5" path="resistor.fzp" flippedSMD="true">
  <property name="resistance" value="220"/>*
  <title>R1</title>
  <text>…</text>                                   <!-- notas (HTML) e textos de logo -->
  <localConnectors><localConnector id="connector0" name="VIN"/></localConnectors>
  <views>
    <breadboardView layer="breadboard" locked="true" superpart="12" bottom="true">
      <geometry z="2.5" x="…" y="…"><transform m11 … m33/></geometry>
      <titleGeometry visible="true" x y z xOffset yOffset textColor="#000000" fontSize="5">
        <displayKey key="…"/>*
      </titleGeometry>
      <layerHidden layer="…"/>*
      <connectors>
        <connector connectorId="connector0" layer="breadboard" groundFillSeed="true">
          <geometry x="…" y="…"/>
          <leg><point x y/><bezier/>…</leg>
          <connects><connect connectorId="pin5C" modelIndex="1846771" layer="breadboardbreadboard"/>*</connects>
        </connector>*
      </connectors>
    </breadboardView>
    <schematicView …/> <pcbView …/>
  </views>
</instance>
```

Regras:

- Uma `<instance>` sem `<views>` ou com `<views>` vazio é **ignorada** na carga de sketch. Há arquivos reais com
  cópias vazias de uma instância (mesmo `modelIndex`, sem vistas) depois da cópia completa; elas não podem
  sobrescrever a instância válida.
- `moduleIdRef` resolve a peça no índice; `path` é só o nome do `.fzp` (dica). Atributos extras na `<instance>`
  (exceto `moduleIdRef`, `modelIndex`, `originalModelIndex`, `path`) viram **propriedades locais**.
- `property name/value`: propriedades locais da instância (valores vazios são ignorados na carga). Elas
  sobrepõem as da peça (ex.: `resistance`, `pin spacing`, `chip label`, `voltage`, `label`, `buses`,
  `width`/`height` de placa, `hole size`, `layer`, `color`).
- `title`: rótulo único da instância (ver 5.6).
- `localConnectors`: nomes de pino por instância (peças com `editable pin labels`).
- Por vista: `layer` = camada em que o item está; `locked` = travado; `superpart` = `modelIndex` do pai
  (subparte); `bottom="true"` = PCB na face inferior.
- `geometry`: `z`, `x`, `y` (posição px do canto superior esquerdo da tela da peça antes da transformação) e
  `<transform>` opcional (seção 3.7).
- `titleGeometry`: rótulo da peça (posição de cena, deslocamento relativo, cor, tamanho em pt, chaves exibidas).
- Um `<connector>` só é gravado se tiver conexões, perna elástica ou for semente de preenchimento
  (`groundFillSeed`). `geometry` = posição do item conector relativa à peça (0,0 para conectores sem perna;
  $p_1$ para pernas).
- `leg`: vértices em coordenadas do conector, cada um seguido de `<bezier/>` vazio (segmento reto) ou
  `<bezier><cp0 x y/><cp1 x y/></bezier>` (o *i*-ésimo `bezier`, $i \ge 1$, curva o segmento $(p_{i-1}, p_i)$).
- `connects/connect`: o outro lado da conexão (`connectorId` do conector alvo, `modelIndex` da instância alvo,
  `layer` do item alvo). As conexões são **gravadas nos dois lados**; fios de ratsnest não são gravados.

### 5.3 Fios (`WireModuleID`)

```xml
<breadboardView layer="breadboardWire">
  <geometry z="3.5" x="-67.032" y="-4.05756" x1="0" y1="0" x2="81.033" y2="-35.9429" wireFlags="64"/>
  <wireExtras mils="22.2222" color="#fff800" opacity="1" banded="0">
    <bezier><cp0 x y/><cp1 x y/></bezier>
  </wireExtras>
  <connectors> connector0 (ponta x1,y1) e connector1 (ponta x2,y2) </connectors>
</breadboardView>
```

- Pontas na cena: $(x+x_1, y+y_1)$ e $(x+x_2, y+y_2)$; fios não têm `<transform>`.
- `mils` = largura do traço em mils (22,2222 mil = 2 px; 11,1111 = 1 px; 33,3333 = 3 px); `color`, `opacity`,
  `banded` (fio listrado).
- `bezier` opcional: cúbica $p_1 \to cp_0 \to cp_1 \to p_2$ em coordenadas locais do fio.
- Um fio de breadboard é salvo com geometria em **todas as vistas**, mas só é "real" na vista em que foi
  desenhado; nas outras ele existe como item invisível (para levar a conectividade, documento 02).

`wireFlags` (bits):

| Bit | Valor | Significado |
|---|---|---|
| Routed | 2 | (legado) roteado |
| PCBTrace | 4 | trilha de PCB |
| ObsoleteJumper | 8 | jumper antigo |
| Ratsnest | 16 | linha de ratsnest (virtual, nunca salva) |
| Autoroutable | 32 | pode ser apagado/refeito pelo autorouter |
| Normal | 64 | fio comum (breadboard) |
| SchematicTrace | 128 | fio desenhado no esquemático |

Tipo do item de fio: `Ratsnest` → linha virtual; `PCBTrace` ou `SchematicTrace` → trilha; senão fio de
breadboard. Larguras padrão: trilha PCB 24 mil (opções 8, 12, 16, 24, 32, 48; intervalo 8–128 mil); fio
esquemático 9,7222 mil (33,3333 mil em esquemáticos antigos). Cores nomeadas de fio de breadboard: blue, red,
black, yellow, green, grey, white, orange, ochre, cyan, brown, purple, pink.

### 5.4 Migrações na carga (por `fritzingVersion` do arquivo)

| Arquivo anterior a | Ação |
|---|---|
| 0.4.2 | remover instâncias de ratsnest antigas |
| 0.6.4 | reclassificar fios como trilhas conforme vista |
| 0.7.5 | converter *mystery parts* antigas |
| 0.7.13 | detectar orientação SMD obsoleta (avisar) |
| 0.8.5 | esquemáticos antigos (grade 0,3 in, prefixo `0.3.schem.`) — perguntar se converte |
| 0.9.2 | corrigir fios com pontas invertidas |
| > 1.0.0a | migração de deslocamento de rótulo de peça |

`moduleIdRef` não encontrado: (1) mapeamentos obsoletos (`generic_male*` → pin header com `form` macho;
`generic_rounded_female*` → fêmea arredondado), (2) tentar o gerador da seção 8, (3) registrar como faltante e
seguir (a instância é descartada com aviso).

### 5.5 `modelIndex` e identificadores

- `modelIndex` é inteiro único por instância no sketch; o leitor deve atualizar o próximo índice livre para
  `max+1`.
- Identificador de item por vista = `modelIndex × 10 + k`, onde $k$ distingue as camadas irmãs do mesmo item
  (*layer kin*: ex. `copper0` e `copper1` da mesma peça). O CircuitMaster deve manter `modelIndex` estável em
  *round-trip*.

### 5.6 Rótulos de instância

- Rótulo inicial = `label` da peça + menor inteiro livre (`R1`, `R2`, …). Prefixo = parte antes dos dígitos
  finais (`^(.*[^\d])(\d+)$`); rótulos só com dígitos são mantidos.
- Rótulos carregados do arquivo são respeitados e reservam o número.

### 5.7 Notas, réguas, logos

- Nota (`NoteModuleID`): `<text>` com HTML rico (Qt), `geometry` com `x`, `y`, `width`, `height`; só a vista onde foi
  criada é gravada (documento 02, 10.5).
- Plano de cobre (`GroundPlaneModuleID`): propriedade local `svg` com o SVG do fragmento (`<g id="groundplane">` ou
  `groundplane1`, viewBox em 1/30.000 in) e `fillType`; a vista PCB diz a face (`layer` + `bottom`). O desenho e a
  manufatura usam esse SVG, não o `pcb/groundplane.svg` da peça (documento 03, 6.2).
- Logo de texto: propriedades locais `logo` (texto), `shape` (SVG gerado, grupo da camada), `width`/`height` (mm);
  logo de imagem: `shape` com a imagem embutida (SVG ou raster convertido). O desenho usa `shape` com o tamanho de
  `width`/`height`.
- Novo texto de logo (versão 5): parte do SVG do modelo da peça (`<text id="label">`, padrão OCR-Fritzing-mono,
  `font-size` 10); com a fonte em $10\cdot96/72$ px, largura $W = 0{,}77\cdot w_{texto} + 4$ e altura
  $H = (ascendente + descendente) + 4$, em unidades de 1/100 in: `viewBox="0 0 W H"`, tela $W/100 \times H/100$ in,
  texto em $x = W/2$, $y$ = ascendente, e `width`/`height` locais = tela em mm.

---

## 6. PACOTES ZIP

### 6.1 `.fzz` (sketch empacotado)

ZIP plano (sem subpastas) contendo:

- exatamente **um** `*.fz` (o primeiro encontrado é usado);
- para cada peça **não core** usada (exceto variantes `0.3.schem.`): `part.<nome-original>.fzp` e
  `svg.<vista>.<arquivo>.svg` (o `image` com `/` trocado por `.`), para cada vista com imagem;
- arquivos de programa vinculados (ex.: `.ino`) com o nome original.

Carga:

1. Descompactar em pasta de trabalho do sketch.
2. Para cada `*.fzp` do pacote, ler o `moduleId`. Se a peça já existe instalada **e** todos os SVGs dela
   resolvem, usa-se a instalada; senão a peça do pacote é instalada em `contrib` local e seus SVGs são
   associados por **nome contendo** o sub-caminho do `image` (sem o prefixo da vista).
3. SVGs faltantes geram um aviso único listando os caminhos; o sketch abre mesmo assim.
4. Peças do pacote entram num bin temporário.

Leitura de nomes de entrada ZIP em codificação IBM866 (compatibilidade com arquivos antigos); gravação em UTF-8.

### 6.2 `.fzpz` (peça empacotada)

ZIP plano com `part.<x>.fzp` e `svg.<vista>.<arquivo>.svg`. Sem nenhum `part.*` → erro "prefixo obrigatório".
Ao importar um `.fzp` solto, exige-se 4 imagens (ícone, breadboard, esquemático, PCB) com caminhos prefixados
pela vista; o ícone pode reutilizar o SVG de breadboard.

### 6.3 `.fzb` / `.fzbz` (bins)

`.fzb` é um `.fz` reduzido:

```xml
<module fritzingVersion="…" icon="Core.png">
  <title>Core Parts</title>
  <instances>
    <instance moduleIdRef="__spacer__" modelIndex="3" path="Basic"> …iconView… </instance>
    <instance moduleIdRef="ResistorModuleID" modelIndex="3" path=":/resources/parts/core/resistor.fzp">
      <views><iconView layer="icon"><geometry z="-1" x="-1" y="-1"/></iconView></views>
    </instance>
  </instances>
</module>
```

- `__spacer__`: separador; `path` é o **título da seção**.
- `icon`: imagem do bin (padrão `<título>.png`); `search`: termo salvo (bin de busca).
- Ordem das instâncias = ordem de exibição; `modelIndex` irrelevante.
- `.fzbz`: ZIP com o `.fzb` e as peças não core (`part.*`, `svg.*`).
- Ordem padrão de bins do app: Search, Core Parts, My Parts, Simulator Parts, Temporary Parts, separadores,
  bins de fabricantes (`fritzing-parts/bins/more/*.fzb`), Contributed Parts.

---

## 7. INDEXADOR DE PEÇAS (REQUISITOS PARA O CIRCUITMASTER)

1. Varredura recursiva das pastas da seção 1.1; arquivo inválido é registrado e ignorado.
2. Para cada `.fzp` guardar: `moduleId`, título, label, família, propriedades normalizadas, tags, taxonomia,
   autor, url, vistas → `image` e camadas, conectores (id, nome, tipo, `<p>` por vista), barramentos,
   `spice`, `replacedby`, `obsolete` (pasta), `core`/`contrib`.
3. **Busca** (compatível): termos separados por espaço; cada termo deve casar (substring, sem diferenciar
   maiúsculas) com algum de: título, descrição, url, autor, `moduleId`, alguma tag, algum valor ou alguma chave
   de propriedade. Obsoletas excluídas por padrão.
4. Geometria de pinos é calculada **sob demanda** por vista/camada/face e cacheada por `(moduleId, vista,
   camada, face, hash do SVG)`.
5. Índice persistente (IndexedDB/SQLite WASM) invalidado por hash de conteúdo do arquivo.

---

## 8. PEÇAS DINÂMICAS E PARAMÉTRICAS

### 8.1 Mecanismo geral

- Propriedades locais da instância sobrepõem as da peça.
- Mudar uma propriedade de **família** (ex.: `pins`, `pin spacing`, `form`, `package`) é uma **troca de peça**:
  calcula-se o novo `moduleId` (gramáticas abaixo); se não existir, é gerado; a instância é substituída
  preservando posição, rótulo e conexões por `id` de conector.
- Mudar uma propriedade **não estrutural** (resistência, capacitância, cor de LED, rótulo de chip, voltagem)
  altera só a instância (SVG regenerado em memória e/ou valor SPICE).

### 8.2 Resistor (`…ResistorModuleID`)

- Propriedades locais: `resistance` (padrão da peça ou `220`), `pin spacing` (padrão `400 mil`), `tolerance`.
- Entrada aceita: `^\d{1,10}(\.\d{1,5})?[pnµumkMG]?Ω?$` (vírgula aceita como decimal); faixa
  $[0;\ 9{,}9\cdot10^9]$ Ω. Lista sugerida: 0, 1, 1,5, 2,2, 3,3, 4,7, 6,8 × décadas de 1 Ω a 680 kΩ, 1 MΩ, 1 GΩ.
- Título da instância: `"<valor> Ω Resistor"`.
- **Faixas** (SVG de breadboard e ícone): seja $R$ o valor em ohms e $S$ = $R$ em notação científica com 3
  decimais (`d.ddd e±xx`). $b_1$ = 1º dígito, $b_2$ = 2º, $b_3$ = 3º. Para 4 faixas
  $N = 10b_1 + b_2$; para `moduleId` contendo `5Band`, $N = 100b_1 + 10b_2 + b_3$. Multiplicador
  $m = \lfloor \log_{10}(R/N) \rfloor$ (truncado para inteiro; 0 se $N = 0$).
  Elementos recoloridos por `id`: `band_1_st`←$b_1$, `band_2_nd`←$b_2$, `band_3`←$b_3$,
  `band_rd_multiplier`←$m$, `gold_band`←tolerância.
- Cores de dígito: 0 `#000000`, 1 `#8a3d06`, 2 `#c40808`, 3 `#ff4d00`, 4 `#ffd500`, 5 `#00a33d`,
  6 `#0060b6`, 7 `#8210d2`, 8 `#8c8c8c`, 9 `#ffffff`, −1 (ouro) `#ad9f4e`, −2 (prata) `#c0c0c0`; índice sem cor →
  preto.
- Cores de tolerância: ±0,05% `#8c8c8c`, ±0,1% `#8210d2`, ±0,25% `#0060b6`, ±0,5% `#00a33d`, ±1% `#8a3d06`,
  ±2% `#c40808`, ±5% `#ad9f4e`, ±10% `#c0c0c0`, ±20% `#dbb477`; desconhecida → `#ad9f4e`.
- **Espaçamento → footprint** (apenas `package = THT`): `100 mil (stand-up right)` →
  `pcb/axial_stand0_2_100mil_pcb.svg`; `100 mil (stand-up left)` → `pcb/axial_stand1_2_100mil_pcb.svg`;
  `200/300/400/500/600/800 mil` → `pcb/axial_lay_2_<n>mil_pcb.svg`. A troca mantém conexões.

### 8.3 Peças de propriedades editáveis

Tabela própria do CircuitMaster (equivalente funcional), por propriedade:
`name`, `symbol` (unidade: F, Ω, H, V, A, Hz…), `minValue`, `maxValue`, `defaultValue`, `numeric`,
`editable`, lista de valores sugeridos (com `adjunct` opcional por item) e a lista de **sufixos de
`moduleId`** a que se aplica. Para cada peça cujo `moduleId` termina (sem diferenciar maiúsculas) com um sufixo:

- valor inicial = propriedade local, senão propriedade da peça, senão `defaultValue` formatado;
- numéricos são exibidos com prefixo SI e símbolo; edição validada contra $[min, max]$.
- o Inspector só mostra o editor de uma definição para uma propriedade que a peça declara no `.fzp` (ou que a
  instância tem como propriedade local): as capacitâncias por passo, por exemplo, aparecem nos capacitores de
  filme que as declaram e não no eletrolítico, embora o sufixo `CapacitorModuleID` case com os dois.

Propriedades cobertas no app de referência (61 definições): capacitâncias por passo (5/7,5/10/15/22,5/27,5/
37,5 mm), `capacitance`, `inductance`, `resistance`, `maximum resistance`, `power`, `voltage`, `current`,
`tolerance`, `color`, `frequency`, `amplitude`, `offset voltage`, `phase`, `duty cycle`, `period`, `rise time`,
`fall time`, `pulse width`, `pulsed voltage`, `initial voltage`, `delay time`, `number of pulses`,
`breakdown voltage`, `internal resistance`, `input/output resistance/inductance`, `damping factor`,
`luminance`, `dark resistance @0.01lx`, `light resistance @100lx`, `distance to obstacle`, `knob status`,
`thermistor type`, canais e escalas de osciloscópio (`chN volts/div`, `chN offset`, `time/div`,
`horizontal position`). Sufixos: `CapacitorModuleID`, `InductorModuleID`, `PotentiometerModuleID`,
`PhotocellModuleID`, `ThermistorModuleID`, `OscilloscopeModuleID`, fontes `Sine/Triangular/Sawtooth/
PulsePowerSupplyModuleID`, `VariableCapacitorModuleID`, transformadores e trimpots de fabricantes.

**Prefixos SI** (parse e formatação): `p`=1e−12, `n`=1e−9, `µ`/`u`=1e−6, `m`=1e−3, (vazio)=1, `k`=1e3,
`M`=1e6, `G`=1e9, `T`=1e12. Parse: trocar `,` por `.`, remover o símbolo final, remover **um** prefixo final
(sensível a maiúsculas), aparar, converter. Formatação padrão: primeiro prefixo (de `p` a `T`) com
$|q| < 100\cdot 10^{k}$; para capacitâncias, o primeiro prefixo cuja mantissa **arredondada** seja < 1000
(evita "1000n" para 1 µF).

### 8.4 Pin headers genéricos

**Gramática do `moduleId`**: `generic_<forma>_pin_header_<N>_<passo>[_hs_<furo>_<anel>]`

- `<forma>` ∈ `female`, `female_alternating`, `rounded_female`, `rounded_female_alternating`,
  `double_row_female`, `double_row_rounded_female`, `single_row_smd_female`, `double_row_smd_female`,
  `single_row_smd_rounded_female`, `double_row_smd_rounded_female`, `male`, `male_alternating`,
  `double_row_male`, `single_row_smd_male`, `double_row_smd_male`, `shrouded`, `longpad`,
  `longpad_alternating`, `molex`.
- `<passo>` (chave → rótulo): `1mm` (0.03937in), `1.25mm` (0.04921in), `50mil` (0.05in), `1.5mm` (0.0591in),
  `2mm` (0.07874in), `2.5mm` (0.09843in), `100mil` (0.1in), `150mil` (0.15in), `0.156in` (0.156in),
  `200mil` (0.2in). *Shrouded* sempre 0.1in.
- $N$: 1–64; dupla fileira e *shrouded* exigem $N$ par (ímpar é arredondado para cima); *shrouded* $N \ge 6$.
- Conectores: `connector{i}` com nome `pin{i+1}`, tipo `male`, $i = 0..N-1$; `<p>` em `breadboard`
  (`terminalId=connector{i}terminal`), `schematic` (idem), `copper0` e `copper1` (SMD sem `copper0`).
- Propriedades: `family=Pin Header`, `Pins`, `Form` (`♀ (female)`, `♀ (female rounded)`, `♂ (male)`,
  `♂ (shrouded male)`, `long pad`, `molex`), `Pin Spacing`, `Row` (single/double), `package` (THT/SMD),
  `Position` (`alternating` ou vazio), `hole size`. Rótulo `J`.
- Imagens: `breadboard/generic_<formaBread>_pin_header_<N>_100mil_bread.svg`,
  `schematic/generic_<female|male>_pin_header_<N>_100mil_schem.svg`, `pcb/<jumper|nsjumper|…>_<N>_<passo>_pcb.svg`.

**Breadboard** (todas as formas exceto *shrouded*; **dupla fileira também é desenhada numa única fileira de
N pinos** no 1.0.8): tela $0{,}1N \times 0{,}1$ in, viewBox $1000N \times 1000$. Pino $i$: caixa de lado
≈ 387,7 u centrada em $(500 + 1000i,\ 500)$ u; terminal centrado no mesmo ponto ⇒ na cena
$(0{,}05 + 0{,}1i;\ 0{,}05)$ in. Fêmeas têm fundo `#404040`.

**Esquemático** (padrão "10thin", grade 0,1 in, viewBox em pt):
- fileira simples: tela $0{,}2 \times 0{,}1N$ in; pino $i$ = traço horizontal de $x = 0{,}35$ a $7{,}47$ pt em
  $y = 3{,}6 + 7{,}2i$ pt; terminal na ponta esquerda: centro $(0;\ 3{,}608 + 7{,}2i)$ pt ⇒
  $(0;\ 0{,}0501 + 0{,}1i)$ in no macho; no **fêmea** o centro fica em $x = 0{,}021$ pt (medido nos sketches de
  exemplo: 29 + 20 + 5 + 4 + 2 + 2 pontas coincidem só com esse deslocamento);
- dupla fileira: tela $0{,}5 \times 0{,}1(N/2)$ in; linha $j$ tem `connector{2j}` à esquerda (terminal em
  $x \approx 0$) e `connector{2j+1}` à direita (terminal em $x \approx 36{,}02$ pt = 0,5 in);
- esquemáticos antigos (`0.3.schem.`): largura 0,87 in e passo de 7,5 mm convertidos.

**PCB THT (jumper/nsjumper)**, unidades em mil:
- largura base $L_0 = 2\cdot15 + 2\cdot10 + 2\cdot7{,}5 + 2\cdot27{,}5 + 20 = 140$; centro $c = 70$;
- fileira simples: pino $i$ em $(70 \pm a,\ 70 + i\,p)$, $p$ = passo em mil, $a = 5$ para *alternating*
  (pares $+a$, ímpares $-a$), senão 0; tela $140 \times (140 + (N-1)p)$;
- dupla fileira: coluna esquerda `connector0..N/2−1` em $(70,\ 70 + i\,p)$; coluna direita
  `connector{N/2}..N−1` em $(170,\ 70 + (N-1-i)\,p)$ (sentido anti-horário); tela
  $240 \times (140 + (N/2 - 1)p)$;
- anel: círculo $r = 29$, traço 20 ⇒ cobre de raio 19 a 39 mil, furo 38 mil; com `jumper` (não `nsjumper`)
  o pino 0 ganha quadrado `id=square` de lado 58 mil, traço 20, centrado no pino;
- serigrafia: retângulo com traço 10 mil a 20 mil da borda e chanfro no canto do pino 0.

**PCB SMD**: tela $(152{,}756 + (N-1)p) \times 283{,}465$ mil (simples) ou $(152{,}756 + (N/2-1)p) \times 393{,}7$
(dupla); pads retangulares $51{,}181 \times 141{,}823$ mil começando em $x = 51{,}181$; simples: pares em
$y = 0$, ímpares em $y = 141{,}823$; dupla: fileira superior $y = 0$ com `connector{N−1−i}`, inferior
$y = 251{,}969$ com `connector{i}`; só `copper1`.

**Shrouded** (passo 0,1 in, unidades 1/10.000 in na PCB): PCB $0{,}3542 \times (0{,}3952 + 0{,}1(N-2)/2)$ in;
círculos $r = 285$, traço 170, colunas $x = 1221$ e $2221$, $y = 1976 + 1000k$ com a mesma numeração
anti-horária. Breadboard: altura 0,3484 in, largura $0{,}4 + 0{,}1(N-2)/2$ in.

**Long pad** e **Molex**: footprints em mm×25,4 (viewBox em mm): long pad largura 0,148 in, pino $i$ em
$(1{,}8796;\ 1{,}3716 + 25{,}4\,p_{in} i)$ mm, altura $0{,}108 + (N-1)p_{in}$ in; *alternating* largura 0,13 in
com deslocamento de 0,254 mm nos ímpares; Molex largura 0,225 in, pino em $(3{,}1115;\ 1{,}3335 + 25{,}4\,p_{in} i)$
mm, altura $0{,}105 + (N-1)p_{in}$ in, quadrado no pino 0.

### 8.5 CIs genéricos (DIP/SIP) e *mystery parts*

**Gramáticas**:
`generic_ic_dip_<N>_<passo>` ($N$ par, 4–128; passo `300mil|400mil|600mil|900mil`),
`generic_sip_<N>_<passo>` (2–128), `mystery_part_<N>` / `mystery_part_dip_<N>_<passo>` (SIP/DIP),
`generic_ic_dip_v2_*` (versão 2 do símbolo). Sufixo `_hs_<furo>_<anel>` opcional.
Propriedades: `family=Generic IC`, `package` (`DIP (Dual Inline) [THT]` / SIP), `pins`, `pin spacing`,
`chip label` (padrão `IC`; *mystery*: `?`), `editable pin labels=true`, `hole size`. Conectores como 8.4.
Imagens: `breadboard/generic_ic_dip_<N>_<passo>_bread.svg`, `schematic/generic_ic_dip_<N>_schem.svg`,
`pcb/dip_<N>_<passo>_pcb.svg`.

**Breadboard DIP** (unidades 1/100 in; $s$ = passo em 1/100 in, ex. 30): tela
$W = 0{,}1(N/2)$ in, $H = 0{,}03 + s/100$ in. Fileira inferior: `connector{k}`, $k = 0..N/2-1$, terminal em
$(5 + 10k;\ 1{,}5 + s)$ u. Fileira superior da esquerda para a direita: `connector{N−1}`, …, `connector{N/2}`,
terminal em $(5 + 10j;\ 1{,}5)$ u. (Para DIP-8 300 mil: tela 0,4 × 0,33 in.) Rótulo do chip (`id=label`) em
fonte OCR.

**Breadboard SIP**: tela $0{,}1N \times 0{,}3$ in; terminais em $(5 + 10k;\ 28{,}5)$ u.

**Esquemático DIP** (grade 0,1 in = 100 mil, viewBox em mil): retângulo com pinos de 200 mil nos dois lados.
- Esquerda: `connector{i}`, $i = 0..N/2-1$, de cima para baixo em $y = 100 + 100i$; terminal em $x = 0$.
- Direita: `connector{N−1−i}` na mesma altura; terminal em $x = W$.
- Altura $H = 100 + 100 + 100\cdot\max(N/2 - 1,\ \lceil t\cdot h_t / 100\rceil)$ mil ($t$ títulos, $h_t$
  = 48,6 mil).
- Largura $W = 100\lceil (w_L + w_R + w_T + 2\cdot 19{,}44)/100 \rceil + 400$ mil, onde $w_L$, $w_R$ = maior
  largura de rótulo de pino (os dois lados igualados ao maior) e $w_T$ = largura do título (`IC`). **Regra
  calibrada empiricamente** com a única amostra disponível (`generic_ic_dip_16_300mil` → $W = 900$ mil): os
  rótulos medidos são os **nomes dos conectores** (`pin1` … `pinN`, ou os nomes locais da instância), com os
  avanços da Droid Sans a 3,5 pt, escalados por 96/72 (métrica em px de tela lida como pt) e convertidos com
  × 1000/72. Outras hipóteses (rótulos numéricos, fonte de 0,882 mm, sem escala de tela) não reproduzem a
  amostra. Revalidar quando houver sketches com DIPs de outros tamanhos.
- SIP usa o símbolo de *mystery part* (pinos de um lado).

**PCB DIP** (mil): $W = 120 + s_{mil}$, $H = 100(N/2) + 20$. Coluna esquerda `connector{i}` em
$(60;\ 60 + 100i)$, coluna direita `connector{N−1−i}` em $(W - 60;\ 60 + 100i)$; círculos $r = 27{,}5$,
traço 20; quadrado $55\times55$ em $(32{,}5;\ 32{,}5)$ no pino 0; serigrafia com traço 10 e entalhe central
de 100 mil no topo. SIP/mystery usam o footprint de pin header (8.4) sem quadrado, passo 100 mil.

### 8.6 *Screw terminal*

`screw_terminal_<N>_<passo>` com $N$ = 2–20 e passo `3.5mm`, `5.0mm`, `100mil`, `200mil`, `300mil`.
Breadboard: tela $0{,}1N \times 0{,}17$ in (viewBox $100N \times 170$). Esquemático: grade 0,1 in, pino de
0,2 in, $N$ pinos verticais. PCB: footprint de fileira simples com o passo dado. Propriedades `Pins`,
`Pin Spacing`, `hole size`.

### 8.7 Perfboard e stripboard

**Gramática**: `<X>.<Y>PerfboardModuleID`, `<X>.<Y>StripboardModuleID` (antigo, tiras horizontais),
`<X>.<Y>Stripboard2ModuleID` (atual); $X, Y \in [3, 199]$ (aviso de desempenho acima de 2.000 furos).
Só existem na breadboard (camada `breadboardbreadboard` nas três vistas, como breadboards).

- Conector do furo $(j_x, i_y)$: `id = connector{1000·i_y + j_x}`, `name = "<j_x>.<i_y>"`, tipo `female`.
- SVG: tela $(X/10 + 0{,}1) \times (Y/10 + 0{,}1)$ in, viewBox $(100X + 100) \times (100Y + 100)$ mil;
  furo $(j_x, i_y)$ com centro $(100 + 100j_x;\ 100 + 100i_y)$, anel $r = 27{,}5$, traço 20.
- `ignoreTerminalPoints` ⇒ terminal no centro do anel.

**Stripboard**: entre cada furo e o vizinho à direita existe um segmento de tira "h" e, com o de baixo, um
segmento "v". Propriedades locais:
- `layout` ∈ `horizontal strips`, `vertical strips`, `no strips` (padrão vertical; o modelo antigo força
  horizontal);
- `buses` = lista separada por espaço dos segmentos **cortados**, cada um `"<x>.<y>h"` (corte entre $(x,y)$ e
  $(x+1,y)$) ou `"<x>.<y>v"` (entre $(x,y)$ e $(x,y+1)$).

Conectividade: componentes conexos do grafo de furos pelos segmentos **não cortados**; cada componente com mais
de um furo vira um barramento dinâmico. Ao aumentar a placa, os segmentos novos são cortados conforme o layout
(layout vertical corta os "h" novos; horizontal corta os "v" novos; "no strips" corta ambos).

### 8.8 Breadboards

Peças estáticas de `fritzing-parts` (ex.: `Breadboard-RSR03MB102-ModuleID`, 830 conectores fêmea, barramentos
`bus1A-E`, `bus1F-J`, trilhos de alimentação). Características:

- `ignoreTerminalPoints="true"`;
- declaram `schematicView` e `pcbView` com a camada `breadboardbreadboard`, que **não existe** nessas vistas ⇒ a
  breadboard é instanciada **invisível** no esquemático e na PCB, apenas para que as conexões feitas por ela
  existam no grafo de cada vista (documento 02).

### 8.9 Símbolos de alimentação, terra e *net labels*

- **Net label** (`…NetLabelModuleID`, `PowerLabelModuleID`): todos os conectores de net labels **na mesma vista**
  com o mesmo rótulo (propriedade local `label`, aparada) formam um único nó. Para net labels do tipo
  `voltage reference`, o rótulo efetivo é o valor numérico da voltagem.
- **Símbolo de alimentação** (`…PowerModuleID`, `JustPowerModuleID`, `dcpower`): propriedade `voltage`
  (sugestões 0, 3,3, 5, 12; padrão de voltagem de fonte 5 V). Todos os conectores de símbolos com a **mesma
  voltagem** (chave = $\mathrm{trunc}(V\cdot10^6)$, truncado em direção a zero) formam um nó; um conector chamado `GND` num símbolo de
  alimentação vale 0 V.
- **Terra** (`GroundModuleID`): todos os conectores "aterrados" (nome `gnd`, `vss` ou `ground`, sem diferenciar
  maiúsculas) de símbolos formam um nó.
- Esses nós implícitos atuam como **barramentos virtuais** que atravessam a vista inteira (documento 02).
- *Net label* tem estilos `legacy` (versão de peça ≤ 4), `outside` ou `connector`, e alinhamento `left`/`right`;
  o SVG é regenerado com o texto, **por instância**:
  - rótulo = propriedade local `label`, senão a da peça, senão `net label`; direção = local `direction`, senão a da
    peça, senão `left` se o `moduleId` contém `left`, senão `right`; estilo = `legacy` se a versão da peça ≤ 4,
    senão local `style` (`outside`→`left`, `connector`→`right`, vazio→`left`);
  - divisor $d = 1$ com o prefixo de esquemático antigo no `moduleId`, senão $3$; fonte $F = 200/d$, altura
    $H = 300/d$, seta $A = H/2$, traço $s = 10/d$, linha de base $220/d$ (legacy) ou $228/d$;
  - largura do texto: $e = \sum \text{avanço}/\text{UPM}$ (caractere sem métrica conta meio *em*); legacy (Droid
    Sans) $t = e \cdot F \cdot 1{,}0392$; demais (Noto Sans) $t = e \cdot F \cdot \frac{4}{3} \cdot 0{,}77$. A referência mede o
    texto com a métrica da fonte no dpi lógico da tela de quem salvou, então o fator legacy foi **calibrado** nos
    net labels dos sketches de exemplo ($t/e$ entre 69,2 e 69,4 para $F = 66{,}7$);
  - legacy: $W = t + A + 20/d$, texto em $x = 20/d + (A$ se a seta aponta para a esquerda$)$, âncora `start`;
    demais: $p = 50/d$, $W = \lceil (t - p)/50 \rceil \cdot 50 + A + 2p$, faixa de texto
    $[p + A_{esq},\ W - p - A_{dir}]$, alinhamento `left` ⇒ início da faixa com âncora `start`, `right` ⇒ fim com
    âncora `end`;
  - tela `W/1000 in × H/1000 in`, `viewBox 0 0 W H`; polígono branco de traço preto $s$:
    à direita $(W - s/2, H/2), (W - A, s/2), (s/2, s/2), (s/2, H - s/2), (W - A, H - s/2)$, pino
    `connector0pin` $(W - A - 0{,}1, 0, A, H)$ e terminal `connector0terminal` $0{,}1 \times 0{,}1$ em $(W, H/2)$;
    à esquerda o espelho: $(s/2, H/2), (A, s/2), (W - s/2, s/2), (W - s/2, H - s/2), (A, H - s/2)$, pino
    $(0, 0, A, H)$, terminal em $(0, H/2)$;
  - o SVG gerado não depende da orientação; com a instância espelhada ou de cabeça para baixo, o texto segue o
    endireitamento do esquemático (§2.4).
- Símbolo de alimentação e *power label* (`type = voltage reference`): o texto do elemento `label` do SVG é
  trocado por "$v$`V`", com $v = \mathrm{trunc}(V \cdot 1000)/1000$ (voltagem local ou da peça).

### 8.10 Placas (PCB)

- **Redimensionável** (`RectanglePCBModuleID`, `TwoLayerRectanglePCBModuleID`, elipse, retângulo arredondado):
  propriedades locais `width` e `height` em **mm**; propriedade `layers` = 1 ou 2. SVG gerado com
  `width="<w>mm" height="<h>mm" viewBox="0 0 w h"`; um único elemento folha: retângulo de
  $(w - sw) \times (h - sw)$ ou elipse centrada com raios $((w - sw)/2, (h - sw)/2)$, $sw$ = largura de traço do
  modelo. Camadas `board` (sticky), `silkscreen`, `silkscreen0`.
- **Contorno da placa**: dentro do grupo `board` (ou da raiz), se houver uma única folha ela é o contorno; senão
  é a folha de **maior área de AABB**. Ela recebe um id mágico reservado usado pelo Gerber (documento 03).
- **Formato customizado**: SVG ou imagem do usuário carregada como contorno (mesma regra de folha).
- **Shields** (Arduino etc.): placas fixas de `fritzing-parts`.

### 8.11 Furos, vias e pads

- `hole size` = `"<diâmetro>,<anel>"` (ex. `0.4mm,0.3mm`).
- **Furo/Via** SVG gerado (tela em polegadas, viewBox em mil), com margem $o = 2\,px/90$ in:
  lado $= d + 2a + 2o$; círculo de cobre centrado com raio $d/2 + a/2$ e traço $a$; furo como círculo preto de
  raio $d/2$ marcado `drill="0"`; $d = 0$ ⇒ disco cheio de raio $a$.
  Na via o conector tem raio $d/2 + a/2$ e traço $a$ nas duas faces.
- **Variantes de furo de peças** (`…_hs_<d>_<a>`): `moduleId` derivado; o SVG de PCB é reescrito: todo
  `<circle id="connectorNpin">` recebe $r = (d + a)/2$ e `stroke-width` $= a$ (em unidades do viewBox, com
  $dpi = v_w/W_{in}$); o `<rect id="square">` é redimensionado para lado $2r$ mantendo o centro.
- Tabela padrão (equivalente funcional): via padrão 0,4 mm / anel 0,3 mm; via caseira 0,9 / 0,508; furos de
  parafuso M2 2,2, M3 3,2 (padrão de furo), M4 4,2 (anel 0); furos de pin header/screw terminal/mystery
  0,7 / 1,0 (padrão) / 1,1 / 1,5 mm com anel 0,508 mm; limites: anel 0,002–10 in, furo 0,002–20 in.
- **Pad** (`PadModuleID`, `Copper0PadModuleID`): retângulo de cobre SMD com `width`/`height` locais (mm; padrão
  28 × 32 px) e opção `connect` (`center`, `north`, `south`, `east`, `west`). SVG gerado em px de cena com margem de
  4 px: tela $(w + 4) \times (h + 4)$, grupo da camada (`copper0` no `Copper0PadModuleID`, senão `copper1`),
  `<rect id="connector0pad" x="2" y="2">` preenchido na cor da camada e `connector0terminal` no centro ou na faixa
  de 1 px (ou um terço do lado) da borda escolhida.
- **Blocker** (`Copper0BlockerModuleID`, `Copper1BlockerModuleID`): área de exclusão de cobre (keepout) com o mesmo
  SVG do pad, mas `rect id="zzzpad"` vazado (`fill-opacity` 0, traço de 4 px em `#A26A00` embaixo ou `#aF8B33` em
  cima) e um X de duas linhas de 1 px. Só existe na PCB; não vai para Gerber, DRC nem autorouter, apenas bloqueia o
  preenchimento de cobre (documento 03, 6.3).

### 8.12 Outras

- LED colorido: propriedade `color` recolore o SVG de breadboard; LED RGB/superflux idem.
- Capacitores/cristais/zener/indutores/potenciômetros: propriedades editáveis (8.3) + valor SPICE.
- Moldura esquemática (`SchematicFrameModuleID`): campos de título editáveis gerados num SVG.
- Logos: texto (`logo`), altura, fonte; imagem (SVG/PNG/JPG convertido para camada de serigrafia ou cobre).
- Régua: centímetros/polegadas.

---

## 8A. EDITOR DE PEÇAS E BINS DO USUÁRIO

### 8A.1 Quando abre

"Editar (editor de peças)" (menu da peça e menu Peça) abre o editor sobre a peça selecionada quando ela é do tipo
peça comum: não abre para fios, placas, breadboards/perfboards/stripboards, logos, planos de cobre, furos, vias,
pads (`…PadModuleID`) nem moldura de esquemático. O editor trabalha numa **cópia**: o documento `.fzp` da peça e o
SVG de cada vista (protoboard, esquemático, PCB e ícone). Peças geradas (CIs, headers, *mystery parts*) entram com o
`.fzp` gerado. Nada muda na peça original.

### 8A.2 Metadados

Título, autor, descrição, rótulo (prefixo do título das instâncias, ex.: `R`), URL, versão, data, tags (lista
separada por vírgulas) e a tabela de propriedades (`<property name>`), com `family` e `variant`; linhas podem ser
acrescentadas e apagadas. Cada campo escreve o elemento correspondente do `.fzp` (§2).

### 8A.3 Conectores

Lista com id (`connectorN`), nome, descrição e tipo (`male`, `female`, `pad`). Aumentar a contagem acrescenta
conectores com o próximo número livre $N$ (maior número achado nos ids e nos nomes, +1): nome e descrição
`pin N`, mesmo tipo e mesmas vistas/camadas do primeiro conector, `svgId = connectorNpin` em cada `<p>`, sem
`terminalId` nem `legId`. Diminuir apaga os de maior número (e os ids que eles tinham nos SVGs).

### 8A.4 Vistas: elemento e terminal de cada conector

Cada aba de vista mostra o SVG ampliado e a lista de conectores. Com um conector escolhido, um clique num
elemento do desenho o **atribui**: o elemento passa a ter o id `svgId` do `<p>` do conector naquela vista (o
elemento que tinha esse id perde o atributo); sem `<p>` na vista, ele é criado com `svgId = connectorNpin` na
camada da vista (na PCB, `copper0` e, se a peça tem `copper1`, também `copper1`; o elemento gêmeo da outra
camada de cobre — mesmo centro a menos de 0,5 unidade — recebe o mesmo id). Clicar num elemento já atribuído
escolhe o conector dele. Elementos atribuídos aparecem realçados; conectores sem elemento na vista ficam marcados
na lista.

**Ponto terminal**: centro (padrão), o meio de uma borda (N, S, L, O) da caixa do elemento ou qualquer ponto dela,
arrastando a marca do terminal no desenho (a marca não sai da caixa do elemento; com Shift o arraste segue só o
eixo em que o movimento começou). No centro, o `<p>` fica sem `terminalId`. Fora do centro, o id é o `svgId` sem
o sufixo `pin`/`pad`, mais `terminal`; um retângulo invisível (`fill` e `stroke` `none`, lado de 1/500 da caixa)
com esse id é posto no ponto, logo depois do elemento do conector, e o `<p>` ganha `terminalId`.

"Carregar SVG…" troca o SVG da vista por um arquivo escolhido; atribuições cujos ids não existem no novo
desenho aparecem como pendentes. O SVG mostrado é saneado (sem `script`, `foreignObject`, atributos `on*` e
links `javascript:`), como todo SVG vindo de arquivo.

### 8A.5 Gravar

Gravar cria sempre uma **peça nova**: `moduleId = <prefixo>_<guid de 32 hex>_1`, com o prefixo vindo do título
(letras, números e `_`); se a peça não tem `variant` ou a família já tem a mesma, ela vira `variant N` com o
menor $N$ livre na família (o editor do Fritzing também dá `variant N` à peça sem `variant`). Cada vista grava o SVG em `<vista>/<moduleId>_<vista>.svg` (o `image` das `<layers>`), e o pacote é o
`.fzpz` da §6.2: `part.<moduleId>.fzp` e `svg.<vista>.<moduleId>_<vista>.svg`. A peça entra no acervo da sessão
como as de pacote, vai para **Meus itens**, pode substituir a instância editada (troca de peça, doc 02 §5) e o
`.fzpz` pode ser baixado.

### 8A.6 Bins do usuário

Além do **Meus itens**, o usuário cria bins com nome; "Adicionar ao bin" lista todos (e "Novo bin…"). Cada bin
pode ser renomeado, apagado e exportado como `.fzbz` (§6.3). Abrir um `.fzbz`/`.fzb` cria um bin com o título do
arquivo (sem título: o nome do arquivo); abrir um `.fzpz` põe a peça em Meus itens. Os bins e os arquivos das
peças que vieram de pacotes ou do editor ficam guardados no navegador e voltam na próxima sessão.

### 8A.7 Histórico de revisões e registro ao gravar

O `.fzp` pode levar, como filhos da raiz, elementos `<history date="AAAA-MM-DD" author="…" mode="…">texto</history>`,
um por revisão da peça (versões do Fritzing que não os conhecem simplesmente os ignoram). `mode` é a insistência
com que a revisão é oferecida a quem ainda usa a peça antiga: `required` (aplicada sem perguntar), `recommended`
(perguntada a cada carga) ou `optional` (o padrão, perguntada quando faz diferença); `silent`, `forced` e `ask`
são grafias antigas dos mesmos três e são aceitas na leitura.

- **Leitura**: as entradas em ordem de data, da mais antiga para a mais nova (data vazia ou inválida primeiro;
  empate mantém a ordem do arquivo). Peça sem `<history>` mas com `<date>` ou `<author>` ganha uma entrada
  sintética com esses dois valores, modo `optional` e texto vazio.
- **Escrita**: as entradas existentes saem e as novas entram ordenadas logo depois de `<date>` (na falta dele,
  depois de `<author>`, `<title>` ou `<version>`; sem nenhum, no começo); entrada sem texto não tem conteúdo; a
  mais nova é copiada em `<author>` e `<date>`.
- **Registro ao gravar**: gravar ou baixar o `.fzpz` de uma peça com alterações ainda não gravadas abre antes o
  pedido de registro da revisão, com data (hoje; se já existe entrada com a data de hoje, é ela que se edita, sem
  duplicar), autor (o `<author>` da peça, ou o da entrada de hoje), modo (`optional`) e o texto do que mudou, e uma
  caixa **desmarcada** "subir a versão para X". Botões: "Registrar e gravar" (só com texto), "Gravar sem registro"
  e "Cancelar" (nada é gravado). A caixa de versão vale nos dois jeitos de gravar e troca o texto de `<version>`
  (criando o elemento se faltar). Peça sem alterações grava sem perguntar. A aba Metadados mostra o histórico.
- **Próxima versão**: vazia → `1`; termina em número → esse número + 1 (`4` → `5`, `1.1` → `1.2`, `1.9` →
  `1.10`, `v2` → `v3`); sem número no fim, fica como está.

## 9. CONSTANTES

| Constante | Valor |
|---|---|
| px por polegada | 90 |
| unidades por polegada em footprints gerados | 1000 |
| incremento de z | 1e−5 |
| base de z da camada $i$ | $1{,}5 + i$ |
| tolerância de quase-quadrado | $0{,}9 \le w/h \le 1{,}1$ |
| epsilon de dimensão nula | 0,001 px |
| largura padrão de trilha PCB | 24 mil |
| largura de fio esquemático | 9,7222 mil |
| largura padrão de perna (fallback) | 0,029 u |
| cor padrão de perna | `#8C8C8C` |
| multiplicador de id de item | 10 |
| índice de corte de stripboard | `connector{1000·y + x}` |

---

## 10. PLANO DE TESTES DE OURO (ACEITE DE COMPATIBILIDADE)

1. **Ancoragem**: para cada um dos 124 sketches de `fritzing-app/sketches` (98 não obsoletos para o esquemático
   sem migração de esquemáticos antigos), para cada fio com
   `<connect>` em uma ponta, calcular o ponto terminal do conector alvo (seções 3.5–3.8) e comparar com a ponta
   do fio na cena. Tolerância ≤ 0,01 px. Isto valida simultaneamente normalização de SVG, CTM, viewBox,
   terminais, pernas e transformações de instância. Linha de base já medida com um protótipo nos 98 sketches
   não obsoletos: breadboard 2.070/2.071 e esquemático 2.085/2.129 (fios com `wireFlags & 64` na breadboard e
   `wireFlags & 128` no esquemático, ligados a peças não geradas). A implementação do CircuitMaster deve atingir
   no mínimo esse resultado e fechar os 37 casos de net label com o gerador da seção 8.9. Resultado da
   implementação (`tests/anchors.test.ts`, incluindo peças geradas e ignorando instâncias sem vistas — 5.2):
   breadboard 2.100/2.101 e esquemático 2.448/2.492 (2 a ≤ 0,5 px, 37 net labels, 5 geometrias obsoletas). Com o
   gerador de net label da seção 8.9: esquemático **2.466 exatos, 21 a ≤ 0,5 px** (net labels legacy, cuja largura
   depende do dpi de quem salvou) e 5 falhas (pushbutton e fotoresistor girados).
2. **Geradores**: para todo `moduleId` gerado encontrado nos sketches
   (`generic_female_pin_header_{1,2,3,4,5,6,14}_100mil`, `generic_male_pin_header_{6,8,10}_100mil`,
   `generic_double_row_female_pin_header_6_100mil`, `generic_ic_dip_16_300mil`, `15.20Stripboard2ModuleID`),
   as pontas de fio conectadas devem coincidir com os terminais gerados (127 pontas nos sketches não obsoletos).
3. **Round-trip**: carregar e salvar cada `.fz`; diferença semântica nula (mesmos `modelIndex`, propriedades,
   conexões recíprocas, geometria com 6 algarismos significativos).
4. **Índice**: 2.619 `.fzp` carregados sem erro; contagens do censo (2.1) reproduzidas.
5. **Netlist**: ver documento 02, seção 9.

---

## 11. PEGADINHAS CONHECIDAS (COMPORTAMENTO A REPRODUZIR)

1. `layerId` desconhecidos são ignorados silenciosamente.
2. Chaves de propriedade são minúsculas; o atributo `name` original não é preservado na indexação.
3. `IgnoreTerminalPoints` aparece com maiúscula em 2 peças — comparação sem diferenciar maiúsculas.
4. Duplicação de `<circle id="connectorNpin">` em pin headers de dupla fileira gerados (o gerador de referência
   escreve a coluna esquerda duas vezes); o CircuitMaster gera uma vez — mesmo resultado geométrico.
5. Pin header de dupla fileira aparece em fileira única na breadboard.
6. Um conector com caixa nula numa camada simplesmente não existe naquela camada (ex.: SMD sem `copper0`).
7. O nome `silkscreen` é a face de cima; `groundplane` é a de baixo.
8. Fios de breadboard são salvos com geometria nas três vistas.
9. Breadboards existem invisíveis no esquemático e na PCB.
10. Rotação sempre em torno do centro da tela, nunca da origem.
