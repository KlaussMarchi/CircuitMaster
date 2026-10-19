# 04 — SIMULAÇÃO SPICE

Especificação funcional *clean room* de como os metadados `<spice>` das peças são combinados com a netlist para
gerar o *deck* do ngspice, como a simulação é executada (ponto de operação e transitório interativo) e como os
resultados atualizam o estado visual das peças (fumaça, brilho de LED, multímetro, osciloscópio, motor), conforme
o Fritzing 1.0.8 + ngspice-47, e como o CircuitMaster deve reproduzir isso com ngspice em WebAssembly.

Pré-requisitos: documentos 01 (propriedades, prefixos SI) e 02 (nets).

---

## 1. METADADOS SPICE DA PEÇA

```xml
<spice>
  <line>R{instanceTitle} {net connector0} {net connector1} {resistance}</line>
  <model>.MODEL LED_GENERIC D (IS=93.1P RS=42M N=4.61 BV=9 IBV=10U CJO=2.97P VJ=.75 M=.333 TT=4.32U)</model>
</spice>
```

- Todas as `<line>` são concatenadas em ordem, cada uma seguida de `\n` → **modelo de linha** da peça.
- Todas as `<model>` são concatenadas em ordem com `\n` → **bloco de modelos** da peça (`.MODEL`, `.SUBCKT … .ENDS`,
  comentários `*`).
- Acervo atual: 178 peças com `<spice>`, 271 linhas e 103 linhas de modelo. Letras de dispositivo usadas na
  primeira coluna: R 120, V 45, D 26, X 25, C 22, M 14, Q 8, L 5, A 1 (XSPICE `ilimit` da fonte de bancada),
  comentários e uma diretiva `.model` em linha.
- Tokens usados: `{net <connectorId>}` (669), `{instanceTitle}` (361) e propriedades (`maximum resistance`,
  `knob status`, `internal resistance`, `voltage`, `capacitance`, `period`, `delay time`, `resistance`, …).
- Expressões do ngspice entre chaves aninhadas são permitidas, ex.:
  `DC {{distance to obstacle}<5?3.3*({distance to obstacle}/5):-1*ln({distance to obstacle}/100)+0.5}` — os
  tokens internos são substituídos e a chave externa fica para o ngspice avaliar.

Símbolos de alimentação, terra e net labels **não têm SPICE**: só unem nets. Um símbolo "5 V" no esquemático não
cria fonte; é preciso uma peça fonte (bateria, fonte DC, fonte de bancada).

---

## 2. CIRCUITO A SIMULAR

1. Nets: calculadas **na vista esquemática** com todas as arestas (documento 02, $\mathcal{N}$), incluindo
   símbolos, **incluindo nets unitárias**, apenas a face inferior para conectores de PCB irrelevantes aqui, e com
   a regra de superparte: conectores de subpartes esquemáticas são substituídos pelos da peça principal (mesmo
   `connectorId`), que é quem tem o `<spice>`.
2. Peças simuladas: peças com `<spice>` não vazio que tenham **algum conector numa net com 2 ou mais membros**.
   Peças isoladas ficam fora (e são acinzentadas, seção 8.1).
3. Nets são numeradas pela posição na lista após mover o terra para a posição 0.

### 2.1 Escolha do terra (nó 0)

Em ordem:

1. Entre as nets com ≥ 2 membros, a **última** encontrada que contém um conector aterrado (nome `gnd`, `vss` ou
   `ground`, sem diferenciar maiúsculas). (A busca não para no primeiro achado — reproduzir.)
2. Senão, a primeira net com ≥ 2 membros que contém um conector chamado `-`.
3. Senão, a primeira net (de qualquer tamanho) com um conector `-`.
4. Senão, a primeira net da lista (aviso: terra arbitrário).

A net escolhida vai para o índice 0 e as demais mantêm a ordem relativa. O nome do nó SPICE de uma net é o seu
índice decimal (`0`, `1`, `2`, …); nets não referenciadas geram lacunas na numeração (normal).

CircuitMaster: a ordem das nets deve ser **determinística** (ordenar por menor `(modelIndex, connectorId)` de cada
net) e documentada; a regra de terra é a mesma.

---

## 3. SUBSTITUIÇÃO DE TOKENS

Varredura da esquerda para a direita sobre o modelo de linha, sempre do primeiro token `{…}` **mais interno**
(sem chaves dentro) a partir da posição corrente:

