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

### 5.1 Uma simulação só (CircuitMaster)

No Fritzing o usuário escolhe antes entre ponto de operação e transitório. No CircuitMaster não há essa escolha:
**Simular** roda o transitório na janela automática (§5.5) ou na manual, a partir do ponto de operação; o que varia
no tempo é o sinal escolhido em cada fonte de tensão (§5.5) e as fontes variáveis do acervo. Se todo vetor fica parado na janela (pico a pico até
$10^{-4}$ do nível, ou $10^{-12}$: o ruído do solver num LED em DC chega a $2\cdot10^{-6}$), o resultado é mostrado como **regime**: sem animação, sem eixo de tempo
e com o valor de regime no cartão da ponta; é o que acontece num circuito só com fontes DC. Osciladores sem fonte variável
(555 astável, pisca-pisca) variam e ficam no tempo. O painel diz por que deu regime e como fazer variar
("clique na fonte de tensão e escolha Degrau, Rampa, Senoide ou Onda quadrada"). O `.OP` sozinho fica para a exportação do netlist SPICE (§4),
como no Fritzing.

### 5.2 Transitório

Janela de tempo:

- janela escolhida pelo usuário (extensão do CircuitMaster, §9): `circuitmaster_start_time_s` e
  `circuitmaster_stop_time_s`, quando o fim é válido, maior que o início e o início não é negativo;
- senão, para cada osciloscópio do circuito: $t_0 = \min(\text{horizontal position})$,
  $t_1 = \max(\text{horizontal position} + 10\cdot\text{time/div})$;
- sem osciloscópio: $[0, 10]$ s.

Passo (propriedades do projeto):

| `simulator_time_step_mode` | Passo $\Delta$ | Número de passos $N$ |
|---|---|---|
| `true` | `simulator_time_step_s` (padrão `1us`) | $(t_1 - t_0)/\Delta$ |
| `false` (padrão) | $(t_1 - t_0)/N$ | `simulator_number_of_steps` (padrão `400`) |

Diretiva: `.TRAN Δ t_1 t_0` (com `UIC` e `.ic` no modo interativo).

Animação: intervalo entre quadros $= \text{simulator\_animation\_time\_s}\cdot 1000 / N$ ms (padrão `5s` no Fritzing; `3s` no CircuitMaster quando a propriedade falta); valor
negativo ⇒ tempo real, $(t_1 - t_0)\cdot 1000/N$; zero ou inválido ⇒ mostra o último passo de uma vez. O passo
mostrado é $k = \lfloor t_{decorrido}/\text{intervalo}\rfloor$, limitado aos passos já calculados (o limite de
10 ms do Fritzing é só a cadência de redesenho: não muda a velocidade); rótulo "`<t>` s" (3 casas) nas vistas
breadboard e esquemático. Ao atingir $N$, a animação para.

### 5.3 Interação durante o transitório

Se o circuito muda durante a animação:

1. passo de interação $m = \lfloor t_{decorrido}/\text{intervalo}\rfloor + 1$ (se $m > N$, ignora);
2. parar a execução em segundo plano; ler, no plot corrente, todo vetor de tensão de nó (`v…`, exceto `branch`);
   guardar os valores já mostrados; montar `.ic v(n)=<valor no passo m−1, 8 casas> …`;
3. re-simular com `.TRAN Δ (t_1 − (m−1)Δ) 0 UIC` e o novo circuito;
4. os vetores do osciloscópio concatenam o histórico guardado com os novos.

No CircuitMaster (a simulação inteira da janela já está calculada quando a animação toca): com o simulador ligado
no transitório, uma mudança com a reprodução no meio da janela (tocando ou pausada, passo $k$ com $0 < k < N$,
mesma janela e mesmo passo) não recomeça do zero:

1. as condições iniciais saem do resultado anterior no passo $k$, nó a nó **pela porta**: para cada nó $n$ do
   circuito novo, uma porta de peça dele dá o nó antigo (a numeração das nets pode mudar com a topologia);
   `.ic v(n)=<valor, 8 casas>`;
2. as fontes que dependem do tempo são adiantadas até $t_k$: o atraso `TD` de `PULSE(V1 V2 TD …)` e de
   `SIN(VO VA FREQ TD …)` vira $TD - t_k$ (TD ausente vale 0; expressão entre chaves vira `{(expr)-t_k}`); o
   ngspice aceita atraso negativo e mantém a fase, o que a referência perde ao recomeçar o tempo em 0;
3. `.TRAN Δ (N−k)Δ 0 UIC`; com UIC o ngspice não grava o ponto $t = 0$, então o resultado é o histórico anterior
   até o passo $k$ **inclusive** seguido dos pontos novos com o tempo deslocado de $t_k$ (um ponto em $t = 0$, se
   vier, é descartado);
4. vetores de tensão de nó do histórico também são lidos pela porta; os demais (correntes, pontas de prova) pelo
   nome, com zeros quando não existiam; a animação segue do instante em que estava.

Trocar o sinal de uma fonte, a frequência dele ou a duração da rampa (§5.5) recomeça do zero: é outro estímulo, não
uma mudança no meio do caminho.

### 5.4 Disparo

Com o simulador ligado, qualquer modificação do circuito agenda uma simulação para **200 ms** depois da última
modificação (*debounce*). Iniciar/parar pelo usuário.

### 5.5 Sinal da fonte de tensão e janela do transitório (extensão do CircuitMaster)

O estímulo fica na própria fonte de tensão: a fonte DC, as baterias e a fonte de bancada (a linha do `<spice>`
`V… {voltage}` ou `V… DC {voltage}`) ganham no inspetor o controle **Sinal**, gravado na instância (§9). Com o
sinal diferente de Contínuo, a tensão da linha é trocada no deck do transitório; todos começam em 0, então o ponto
de operação de $t = 0$ é o circuito em repouso (descarregado) sem UIC, e as outras fontes seguem em regime:

| Sinal (`circuitmaster_signal`) | Deck | Parâmetro (vazio = automático) |
|---|---|---|
| `dc` (padrão) | `DC V` | — |
| `step` | `PWL(0 0 e V)`, $e = 10^{-3}\,s_c$ | — |
| `ramp` | `PWL(0 0 T V)` | `circuitmaster_ramp` = $T$; automático $5\,s_c$ |
| `sine` | `SIN(0 V f 0 0 0)` | `circuitmaster_frequency` = $f$; automático $1/(2\pi s_c)$, a de corte |
| `square` | `PULSE(0 V 0 e e P/2−e P 0)`, $e = 10^{-3}P$ | `circuitmaster_frequency` = $1/P$; automático $P = 10\,s_c$ |

$s_c$ é a escala de tempo do circuito com as fontes em regime: a maior constante de tempo, senão o período da
ressonância mais lenta, senão 1 ms (só resistores). O fim da rampa conta como comutação (§8.10): a janela vai até
acomodar depois dele.

**Janela.** Sem `circuitmaster_stop_time_s` válido, é **automática**: a dos osciloscópios (§5.2); sem eles, a maior
entre a acomodação do circuito e 3 períodos da fonte variável mais lenta, sempre até acomodar depois da última
comutação; amostras `simulator_number_of_steps`, no mínimo 40 por oscilação. Digitar o fim no painel a torna
**manual**: `circuitmaster_start_time_s` a `circuitmaster_stop_time_s`, passo por pontos ou fixo (§5.2), e
`circuitmaster_initial` (`zero`: descarregado por UIC); o botão Automático do painel apaga as três.

**Escala de tempo do circuito**, lida do próprio *deck* (linhas de elemento fora de `.subckt`; semicondutores,
subcircuitos e fontes controladas ficam abertos): para cada capacitor, $\tau = R\cdot C$ com a resistência que ele
vê (fontes de tensão e indutores em curto, por eliminação de Gauss sobre as condutâncias); para cada indutor,
$L/R$ com as fontes em curto; para cada par L–C com um nó em comum, $\omega_n = 1/\sqrt{LC}$,
$\alpha = R_L/2L + 1/(2R_C C)$, $\zeta = \alpha/\omega_n$ e acomodação $4/\alpha$ (superamortecido: $4/$ o polo
lento). A acomodação do degrau é o maior entre $6\tau$ e $1{,}5\times$ a acomodação de cada par (sem perdas: 10
períodos). Fontes: `PULSE(V1 V2 TD TR TF PW PER)` e `SIN(VO VA FREQ TD …)` dão período e atraso.