| Token (sem diferenciar maiúsculas) | Substituto |
|---|---|
| `instanceTitle` | rótulo da instância com espaços trocados por `_`; se o primeiro caractere do rótulo é igual (sem diferenciar maiúsculas) ao caractere imediatamente antes do token, esse primeiro caractere é removido (`R{instanceTitle}` com `R1` → `R1`, não `RR1`) |
| `net <id>` | índice da net que contém o conector `<id>` da peça (comparação em minúsculas); se o conector não existe, vazio |
| outro nome | valor da propriedade **local** da instância; senão o da peça; se vazio e a propriedade existe na peça, ou é uma de `inductance, resistance, current, tolerance, power, capacitance, voltage` ⇒ `0`; senão o token é **mantido literalmente** e a busca avança após ele |

Pós-processamento do valor de propriedade (antes de inserir):

1. remover o símbolo da unidade da propriedade (ex.: `F`, `Ω`, `H`, `V`) quando definido na tabela de
   propriedades (documento 01, 8.3);
2. `M` → `Meg` (no ngspice `M` é mili);
3. `µ`, `μ` (duas grafias) → `u`;
4. remover `Ω`.

Exemplos: `220Ω` → `220`; `4.7kΩ` → `4.7k`; `1MΩ` → `1Meg`; `100µF` → `100u`; `5V` → `5`.

> Ponto de atenção da referência: um token desconhecido sem chaves internas faz a busca recomeçar na mesma posição
> (laço sem fim). Nenhuma peça do acervo atual dispara isso (censo: 0 tokens desconhecidos), mas o CircuitMaster
> deve **avançar a posição** após um token mantido literalmente.

Nós auxiliares: modelos como `{net connector1}_{instanceTitle}_aux` geram nós internos (`3_V1_aux`) — nomes
locais à peça, não nets do esquema.

---

## 4. MONTAGEM DO DECK

```
<nome da simulação>                      ← 1ª linha = título ("Simulator Netlist")
<linhas de cada peça simulada>           ← uma vez por peça
                                          ← linha em branco
<blocos de modelo, sem repetição>        ← dedup sem diferenciar maiúsculas, um por bloco
.option savecurrents
.option interp
<opções SPICE do projeto>
.OP | .TRAN …                            ← ver 5
*.TRAN 1ms 100ms
* .AC DEC 100 100 1MEG
.END
```

Regras:

- **Após montar, toda ocorrência de `IC=0` é removida do deck** (os capacitores do acervo declaram `IC=0`, mas a
  simulação não os usa; condições iniciais vêm de `.ic` no modo interativo).
- `.include <arquivo>` é resolvido procurando `<arquivo>` em `spicemodels/` dentro de cada pasta de peças
  (`core`, `obsolete`, `contrib`, `user`; repositório e pasta do usuário); encontrado ⇒ caminho absoluto; senão a
  linha fica como está.
- Opções do projeto (`simulator_spice_options`) são inseridas numa linha própria antes da análise.
- Ordem das peças na referência é a de um conjunto não ordenado; CircuitMaster: ordenar por rótulo de instância.

### 4.1 Exemplo (bateria 9 V + resistor 220 Ω + LED vermelho)

Suponha nets: terra `0` = {bateria `-`, LED cátodo}, `1` = {bateria `+`, resistor pino 0}, `2` = {resistor pino 1,
LED ânodo}, rótulos `VCC1`, `R1`, `LED1`.

```
Simulator Netlist
VCC1 1_VCC1_aux 0 DC 9
RVCC1 1_VCC1_aux 1 0.1
R1 1 2 220
DLED1 2 0 LED_GENERIC

*Typ RED,GREEN,YELLOW,AMBER GaAs LED: Vf=2.1V Vr=4V If=40mA trr=3uS
.MODEL LED_GENERIC D (IS=93.1P RS=42M N=4.61 BV=9 IBV=10U CJO=2.97P VJ=.75 M=.333 TT=4.32U)
.option savecurrents
.option interp

.OP
*.TRAN 1ms 100ms
* .AC DEC 100 100 1MEG
.END
```

(A bateria do acervo é modelada como fonte ideal em série com a resistência interna, usando o nó auxiliar.
`V{instanceTitle}` com rótulo `VCC1` vira `VCC1` pela regra do prefixo repetido; `R{instanceTitle}` da mesma peça
vira `RVCC1`; `D{instanceTitle}` com `LED1` vira `DLED1`. O valor 0.1 da resistência interna é ilustrativo.)