A janela é limitada a $[10^{-9}, 10^{4}]$ s e arredondada para cima na série $\{1; 1{,}2; 1{,}5; 2; 2{,}5; 3; 4; 5;
6; 8; 10\}\times 10^n$ (um valor até 2% abaixo serve); amostras no máximo 20 000. Sem escala nenhuma, vale a
janela de §5.2.

**Descarregado**: `.TRAN … UIC`, com capacitores e indutores em zero (as fontes ligam em $t = 0$). Com UIC o
ngspice não grava $t = 0$; o resultado ganha na frente o instante $t_0$ com todas as grandezas em zero (o circuito
antes de ligar).

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
**letra do dispositivo** = caractere imediatamente antes da **primeira ocorrência** de `{instanceTitle}` no texto
SPICE da peça (as linhas concatenadas; na fonte de bancada a primeira linha é um `.model`, e $d$ = `V`).

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
| `battery` / `voltage source` | $I_{max} = 0{,}1\cdot V/R_{int}$ (`voltage`, `internal resistance`); fumaça se $|I| > I_{max}$ no passo e (CircuitMaster) em algum passo da segunda metade da janela: o pico de carga de um capacitor no começo de um degrau não queima a fonte, a sobrecarga de cada ciclo de uma senoide sim. Fonte de bancada (`LabDCPowerSupply` no `moduleId`): display com $V$ = $v(\text{connector0}) - v(\text{connector1})$ (a saída do `ilimit` é `connector0`; no `.fzp` ele vem depois do `connector1`) e $-I$, limite `max current` |
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
2. **Visor do multímetro** (estilo Multisim, no inspetor da peça): a leitura grande, a grandeza e a unidade, e
   botões V / A / Ω e DC / AC que trocam a variante da peça (troca de peça por família,
   doc 02 §5, mantendo as conexões por `connectorId`).
3. **Multímetro AC**: as variantes AC usam o mesmo modelo da variante DC correspondente (voltímetro: nenhum
   elemento; amperímetro: fonte `V… DC 0` entre A e COM) e exibem o valor **RMS** sobre a janela do transitório
   (no ponto de operação, o valor absoluto).
4. **Gráfico** (*grapher*): as curvas das pontas de prova (§8.7) ao longo do tempo do transitório, desenhadas
   progressivamente até o passo da animação, com cursor e leitura do valor de cada curva no instante apontado.
   Pedido do usuário (2026-10-23): só as pontas que ele pôs, uma pílula por curva no topo do painel (mostra ou
   esconde, com filtro); as tensões dos nós e as correntes das fontes saíram do painel.
5. **Chaves interativas**: duplo clique numa peça com propriedade `switch status` troca para a próxima variante
   da família (`Released` ↔ `Pressed`), o que dispara nova simulação; equivale a mudar a propriedade no Inspector.

### 8.7 Pontas de prova (extensão do CircuitMaster, estilo Multisim)

Ferramentas **Ponta de tensão**, **Ponta de corrente** e **Ponta de tensão e corrente**: um clique num fio (no
ponto do fio mais próximo, parâmetro $t \in [0{,}1;\ 0{,}9]$) ou num terminal de peça (o conector sob o cursor ou o
terminal a até 14 px de tela) coloca uma ponta `P<n>` (menor $n$ livre) na vista corrente (não na PCB); a ferramenta
volta à seleção depois de um clique, exceto com Shift; Esc ou botão direito saem.

1. **Dado**: `{ id, kind: voltage|current|both, view, key, t, offset, flip }`. `key` é `<fio>/connector0` (ponta
   no fio, posição $t$ ao longo dele, na curva se houver) ou a porta do pino. Apagar a instância apaga as pontas
   dela. Gravação: JSON na propriedade de projeto `circuitmaster_probes` do `.fz` (§9), que o Fritzing ignora; na
   leitura, só passam itens com a forma certa e cuja instância existe.
2. **Tensão**: a da net da porta em relação ao terra do circuito (nó 0 ⇒ 0 V); net sem nó simulado ⇒ sem leitura.
3. **Corrente**: o circuito é cortado na ponta e uma fonte `Vprobe_<id> a b DC 0` liga os lados; a leitura é
   `i(Vprobe_<id>)`, que é positiva de `a` para `b`. No fio, as ligações da ponta `connector1` passam para um toco de
   fio novo: $a$ = lado de `connector0`, $b$ = lado de `connector1` (sentido positivo de `connector0` para
   `connector1`). No pino, as ligações dele passam para o toco: $a$ = o resto da net, $b$ = o pino (positivo
   **entrando na peça**). `flip` inverte o sinal. Os cortes são feitos um sobre o outro: pontas em série no mesmo
   ramo ficam ligadas pelos tocos, e um nó formado só por tocos entre duas fontes recebe número próprio. Lado que
   é só toco tocado por uma única fonte ⇒ ponta em aberto, corrente 0. Os dois lados no mesmo nó (o fio está num
   laço de fios) ⇒ sem fonte e sem leitura de corrente. O terra é o escolhido no circuito sem cortes (§2.1),
   identificado pela porta que o define. A exportação "Netlist SPICE" sai sem as fontes das pontas.
4. **Na vista**: marca no ponto medido (seta no sentido positivo da corrente), linha de chamada tracejada e caixa
   com o nome e as leituras no passo corrente (4 algarismos, prefixo SI). O lado da caixa é o primeiro entre acima
   à direita, abaixo à direita, acima à esquerda e abaixo à esquerda que não cobre peça, rótulo ou outra ponta;
   arrastar a caixa muda `offset`. Menu: medir tensão, corrente ou ambas, inverter o sentido, remover.
5. **Medidas** (no cartão da ponta, no inspetor) até o passo corrente, ponderadas pelo tempo no transitório: valor, média (nível DC), RMS, pico a
   pico, mínimo, máximo e frequência (subidas pela média com histerese de 10% do pico a pico, $f = (n-1)/(t_n - t_1)$
   com $n \ge 2$). Pico a pico menor que $10^{-6}$ do nível é ruído numérico do solver: vale 0 e não há frequência.
6. **Gráfico**: as curvas das pontas (tensão no eixo da esquerda, corrente tracejada no da direita, na cor da
   ponta); sem pontas, o painel diz como pôr uma. Cartão e gráfico só mostram o que a ponta mede: tensão, corrente
   ou as duas.
7. **Exibição** (preferência do usuário, guardada no navegador, não no sketch): "valores nas pontas" (sem ela, a
   caixa da ponta mostra só o nome) e a doca de simulação aberta ou recolhida; as duas começam ligadas.

### 8.8 Resposta da curva (extensão do CircuitMaster)

Medida de uma curva escolhida (por padrão, a primeira tensão de ponta, ou de nó, que não esteja num nó ligado
direto a uma fonte de tensão; o nó interno entre uma fonte e a resistência interna dela conta como o terminal, e as
fontes de 0 V das pontas não contam). A fonte de estímulo é a primeira `SIN` do *deck*; sem ela, a primeira
`PULSE`.

**Degrau** (sem fonte `SIN`): intervalo $[t_0, t_1]$ da janela; com fonte `PULSE`, $[TD, TD + TR + PW]$ (a primeira
subida até a descida). Com $y_0$ o primeiro valor e $y_\infty$ a média dos últimos 2% do intervalo, a resposta
normalizada é $r = (y - y_0)/(y_\infty - y_0)$ (sem degrau se $|y_\infty - y_0| \le 10^{-3}$ da escala):

- **subida**: de $r = 0{,}1$ a $r = 0{,}9$ (interpolado entre amostras);
- **pico** e **sobressinal** $\max(0, r_{max} - 1)$ (pico nos últimos 2% não conta);
- **acomodação**: último instante fora de $|r - 1| \le 0{,}02$; só vale se os últimos 10% do intervalo variam
  menos que meia faixa (senão "não acomodou na janela");
- **τ** ($r = 0{,}632$) só sem oscilação (sobressinal ≤ 0,5%); com oscilação, **período** entre os dois primeiros
  picos acima da faixa e $\zeta = -\ln(M_p)/\sqrt{\pi^2 + \ln^2 M_p}$.