---

## 5. ANÁLISES

### 5.1 Ponto de operação (padrão)

`.OP`. É a análise usada sempre que o transitório está desligado.

### 5.2 Transitório

Ativo quando o usuário habilita o modo transitório. Janela de tempo:

- para cada osciloscópio do circuito: $t_0 = \min(\text{horizontal position})$,
  $t_1 = \max(\text{horizontal position} + 10\cdot\text{time/div})$;
- sem osciloscópio: $[0, 10]$ s.

Passo (propriedades do projeto):

| `simulator_time_step_mode` | Passo $\Delta$ | Número de passos $N$ |
|---|---|---|
| `true` | `simulator_time_step_s` (padrão `1us`) | $(t_1 - t_0)/\Delta$ |
| `false` (padrão) | $(t_1 - t_0)/N$ | `simulator_number_of_steps` (padrão `400`) |

Diretiva: `.TRAN Δ t_1 t_0` (com `UIC` e `.ic` no modo interativo).

Animação: intervalo entre quadros $= \text{simulator\_animation\_time\_s}\cdot 1000 / N$ ms (padrão `5s`),
mínimo 10 ms; valor negativo/ inválido ⇒ $(t_1 - t_0)\cdot 1000/N$. O quadro $k$ mostra o estado no passo
$k = \lfloor t_{decorrido}/\text{intervalo}\rfloor$, limitado aos passos já calculados; rótulo "`<t>` s" (3 casas)
nas vistas breadboard e esquemático. Ao atingir $N$, a animação para.

### 5.3 Interação durante o transitório

Se o circuito muda durante a animação:

1. passo de interação $m = \lfloor t_{decorrido}/\text{intervalo}\rfloor + 1$ (se $m > N$, ignora);
2. parar a execução em segundo plano; ler, no plot corrente, todo vetor de tensão de nó (`v…`, exceto `branch`);
   guardar os valores já mostrados; montar `.ic v(n)=<valor no passo m−1, 8 casas> …`;
3. re-simular com `.TRAN Δ (t_1 − (m−1)Δ) 0 UIC` e o novo circuito;
4. os vetores do osciloscópio concatenam o histórico guardado com os novos.

### 5.4 Disparo

Com o simulador ligado, qualquer modificação do circuito agenda uma simulação para **200 ms** depois da última
modificação (*debounce*). Iniciar/parar pelo usuário.

---

## 6. EXECUÇÃO NO NGSPICE (API COMPARTILHADA)

Sequência de referência:

1. Carregar a biblioteca compartilhada e resolver `ngSpice_Init`, `ngSpice_Init_Sync`, `ngSpice_Command`,
   `ngSpice_Circ`, `ngGet_Vec_Info`, `ngSpice_CurPlot`, `ngSpice_AllPlots`, `ngSpice_AllVecs`, `ngSpice_SetBkpt`.
2. `ngSpice_Init` com callbacks de saída de texto, estado, saída controlada, dados, dados iniciais e
   "thread em segundo plano rodando".
3. Carregar o code model XSPICE `analog.cm` (`codemodel <caminho>`), se existir.
4. Para cada simulação: `remcirc`, `reset`, limpar log, `ngSpice_Circ(linhas)`.
5. Se o log contém `error` (saída padrão) ou `warning` (erro padrão) ⇒ erro de carga: mostrar mensagem com o
   deck e o log e parar.
6. `listing`, `bg_run`; aguardar o fim (ou o primeiro ponto de tempo, no transitório) por até ~3 s; estourou ⇒
   `bg_halt` e erro de *timeout*.
7. Erro de execução ou "there aren't any circuits loaded" ⇒ erro.
8. Ler vetores (seção 7) e atualizar as peças (seção 8).

---

## 7. LEITURA DE RESULTADOS

Seja $t$ o rótulo da instância em minúsculas mais o sufixo da subparte SPICE (`A`, `B`, `R`, `G`, …), e $d$ a
**letra do dispositivo** = caractere imediatamente antes de `{instanceTitle}` na primeira linha SPICE da peça.