Os tempos são contados a partir do início do intervalo. No gráfico: faixa de ±2% e valor final (tracejado), ponto
de pico com o sobressinal, τ (1ª ordem) ou a acomodação (com oscilação), cada marca só depois que a animação passa
por ela.

**Ganho** (com fonte `SIN`): entrada = tensão entre os terminais da fonte; a partir de $\max(t_0, TD)$, mais um
período quando cabem 3 ou mais, em um número inteiro de períodos: amplitude e fase de cada série pela componente
na frequência da fonte (integração trapezoidal de $y\sin\omega t$ e $y\cos\omega t$ sem o nível DC). Ganho =
razão das amplitudes (negativo quando a defasagem passa de 90°), em dB $20\log_{10}$, fase em $(-180°, 180°]$, e o
nível DC da saída.

### 8.9 Circuitos de teste (extensão do CircuitMaster)

Sketches prontos no esquemático, abertos com o simulador ligado e o sinal certo na fonte (§5.5): LED com resistor
(5 V, 220 Ω, LED vermelho, contínuo: regime com ≈ 13 mA), carga do capacitor (5 V, 1 kΩ, 100 µF, degrau, τ = 100 ms),
carga e descarga (onda quadrada de 0–5 V e 1 Hz no mesmo RC), filtro passa-baixa (1 kΩ, 1 µF, senoide automática
na frequência de corte: 71% e −45°), RLC série (22 Ω, 10 mH, 10 µF, degrau, ζ ≈ 0,35, sobressinal ≈ 30%),
amplificador inversor (OP27,
−10 kΩ/1 kΩ, ±9 V, senoide de 0,5 V e 1 kHz) e emissor comum (NPN, divisor 47 kΩ/10 kΩ, 4,7 kΩ/1 kΩ, 9 V, senoide
de 0,2 V e 1 kHz). As peças são criadas nas três vistas, alinhadas à grade e ligadas pelo caminho ortogonal no esquemático e na
protoboard (fios de jumper), com as pontas de prova da entrada e da saída; na PCB ficam as linhas de ligação para o
autorouter ("Criar placa e rotear", doc 03 §8.3.1).

### 8.10 Comutação programada de chaves (extensão do CircuitMaster)

Chave ou botão = peça com `switch status` e família contendo `switch`, cujas variantes `Released` e `Pressed` são
trocáveis (doc 02 §5). A propriedade de projeto `circuitmaster_switching` guarda, por `modelIndex`, as duas
variantes e a lista de eventos `[t (s), acionada]` em ordem de tempo; JSON inválido ou sem eventos é ignorado.

- **DC e posição inicial**: vale a variante da instância (o `<spice>` dela); no transitório ela vale até o primeiro
  evento (evento em $t = 0$ redefine o início).
- **Transitório**: as linhas da peça viram uma fonte de controle `V<título>_sw sw_<título> 0 PWL(…)`, de 0 (solta)
  a 1 (acionada), com rampa de 1% do passo em cada troca, e um elemento por contato fechado de cada variante (as
  linhas `R` do `<spice>` da acionada e da solta, com os mesmos tokens): `B<título>_<p|r><i> a b I=V(a,b)*(gₐ +
  (1/R − gₐ)·k)` com $g_a = 10^{-9}$ S, $k$ = `V(sw)` na acionada e `1 − V(sw)` na solta. Assim o contato fecha com a
  resistência de contato da peça (0,1 Ω sem valor) e abre com 1 GΩ.
- **Janela**: a escala de tempo junta a do circuito com as chaves fechadas e abertas (contatos como resistores); os
  instantes em que os PWL mudam são eventos, e a janela automática vai até o último evento mais a acomodação (ou o
  dobro do último evento sem escala).
- **Continuação** (§5.3): o PWL é deslocado como as outras fontes: o valor interpolado no instante vira o ponto
  $t = 0$ e os pontos seguintes têm o tempo diminuído.
- **Resposta** (§8.8): sem fonte senoidal ou pulsada, o degrau medido vai do primeiro ao segundo evento (ou ao fim
  da janela); sobressinal acima de 100% não é degrau e não é mostrado.
- **Na vista**: a imagem da protoboard e o símbolo do esquemático mostram a posição do instante mostrado; o
  inspetor da peça lista os eventos (Fechar/Abrir ou Ir para 1/2, instante com unidade s, ms, µs ou ns).