| Grandeza | Vetor |
|---|---|
| Tensão de nó $n \ne 0$ | `v(n)`; nó 0 ⇒ 0 V |
| Tensão entre conectores $a, b$ | $v(net(a)) - v(net(b))$ |
| Corrente de R, C, L | `@t[i]` se $t$ começa por $d$, senão `@dt[i]` |
| Corrente de diodo/LED | `@t[id]` (idem regra de prefixo) |
| Corrente de fonte V, I, E, F, G, H, B | `t#branch` (prefixando $d$ se $t$ não começa por $d$) |
| Corrente de BJT | `@q<t>[ib]`, `[ic]`, `[ie]` |
| Potência | `@t[p]` |

Vetor inexistente ou índice fora do intervalo ⇒ valor padrão 0.

**Valor-limite de propriedade** (`maxProp`): texto da propriedade (local ou da peça) convertido com prefixo SI
removendo o símbolo da unidade (ou, sem símbolo definido, removendo todo caractere que não seja dígito, `.`, `^`
ou prefixo SI); propriedade vazia ⇒ $+\infty$ (sem limite).

---

## 8. ESTADO VISUAL

Para cada peça simulada (instância do esquemático), a gêmea da breadboard é a de mesmo `id`. Efeitos anteriores
(fumaça, displays, setas) são removidos a cada quadro. **Fumaça** = imagem sobreposta com opacidade 0,7 no topo
($z$ máximo), na breadboard (caixa sem pernas) e no esquemático.

### 8.1 Peças não simuladas

Todas as peças das vistas breadboard e esquemático que não estão no conjunto simulado são acinzentadas
(colorização `#646464`), exceto: conectores, fios, rótulos, notas, luz de LED, símbolos, placas, perfboards,
breadboards, réguas, `power label`, `net label`, família `breadboard`.

### 8.2 Regras por família (primeira que casa, por substring da família em minúsculas)

| Família contém | Regra |
|---|---|
| `capacitor` | pinos `+`/`-`; $V = v(+) - v(-)$; $V_{max}$ = `voltage`. Família com `bidirectional`: fumaça se $|V| > V_{max}$. Senão (eletrolítico/tântalo): fumaça se $V > V_{max}/2$ **ou** $V < -0{,}5$ V |
| `diode` | $P = |V_{01}|\cdot|I|$; fumaça se $P >$ `power` |
| `led` | sem `rgb`: brilho $b = I/I_{max}$ (`current`); $I > I_{max}$ ⇒ fumaça e $b = 0$. Com `rgb`: correntes das subpartes R, G, B; $b_c = I_c/I_{max}$; fumaça se $\max I_c > I_{max}$ |
| `resistor` | pinos de nome `Pin 0`/`Pin 1`; $P = |V\cdot I|$; fumaça se $P >$ `power` |
| `multimeter` | ver 8.4 |
| `dc motor` | pinos `pin 1`/`pin 2`; fumaça se $|V| >$ `voltage (max)`; se $|V| \ge$ `voltage (min)`, seta de rotação horária ($V > 0$) ou anti-horária, centrada, escala $0{,}5\cdot\max(W_p/W_s, H_p/H_s)$ |
| `line sensor` / `distance sensor` | conectores por **descrição** (`vcc`/`supply voltage`, `gnd`/`ground`, `out`/`output voltage`); $V = v(vcc) - v(gnd)$; $I$ = corrente de coletor de `q<t>` (sensor de linha) ou da subparte `a`; fumaça se $V >$ `voltage (max)`, $V < -0{,}5$ ou $|I| >$ `max output current` |
| `battery` / `voltage source` | $I_{max} = 0{,}1\cdot V/R_{int}$ (`voltage`, `internal resistance`); fumaça se $|I| > I_{max}$. Fonte de bancada (`LabDCPowerSupply` no `moduleId`): display com $V$ entre os dois primeiros conectores e $-I$, limite `max current` |
| `potentiometer` / `sparkfun trimpot` | $P = R_{max}\frac{k}{100}I_A^2 + R_{max}\frac{100-k}{100}I_B^2$ com $k$ = `knob status`; fumaça se $P >$ `power` |
| `oscilloscope` | ver 8.5 |

### 8.3 Cor do LED (breadboard)

Cor base $(r, g, b)$ = valor auxiliar da cor da propriedade `color` na tabela de propriedades (sem cor ⇒ não
altera). Com $b' = \min(1,\ 4\,b)$, $b \in [0,1]$:

$$c' = \min(255,\ \lfloor 0{,}3\,c + b'\,c \rfloor)$$