O circuito de teste "Chave temporizada (RC)" fecha um botão em 100 ms e abre em 500 ms num RC (1 kΩ, 100 µF, descarga
por 2,2 kΩ).

## 9. PROPRIEDADES DE PROJETO (`.fz`)

| Chave em `<project_properties>` | Padrão |
|---|---|
| `simulator_time_step_mode` | `false` |
| `simulator_number_of_steps` | `400` |
| `simulator_time_step_s` | `1us` |
| `simulator_animation_time_s` | `3s` (Fritzing: `5s`) |
| `simulator_spice_options` | vazio |
| `circuitmaster_start_time_s` | vazio (extensão: início da janela do transitório) |
| `circuitmaster_stop_time_s` | vazio (extensão: fim da janela; vazio = osciloscópios ou 10 s) |
| `circuitmaster_probes` | ausente (extensão: pontas de prova em JSON, §8.7) |
| `circuitmaster_initial` | vazio (extensão: `zero` faz a janela manual partir descarregada, §5.5) |
| `circuitmaster_switching` | vazio (extensão: comutação programada das chaves em JSON, §8.10) |

Cada uma é gravada como `<chave value="…"/>`. O sinal da fonte (§5.5) fica na instância, como `<property>`:
`circuitmaster_signal` (`dc`, `step`, `ramp`, `sine`, `square`), `circuitmaster_frequency` e `circuitmaster_ramp`
(vazios = automáticos); o Fritzing ignora essas propriedades e simula a fonte em contínuo.

---

## 10. ARQUITETURA NO CIRCUITMASTER

### 10.1 ngspice em WebAssembly

- Fonte: `../Fritzing/ngspice` (ngspice-47). Compilar com Emscripten como biblioteca compartilhada
  (`--with-ngshared`), sem Tcl, sem OSDI (MPL, opcional), sem XSPICE (o code model `xspice/icm/table` é
  **GPLv2+**, e os code models dependem de carga dinâmica por `codemodel`, indisponível no módulo WASM).
- O único code model usado pelo acervo é o `ilimit` da fonte de bancada. Na montagem do deck, cada elemento
  `A<n> in pos_pwr neg_pwr out <modelo ilimit>` vira duas fontes comportamentais com os parâmetros do `.model`
  (padrões do code model: `gain` 1, `in_offset` 0, `r_out_source`/`r_out_sink` 1 Ω, `i_limit_source`/
  `i_limit_sink` 10 mA), e a linha `.model … ilimit` sai:
  - `B<n>p pos_pwr out I = min(max(0, (gain·(V(in)+in_offset) − V(out))/r_out_source), i_limit_source)`
  - `B<n>n out neg_pwr I = min(max(0, (V(out) − gain·(V(in)+in_offset))/r_out_sink), i_limit_sink)`

  O zero vem primeiro: no empate a derivada do `max` do ngspice é a do segundo argumento (`inpptree.c`), então com
  corrente zero (carga só capacitiva, em regime) a saída mantém a condutância $1/r$; na ordem inversa ela fica sem
  ligação nenhuma e o ponto de operação não converge ("timestep too small") ou fica em 0 V.

  A corrente fornecida continua saindo de `pos_pwr` (a cadeia `V<título>Aux`/`V<título>` que o display lê) e a
  absorvida volta por `neg_pwr`, como no code model; só a suavização de borda (`v_pwr_range`, faixas de 1 nA) é
  omitida. Conferido contra o code model (`xspice/icm/analog/ilimit`, domínio público): mesmos padrões no
  `ifspec.ifs` e mesmas equações de regime no `cfunc.mod`; a trava de `veq` nos trilhos nunca atua aqui porque
  `pos_pwr` fica 5 V acima do ajuste. Conferido também numericamente: `tools/Ngspice/build.sh xspice` compila o
  ngspice nativo com XSPICE e os code models (só para o teste; nada disso vai para o app), e o ponto de operação da
  fonte de bancada com cargas de 0,1 Ω, 10 Ω, 100 Ω (limitando em 100 mA), 120 Ω e 1 kΩ (regulando 12 V) sai igual
  nas fontes B (WASM) e no `ilimit` (nativo) a menos de $10^{-9}$ relativo, em todas as tensões de nó e correntes
  de fonte. Esse build nativo cai ao destruir o circuito na saída (`CKTdestroy`), depois de gravar os resultados; o
  teste lê o rawfile gravado com `write` e ignora o código de saída.