aplicado a cada canal e a todos os elementos coloridos do LED, mais um halo de luz proporcional a $b$. Estado
inicial (sem simulação) usa $b = 0{,}7/4$. RGB: $c = \min(230,\ 40 + 800\,b_c)$ por canal (saturação limitada).

### 8.4 Multímetro

Conectores `com probe`, `v probe`, `a probe`; propriedade `variant`:

| Variante | Condição de erro (`ERR`) | Leitura |
|---|---|---|
| (qualquer) | as três pontas ligadas | — |
| `voltmeter (dc)` | ponta A ligada | $v(V) - v(COM)$ (só se V e COM ligadas) |
| `ammeter (dc)` | ponta V ligada | corrente da fonte interna do medidor |
| `ohmmeter` | ponta A ligada | $|V_{V,COM}/I|$ (o medidor injeta 1,5 V por 100 Ω) |

"Ligada" = conectada a algum fio. Formato do display (7 segmentos, 5 posições):

1. $|x| < 10^{-12}$ ⇒ 0;
2. formatar com prefixo SI e 6 casas, achar a posição $p$ do ponto decimal;
3. reformatar com $4 - p$ casas; `k` → `K`;
4. completar com espaços à esquerda até 5 caracteres **sem contar o ponto**.

Exibido na breadboard (fonte de 7/16 segmentos, cor `rgb(48,48,48)`, largura do texto = 80% da largura da peça,
centrado na horizontal, topo a 7% da altura) e no esquemático (texto simples, largura 50% da peça, topo a 13%).
As variantes `Voltmeter (AC)` e `Ammeter (AC)` não têm `<spice>` no acervo e ficam fora da simulação na
referência.

Fonte de bancada: duas linhas "`V`" e "`I`" no mesmo formato de 5 posições, vermelho `rgb(200,48,48)`, largura 72%
da peça, topo a 7,5% da altura.

**Fumaça**: desenho de fumaça com opacidade 0,7, escalado (só para cima, nunca reduzido) para caber na caixa da
peça (sem pernas, na breadboard), com o canto inferior direito no centro da peça, acima de tudo.

### 8.5 Osciloscópio

Propriedades: `channels` (1–4), `time/div`, `horizontal position`, `chN volts/div`, `chN offset`. Pontas
`com probe`, `v1 probe` … `v4 probe`; sem nenhuma ponta de canal ligada, nada é desenhado.

- Tela de 10 divisões horizontais × 8 verticais; janela de tempo
  $[\text{hpos},\ \text{hpos} + 10\cdot\text{time/div}]$.
- Para cada canal ligado: série $v_c(t) - v_{com}(t)$ do início até o passo corrente;
  $y = y_{centro} - \dfrac{v + \text{offset}_c}{\text{volts/div}_c}\cdot\dfrac{H}{8}$,
  $x = x_0 + \dfrac{t - \text{hpos}}{\text{time/div}}\cdot\dfrac{W}{10}$; polilinha com as cores
  `#ffff50`, `lightgreen`, `lightblue`, `pink` (canais 1–4).
- Desenhado como SVG sobreposto à tela da peça na breadboard e no esquemático, com legendas de escala
  ("`CHn: <volts/div>V`" na cor do canal, abaixo da tela) e um triângulo marcando o *offset* de cada canal.
- Tela no sistema de coordenadas do SVG da peça (mil): $W = 3376{,}022$, $H = 2700{,}072$; canto superior esquerdo
  em $(290{,}544;\ 259{,}061)$ na breadboard e $(906{,}074;\ 354{,}608)$ no esquemático; pontos fora da tela são
  limitados às bordas; espessura do traço 20 mil.
- Sem ponta COM ligada, a referência soma ruído gaussiano de desvio `volts/div` ao sinal.

---

### 8.6 Extensões do CircuitMaster (instrumentos e gráficos)

Além do estado visual da referência, o CircuitMaster oferece, sem alterar o *deck*:

1. **Controle de simulação**: botão Simular/Parar, escolha entre ponto de operação e transitório, e no transitório
   reprodução da animação (tocar, pausar, reiniciar) com o tempo simulado corrente.
2. **Painel de instrumentos** (estilo Multisim): um mostrador por multímetro do circuito, com a leitura grande, a
   grandeza e a unidade, e botões V / A / Ω e DC / AC que trocam a variante da peça (troca de peça por família,
   doc 02 §5, mantendo as conexões por `connectorId`).
3. **Multímetro AC**: as variantes AC usam o mesmo modelo da variante DC correspondente (voltímetro: nenhum
   elemento; amperímetro: fonte `V… DC 0` entre A e COM) e exibem o valor **RMS** sobre a janela do transitório
   (no ponto de operação, o valor absoluto).
4. **Gráfico** (*grapher*): curvas de tensão de nó e de corrente de fonte ao longo do tempo do transitório,
   desenhadas progressivamente até o passo da animação; por padrão mostra os canais dos osciloscópios e as
   grandezas dos multímetros; o usuário pode marcar qualquer net (tensão em relação ao terra) ou corrente de fonte;
   cursor com leitura do valor de cada curva no instante apontado.
5. **Chaves interativas**: duplo clique numa peça com propriedade `switch status` troca para a próxima variante
   da família (`Released` ↔ `Pressed`), o que dispara nova simulação; equivale a mudar a propriedade no Inspector.

## 9. PROPRIEDADES DE PROJETO (`.fz`)

| Chave em `<project_properties>` | Padrão |
|---|---|
| `simulator_time_step_mode` | `false` |
| `simulator_number_of_steps` | `400` |
| `simulator_time_step_s` | `1us` |
| `simulator_animation_time_s` | `5s` |
| `simulator_spice_options` | vazio |

Cada uma é gravada como `<chave value="…"/>`.

---

## 10. ARQUITETURA NO CIRCUITMASTER

### 10.1 ngspice em WebAssembly

- Fonte: `../Fritzing/ngspice` (ngspice-47). Compilar com Emscripten como biblioteca compartilhada
  (`--with-ngshared`), sem Tcl, sem OSDI (MPL, opcional), sem o code model `xspice/icm/table` (**GPLv2+** — excluir
  para manter o produto livre de GPL); manter os code models analógicos XSPICE (domínio público) para o
  `ilimit` da fonte de bancada.
- Licenças embutidas: núcleo BSD modificada; `maths/sparse` MIT; `maths/KLU` e `frontend/numparam` **LGPLv2+**.
  Cumprimento: distribuir o ngspice como **módulo WASM separado** (fronteira de ligação dinâmica), com fonte,
  *scripts* de build e possibilidade de substituição pelo usuário; o código do CircuitMaster não é afetado.
- Sem *pthreads*: rodar a simulação de forma síncrona dentro de um Web Worker dedicado (`run` em vez de
  `bg_run`), coletando dados pelo *callback* de dados por passo de tempo para animação progressiva. Cancelamento
  e *timeout* = encerrar o worker e recriá-lo.

### 10.2 Protocolo UI ↔ worker

| Mensagem | Conteúdo |
|---|---|
| `load` | URL do módulo, code models |
| `run` | `deck` (texto), `analysis` (`op`/`tran`), lista de vetores desejados |
| `progress` | passo corrente, tempo simulado |
| `vectors` | `{nome: Float64Array}` (transferível) |
| `log` | texto do ngspice |
| `error` | `{fase: carga|execução|timeout, log, deck}` |

### 10.3 Pipeline

`grafo (doc 02) → nets do esquemático → escolha do terra → numeração → substituição de tokens → deck →
worker ngspice → vetores → avaliação das regras (8) → efeitos por vista`. A geração do deck é pura e testável;
as regras visuais são funções puras `(vetores, peça, passo) → efeitos`.

---

## 11. PLANO DE TESTES

1. **Deck**: para cada sketch que usa peças do bin de simulação (`fritzing-parts/bins/more/sim.fzb`, 78 peças),
   o deck do CircuitMaster deve ser igual ao de referência a menos da ordem das linhas de peças e da numeração das
   nets (comparação por isomorfismo de nós).
2. **Substituição**: casos unitários para cada regra da seção 3 (prefixo duplicado, espaços, `M`→`Meg`, µ, Ω,
   propriedade vazia conhecida ⇒ 0, expressão aninhada, token desconhecido mantido sem laço).
3. **Numérico**: tensões de nó e correntes do ngspice WASM idênticas às do ngspice nativo (erro relativo
   < 1e-9) nos mesmos decks.
4. **Visual**: tabelas-verdade das regras de fumaça nos limites ($\pm 1\%$ do limite) para cada família.
5. **Transitório**: série do osciloscópio contínua através de uma interação (sem salto no passo $m$).