- A exportação "Netlist SPICE" sai como a do Fritzing: título = nome do sketch, sem as opções do projeto nem as
  pontas de prova, sempre `.OP`, com `IC=0` e o `ilimit` do XSPICE (o deck que o simulador do Fritzing recebe).
- Licenças embutidas: núcleo BSD modificada; `maths/sparse` MIT; `maths/KLU` e `frontend/numparam` **LGPLv2+**.
  Cumprimento: distribuir o ngspice como **módulo WASM separado** (fronteira de ligação dinâmica), com fonte,
  *scripts* de build e possibilidade de substituição pelo usuário; o código do CircuitMaster não é afetado.
- Sem *pthreads*: rodar a simulação de forma síncrona dentro de um Web Worker dedicado (`run` em vez de
  `bg_run`), coletando dados pelo *callback* de dados por passo de tempo para animação progressiva. Cancelamento
  e *timeout* = encerrar o worker e recriá-lo.

### 10.2 Protocolo UI ↔ worker

Pedido `{ id, deck }`; resposta `{ id, result: { vectors, log, error } }` com os vetores `Float64Array` transferidos,
ou `{ id, error }` quando o trabalho lança (WASM abortado). O cliente é o supervisor comum dos workers (doc 06 §2):
15 s sem resposta, erro do worker ou resposta de erro encerram o worker, a simulação volta com `error`
("simulação interrompida: …") e a próxima o recria. Uma simulação por vez.

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
3. **Numérico**: nos mesmos decks, o ngspice WASM reproduz o nativo compilado da mesma fonte com as mesmas opções
   (`tools/Ngspice/build.sh native`; vetores do nativo lidos do rawfile binário do modo lote, que é gravado em
   fluxo: `No. Points` fica com a estimativa e um passo rejeitado regrava o instante, valendo a última gravação).
   Bit a bit não é garantido: a libm do Emscripten (musl) difere da glibc em 1–2 ulp em `exp`, `pow`, `sin`, `cos`,
   `tanh`, `atan`, `log10`, `sinh` e `cosh` (`log` e `sqrt` coincidem), e circuitos que comutam amplificam essa
   diferença. Critério: mesmos vetores; cada um dentro de `reltol` (1e-3) da escala cheia do circuito (maior $|V|$
   entre as tensões, maior $|I|$ entre as correntes), ponto a ponto; nos osciladores, isso só no ponto inicial, com o
   mesmo número de bordas no nó de maior excursão e o intervalo médio entre bordas dentro de 1%. Medido nos 11
   sketches de simulação: os 7 de ponto de operação e o pulso do osciloscópio saem idênticos bit a bit; o retificador
   difere em 1e-6 da escala cheia (nó ligado ao terra só por 1 GΩ); 555 e pisca-pisca mantêm as bordas, com
   intervalo médio diferente em 0,06% e 0,11%.
4. **Visual**: tabelas-verdade das regras de fumaça nos limites ($\pm 1\%$ do limite) para cada família.
5. **Transitório**: série do osciloscópio contínua através de uma interação (sem salto no passo $m$).
6. **Sinal da fonte** (§5.5): Contínuo dá regime; Degrau, Rampa, Senoide e Onda quadrada variam, com `PWL`, `SIN` e
   `PULSE` no deck, a senoide automática na frequência de corte e a janela da rampa passando do fim dela
   (`tests/spice.test.ts`); nos circuitos de teste, o LED com resistor em regime, o RC por degrau sem fumaça na fonte
   e o passa-baixa com 71% e −45° (`tests/bench.test.ts`); no navegador, o Sinal do inspetor troca o deck e recomeça
   o transitório (`e2e/circuit.spec.ts`, `e2e/simulation.spec.ts`).
7. **Fonte de bancada com carga RC** (§10.1): sem corrente em regime o transitório converge e segue o degrau
   (`tests/spice.test.ts`).
