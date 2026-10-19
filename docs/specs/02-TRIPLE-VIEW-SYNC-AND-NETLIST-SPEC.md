# 02 — SINCRONIZAÇÃO TRIPLA DE VISTAS E MOTOR DE NETLIST

Especificação funcional *clean room* de como Protoboard (breadboard), Esquemático e PCB compartilham uma única
conectividade elétrica, como as linhas guia (*ratsnest*) são derivadas, e como o CircuitMaster deve
implementar isso sem replicação mutável (portanto sem laços de propagação).

Pré-requisito: documento 01 (identificadores, camadas, conectores, barramentos, `.fz`).

---

## 1. COMPORTAMENTO DE REFERÊNCIA (FRITZING 1.0.8)

### 1.1 Cada item existe nas três vistas

Todo item (peça, fio, trilha, via, símbolo, breadboard) é instanciado **nas três vistas** com o mesmo
identificador ($id = modelIndex \times 10$). O que muda por vista é a **visibilidade** e a geometria.

**Peças invisíveis por vista** (existem, conduzem, mas não são desenhadas nem participam do ratsnest):

| Vista | Tipos invisíveis |
|---|---|
| Breadboard | símbolos (alimentação, terra, net label), subpartes esquemáticas, jumper de PCB, plano de cobre, logos (exceto `moduleId` contendo `breadboard`), furos, vias |
| Esquemático | breadboards/perfboards/stripboards, jumper, plano de cobre, vias, furos, pads, logos (exceto `moduleId` contendo `schematic`) |
| PCB | breadboards/perfboards/stripboards, símbolos, subpartes esquemáticas, moldura esquemática, `…PowerModuleID` |

Peças cuja vista não declara nenhuma camada daquela vista (ex.: breadboard com `layerId="breadboardbreadboard"`
em `pcbView`) também ficam sem desenho, mas existem.

**Fios visíveis por vista**:

| Vista | Fio visível se |
|---|---|
| Breadboard | não é trilha (fios `Normal` e linhas de ratsnest) |
| Esquemático | é ratsnest **ou** tem `SchematicTraceFlag` |
| PCB | é ratsnest **ou** tem `PCBTraceFlag` |

Consequência: um fio desenhado na breadboard existe como fio **invisível** no esquemático e na PCB, ligado aos
mesmos conectores; uma trilha de PCB existe invisível na breadboard e no esquemático; e assim por diante.

### 1.2 Propagação entre vistas (e por que não há laço)

- Cada ação do usuário vira um comando desfazível com um tipo de alcance: **CrossView** (aplicar nas três
  vistas) ou **SingleView** (só na vista de origem; usado para linhas de ratsnest e ajustes locais de
  geometria).
- A vista de origem executa o comando e **emite** o evento; as duas outras vistas aplicam o mesmo efeito com a
  emissão desligada. A profundidade de propagação é exatamente 1 e o grau de saída é 2 → não existe caminho de
  volta, logo não há laço.
- Operações replicadas: adicionar/remover item, conectar/desconectar `(id, conectorId) ↔ (id, conectorId)`,
  conectar/desconectar ponta de fio, trocar peça (*swap*), mudar propriedade, mudar rótulo, mudar voltagem,
  mudar resistência, mudar rótulos de pinos, apagar trilhas, mudar número de camadas da placa, "limpar fios"
  (recalcular ratsnest e estado de roteamento), verificar aderência (*sticky*), seleção.
- Conexões são endereçadas por `(id do item, id do conector, face)`; a face só importa na PCB
  (`copper0`/`copper1`).
- Posição de peça nova vinda de outra vista: mesma posição relativa à origem visível da janela de destino,
  alinhada à grade se a grade estiver ativa.

### 1.3 Persistência

O `.fz` guarda as conexões **por vista** (cada `<breadboardView>`, `<schematicView>`, `<pcbView>` de cada
instância lista seus `<connects>`). Na carga, cada vista reconstrói suas conexões **apenas** a partir da sua
própria seção, deduplicando pares já ligados. Não há reconciliação entre vistas na carga: um arquivo com
conexões inconsistentes entre vistas abre inconsistente. O CircuitMaster deve, portanto, **gravar as três
listas completas e coerentes** (seção 7.3).

---

## 2. MODELO MATEMÁTICO DO GRAFO DE CONECTIVIDADE

### 2.1 Vértices — portas

Uma **porta** é o par (conector, porta física):

- fora da PCB, cada conector tem uma porta;
- na PCB, conectores THT e vias têm duas portas (`copper0`, `copper1`); SMD tem uma porta ativa (na face
  da peça) — a face oposta existe mas só é usada quando a peça vai para baixo;
- cada ponta de fio é um conector com uma porta (`connector0`, `connector1`).

### 2.2 Arestas

O multigrafo global $G = (P, E)$ tem as arestas:

| Tipo | Arestas | Origem |
|---|---|---|
| **W** fio interno | `connector0` — `connector1` de cada fio (fio tem barramento interno) | `wire.fzp` |
| **A** fixação | ponta de fio — porta de conector de peça | desenho do usuário |
| **C** cadeia | ponta de fio — ponta de fio (ponto de dobra, junção) | desenho do usuário |
| **S** encaixe | porta macho/pad — porta fêmea (pino no furo) e perna elástica — furo | sobreposição na breadboard |
| **B** barramento | todos os pares de um `<bus>` estático da peça; jumper de PCB (`jumperbus`) | `.fzp` |
| **D** barramento dinâmico | furos de um mesmo trecho de stripboard; membros de subparte ↔ superparte com o mesmo `connectorId` | estado da instância |
| **L** travessia de face | `copper0` — `copper1` do mesmo conector THT/via | PCB |
| **Y** símbolo | conectores de net labels com o mesmo rótulo; de símbolos de alimentação com a mesma voltagem; de símbolos de terra entre si (doc 01, 8.9) | propriedades |

As arestas A, C e S carregam a **vista de origem** $h$ (onde foram criadas) e o tipo do fio envolvido.

### 2.3 Nets

$$\mathcal{N} = \text{componentes conexas de } G \text{ (todas as arestas)}$$

Membros relatados de uma net $N$ (os "nós" do netlist): portas de **peças** (tipos peça, breadboard, placa,
via, jumper, plano de cobre e — só no esquemático — símbolos e subpartes), excluindo conectores `hybrid`,
fios, notas, logos, furos, réguas e separadores. Portas L de um mesmo conector contam uma vez.

**Projeção por vista.** Uma aresta só existe na vista $v$ se as duas pontas têm porta em $v$. Conectores podem
não ter porta numa vista: peça cuja vista PCB só declara camadas não cobre (instrumentos do simulador —
multímetro, osciloscópio, pontas de prova — em `partimage`), `<p>` ausente para a vista, caixa nula na camada.
Logo, por vista:

$$\mathcal{N}_v = \text{componentes de } G_v^{*},\qquad G_v^{*} = \{\,e \in E : \text{as duas pontas de } e \text{ têm porta em } v\,\}$$

Na grande maioria dos circuitos $\mathcal{N}_{bb} = \mathcal{N}_{sch} = \mathcal{N}_{pcb}$; o que difere por vista é
quais membros são visíveis e quais ligações já estão "roteadas" ali. Medição nos 124 sketches de exemplo: 110
têm as três partições idênticas; nos 14 restantes a diferença vem de instrumentos sem porta na PCB (9 sketches
do simulador) e de arestas presentes só na breadboard em arquivos antigos (5 sketches com Arduino).

Filtro ERC na exportação de netlist: conector com `erc ignore="always"` sai da net; com
`ignore="ifUnconnected"` sai se for o único membro. Nets vazias são descartadas.

### 2.4 Relação "roteado na vista $v$"

Seja $\tau(v)$ o tipo de fio próprio da vista: breadboard → `Normal`; esquemático → `SchematicTrace`;
PCB → `PCBTrace`. O subgrafo roteado $G_v \subseteq G$ contém:

- arestas W, A, C **somente de fios com tipo $\tau(v)$** (fios de outros tipos e ratsnest não contam);
- arestas S **somente na breadboard** (nas outras vistas, conexões diretas peça–peça não contam como
  roteamento — por isso um CI espetado numa breadboard gera ratsnest no esquemático e na PCB);
- arestas B, D, L, Y sempre.

$R_v$ = relação de equivalência "conectado em $G_v$".

### 2.5 Ratsnest da vista $v$

Para cada net $N \in \mathcal{N}$:

1. $V = $ membros de $N$ cuja peça é **visível** em $v$ (deduplicando portas L do mesmo conector; mantém a
   primeira encontrada).
2. Se $|V| < 2$: nenhuma linha.
3. Grafo completo sobre $V$ com peso

$$
w(a,b)=\begin{cases}
0 & \text{se } a,b \text{ são da mesma peça e do mesmo barramento}\\
0 & \text{se } a \mathrel{R_v} b\\
\lVert P_a - P_b \rVert^2 & \text{caso contrário}
\end{cases}
$$

   onde $P_a$ é o ponto terminal de $a$ na cena da vista $v$ (documento 01, seção 3.7; ponta da perna para
   conectores com perna).
4. Árvore geradora mínima (Prim). **Linhas de ratsnest = arestas da árvore com peso > 0.**
   (Pares de conectores não ligados mas exatamente sobrepostos têm peso 0 e não geram linha — reproduzir.)
5. Ligações entre conectores da mesma peça e mesmo barramento nunca geram linha (exceto quando forçado ao
   converter ratsnest em trilha).

As linhas são itens virtuais da vista (`RatsnestFlag`), nunca salvos, com geometria de reta da ponta $P_a$ à
$P_b$, tracejadas, com opacidade e largura configuráveis por vista.

### 2.6 Cor do ratsnest

1. Se algum membro da net tem nome de conector reconhecido: `gnd`/`ground` → preto `#000000`;
   `3v3`/`+5v` → vermelho `#cc1414` (comparação em minúsculas).
2. Senão, se a net já tinha uma linha com cor não nomeada, mantém a cor anterior (estabilidade visual).
3. Senão, a próxima cor da paleta da vista (cíclica, só cores com valor de ratsnest definido). Paletas:
   breadboard/esquemático `#157de6, #cc1414, #000000, #00a527, #25cc35, #ef6100 (bb) / #ff7300 (sch),
   #a37911, #33ffc5, #ab58a2, #8c3b00, #fa50e6`; PCB `#157de6, #cc1414, #000000, #1fb551, #a37911, #33ffc5,
   #ab58a2, #8c3b00, #fa50e6`.

### 2.7 Estado de roteamento

Por vista, para cada net com $|V| \ge 2$ e pelo menos uma "ligação de usuário" (membros em peças diferentes,
ou na mesma peça sem barramento comum):

- grafo $H$ sobre $V$ com arestas: portas L do mesmo conector; símbolo–símbolo visíveis; mesma peça e mesmo
  barramento; conexão direta peça–peça visível (apenas se $\tau(v)$ = `Normal`); através de breadboard
  visível (percorrendo barramentos e conexões diretas da breadboard); através de cadeias de fios do tipo
  $\tau(v)$;
- $k$ = número de componentes de $H$;
- `netCount += 1`; `connectorsLeftToRoute += k − 1`; `netRoutedCount += 1` se $k = 1$;
- `jumperItemCount` = conectores de jumpers encontrados / 4 (cada jumper tem 2 conectores × 2 faces).

Mensagem: nenhuma net → "Sem conexões para rotear"; todas roteadas → "Roteamento concluído" (com "usando N
jumpers" se houver); senão "X de Y nets roteadas — Z conexões ainda por rotear".

---

## 3. CONEXÃO GEOMÉTRICA (ENCAIXE NA BREADBOARD)

Só a breadboard conecta peças por sobreposição; esquemático e PCB nunca conectam peça com peça por contato.

### 3.1 Teste de encaixe

Ao soltar uma peça (ou uma perna elástica), para cada conector $c$ da peça:

1. Ponto de prova = ponto terminal de $c$ na cena (para fios, usa-se a caixa inteira da ponta).
2. Candidatos = conectores de **outros** itens cuja forma contém o ponto de prova, e que:
   - passam na regra de tipo (doc 01, 2.6: `unknown` nunca; `wire` sempre; senão tipos diferentes);
   - passam na regra da peça dona (ex.: camadas de cobre compatíveis na PCB);
   - não são ponta de fio já conectada (exceto se $c$ também é de fio — permite ligar em dobras);
   - não estão já ligados a $c$.
3. Escolha: um candidato → ele. Vários:
   - se $c$ é de fio: prefere não-fio; depois maior $z$; depois menor distância entre centros;
   - senão: prefere **fêmea**; mesmo tipo → maior $z$.
4. Conexão criada como aresta S (CrossView).

### 3.2 Mover peças na breadboard

- Ao iniciar o arraste, conexões com conectores fêmea de itens que **não** estão sendo movidos são desfeitas
  (exceto pernas elásticas, que esticam e permanecem presas).
- Ao soltar, o teste 3.1 recria as conexões.
- Itens **plugados nos conectores fêmea** de um item movido (peças na breadboard, shields num header fêmea)
  movem-se com ele, recursivamente. Itens apoiados numa base *sticky* (placas com camada `sticky="true"`) só a
  acompanham se o *sticky* local da instância estiver ligado (propriedade local `sticky="true"`; o padrão é
  desligado). Itens travados nunca são arrastados.
- Um fio com as duas pontas presas a itens movidos que se deslocam igualmente é transladado inteiro, curva
  incluída; senão cada ponta é reposicionada e os pontos de controle ficam onde estão na cena.
- Fios ligados a uma peça movida acompanham a ponta (a ponta é reposicionada no novo ponto terminal); em todas
  as vistas, uma ponta de fio ligada a um conector fica sempre sobre o ponto terminal desse conector.

### 3.3 Pernas elásticas

Peça com pernas, ao soltar sobre a breadboard, conecta pela **ponta** da perna; enquanto ligada a um furo, a
ponta acompanha o furo e a perna estica/dobra. As curvas Bézier por segmento são preservadas.

---

## 4. EDIÇÃO DE FIOS E TRILHAS

Termos: **ponta** = conector `connector0`/`connector1` de um fio; **dobra** (*bendpoint*) = ponto onde pontas de
fios se encontram ligadas só entre si (aresta C); **junção** = dobra com três ou mais pontas; **cadeia direta**
de um fio = fios alcançáveis atravessando pontas que só ligam fios (dobras e junções só de fios), parando em
pontas ligadas a qualquer outra peça.

1. **Criar**: arrastar a partir de um conector (botão esquerdo) cria um fio do tipo $\tau(v)$ da vista corrente
   com a primeira ponta no ponto terminal do conector. Ao soltar sobre um conector válido (3.1 com $c$ = ponta do
   fio), a ponta é posta no ponto terminal dele e conecta; ao soltar no vazio, a ponta fica **solta** (o fio
   existe, conduz entre suas pontas e não liga nada). O fio e suas conexões são CrossView.
2. **Criar a partir de ratsnest**: clicar/arrastar uma linha de ratsnest (ou o item de menu "Criar fio/trilha a
   partir do ratsnest") cria um fio/trilha $\tau(v)$ ligando os dois conectores da linha.
3. **Arrastar ponta**: botão esquerdo numa ponta. Se a ponta é uma dobra, todas as pontas da dobra se movem
   juntas e as ligações entre elas são mantidas. Senão, a ponta se desliga de tudo e acompanha o cursor; ao
   soltar, reconecta pela regra 3.1 (ou fica solta). Com **Shift**, a ponta é restrita à direção horizontal,
   vertical ou ±45° em relação à outra ponta do mesmo fio (a projeção mais próxima do cursor); numa dobra com
   Shift, se o cursor está a até 12 px de um canto ortogonal formado com a outra ponta de um dos fios vizinhos,
   a dobra encaixa nesse canto. Com a grade ativa, a ponta é alinhada à grade.
4. **Arrastar o corpo**: botão esquerdo no corpo de um fio que tem alguma conexão cria uma dobra no ponto agarrado
   e a arrasta (o fio vira dois fios ligados por aresta C). Com **Ctrl** (ou com "fios curvos" ligado na vista,
   quando Ctrl inverte), o arraste curva o fio numa Bézier cúbica em vez de dobrar. Com **Alt**, um trecho
   cujas duas pontas só ligam outros fios é arrastado inteiro (os vizinhos esticam). Um fio sem nenhuma conexão
   é movido inteiro.
5. **Dobra por duplo clique**: duplo clique no corpo do fio divide-o no ponto clicado: o fio original fica de
   `connector0` até o ponto e um fio novo, com a mesma cor, largura e vista, vai do ponto até a antiga
   `connector1` (herdando as conexões dela). Se o fio é curvo, a Bézier é dividida no parâmetro $t$ mais próximo
   do ponto (De Casteljau) e cada metade mantém sua curva.
6. **Remover dobra**: duplo clique numa dobra onde se encontram **exatamente duas** pontas (e nada mais), ou o
   item "Remover dobra" do menu, une os dois fios num só, reto, da ponta distante do primeiro até a ponta
   distante do segundo, preservando as conexões dessas pontas.
7. **Endireitar curva**: remove a Bézier do fio.
8. **Arrastar fio a partir de uma dobra**: **Alt** + arrastar numa dobra cria um fio novo saindo dela.
9. **Apagar**: "Apagar" de uma peça remove a peça **e a cadeia direta de cada fio ligado a ela**, em todas as
   vistas; "Apagar sem fios" (*Delete Minus*) remove só a peça e deixa pontas soltas. "Apagar fio" remove a
   cadeia direta do fio; "Apagar fio até as dobras" remove só aquele trecho. Itens travados não são apagados.
10. **Apagar linha de ratsnest** = remover a conexão elétrica subjacente nas vistas onde ela é invisível. Regra
   (corte mínimo): construir um grafo de fluxo entre as duas peças da linha onde
   - fios e conexões fêmea **visíveis na vista corrente** têm capacidade 1000,
   - fios/conexões **invisíveis** na vista corrente são substituídos pelos seus equivalentes nas vistas onde são
     visíveis, baratos de cortar: o fio invisível (aresta entre suas duas pontas) tem capacidade **1** e cada
     ligação invisível capacidade **2**, de modo que o corte prefere apagar o fio inteiro a deixar uma ponta solta,
   - barramentos e travessias de face têm capacidade 1000;
   calcular o fluxo máximo (Edmonds–Karp) e remover as arestas do corte mínimo (lado alcançável a partir da
   origem × resto). Na prática, apagar o ratsnest de um esquemático remove o fio de breadboard (ou a trilha de
   PCB) que o causava, preferindo nunca remover o que está visível onde o usuário está.
11. **Pernas elásticas** (breadboard): arrastar a ponta da perna estica a perna (o polígono ganha o novo último
    vértice); duplo clique num segmento da perna insere um vértice; duplo clique num vértice interno o remove;
    ao soltar a ponta sobre um conector fêmea, conecta (3.1). As curvas por segmento são preservadas.
12. Trilhas de PCB só conectam em portas da mesma face (exceto via e THT). Trilhas geradas pelo autorouter levam
   `AutoroutableFlag` (doc 03).

### 4.1 Aparência dos fios

Cores nomeadas (breadboard e esquemático; o esquemático não oferece `white`): nome → cor do fio / sombra.

| Nome | Breadboard (fio / sombra) | Esquemático (fio / sombra) |
|---|---|---|
| blue | `#418dd9` / `#1b5bb3` | `#418dd9` / `#418dd9` |
| red | `#cc1414` / `#8c0000` | `#cc1414` / `#cc1414` |
| black | `#404040` / `#000000` | `#404040` / `#404040` |
| yellow | `#fff800` / `#d6d63a` | `#fff800` / `#d6d63a` |
| green | `#25cc35` / `#00a527` | `#25cc35` / `#00a527` |
| grey | `#999999` / `#666666` | `#999999` / `#666666` |
| white | `#ffffff` / `#999999` | — |
| orange | `#ef6100` / `#ad6a38` | `#ff7300` / `#d65b00` |
| ochre | `#a37911` / `#846521` | `#a37911` / `#846521` |
| cyan | `#33ffc5` / `#00a0c6` | `#33ffc5` / `#00a0c6` |
| brown | `#8c3b00` / `#6c2710` | `#8c3b00` / `#6c2710` |
| purple | `#ab58a2` / `#7a3a73` | `#ab58a2` / `#7a3a73` |
| pink | `#fa50e6` / `#dc00dc` | `#fa50e6` / `#dc00dc` |

- Fio de breadboard: traço de sombra (cor da sombra, largura $w + 2$ px) sob o traço principal (largura $w$),
  ambos com terminação redonda. Trilhas de esquemático e de PCB não têm sombra. Cor desconhecida ⇒ sombra =
  cor escurecida.
- Trilha de PCB: face de cima `#f2c600`, face de baixo `#f28a00`.
- Junção no esquemático (três ou mais pontas no mesmo ponto): ponto cheio de diâmetro $w + 1$.

### 4.2 Estado visual dos conectores

Na vista $v$, um conector com alguma conexão própria da vista é pintado sobre a peça (retângulo do pino; para
pontas de fio, a ponta) conforme o grupo de mesmo potencial **roteado** na vista (conexões próprias, fios da
vista, barramentos):

- o grupo toca **duas ou mais peças** que não são fios ⇒ verde `#00ff00`, opacidade 0,2;
- senão ⇒ vermelho `#ff0000`, opacidade 0,3 (ex.: fio que só chega numa fileira vazia da breadboard).

Conectores fêmea sem conexão própria não são pintados.

## 5. TROCA DE PEÇA (*SWAP*) E MUDANÇA DE BARRAMENTO

- *Swap* substitui a instância por outra peça (mudança de família/propriedade): as conexões são transferidas
  por `connectorId` igual (ou pelo mapa `replacedby` dos conectores); conectores sem correspondente perdem as
  conexões. O alinhamento usa o ponto de pino do corpo (ignorando pernas).
- Mudança de barramento dinâmico (corte de tira de stripboard, mudança de layout): reconstrói as arestas D da
  instância e marca as nets afetadas para recomputação do ratsnest.
- Mudança de rótulo de net label, de voltagem de símbolo: move o conector de uma classe Y para outra.

---

## 6. ARQUITETURA DO MOTOR DE NETLIST NO CIRCUITMASTER

### 6.1 Princípio

Uma **única fonte da verdade topológica** e **três projeções derivadas**. Nada é replicado entre vistas, logo
não existe propagação nem possibilidade de laço: cada vista apenas *lê* a topologia e calcula seus derivados.

### 6.2 Armazenamento (orientado a dados / ECS)

Tabelas densas (Rust/WASM, `Vec` + índices estáveis; espelhadas em TypeScript como `TypedArray`):

| Tabela | Colunas principais |
|---|---|
| `Instance` | `modelIndex`, `moduleRef`, `title`, props locais, flags (bottom, locked) |
| `InstanceView` | `instance`, `view`, `x`, `y`, `z`, `transform[6]`, `layer`, visível |
| `Connector` | `instance`, `connectorId` (interno ao módulo), tipo, `bus` |
| `Port` | `connector`, `view`, `face` (0/1/—), `rect`, `terminal`, `leg` (opcional) |
| `Wire` | `instance`, `kind` (`Normal`/`SchematicTrace`/`PCBTrace`), `homeView`, `face`, flags |
| `WireGeom` | `wire`, `view`, `p0`, `p1`, `bezier`, `width`, `color` |
| `Edge` | `a: Port`, `b: Port`, `type` (A/C/S), `originView` |
| `BusMember` | `instance`, `busId`, `connector` (estático, dinâmico, subparte) |
| `SymbolClass` | `key` (`label:<texto>` / `volt:<µV>` / `gnd`), `connector` |

Arestas W, B, D, L e Y **não** são materializadas como `Edge`: são implícitas pelas tabelas `Wire`,
`BusMember`, `Port` (duas faces) e `SymbolClass`.

### 6.3 Conectividade incremental

- Estrutura: *union-find* sobre conectores (não portas — as portas L de um conector são sempre unidas) com
  versão por componente.
- Inserção de aresta (A, C, S, membro de barramento, membro de classe Y): `union` em $O(\alpha(n))$; a net
  resultante fica **suja**.
- Remoção de aresta: marcar a net suja e **recomputar só essa componente** por BFS a partir dos seus membros
  (nets são pequenas; o custo é linear na net). Para sketches enormes, substituir por conectividade dinâmica
  (Holm–de Lichtenberg–Thorup) sem mudar a interface.
- Para cada vista $v$, um segundo *union-find* restrito a $G_v$ (seção 2.4), mantido do mesmo modo.

### 6.4 Ratsnest incremental

Para cada net suja e cada vista:

1. $V$ = membros visíveis; classes iniciais = classes de $R_v$ ∪ (mesma peça, mesmo barramento).
2. Se $|V| \le 64$: Prim $O(|V|^2)$ (equivalente direto ao de referência).
3. Se maior: triangulação de Delaunay dos pontos terminais e Kruskal sobre as arestas de Delaunay com o
   *union-find* pré-unido pelas classes. Correto porque cada aresta escolhida é a mais curta que cruza um corte
   do conjunto de pontos, e essa aresta pertence à árvore euclidiana mínima, que está contida na triangulação.
4. Emitir linhas (pares de portas) para o renderizador da vista; cor pela regra 2.6.

Mover uma peça só suja as nets dos seus conectores (pesos mudam, topologia não).

### 6.5 Transações e desfazer

- Toda edição é uma transação de operações primitivas: `AddInstance`, `RemoveInstance`, `Connect(a,b,tipo)`,
  `Disconnect(a,b)`, `SetGeom(view, …)`, `SetProp`, `SetBus`, `SetSymbolKey`.
- A loja (Zustand + *patches* imutáveis no lado TS; *journal* de operações no lado Rust) guarda o inverso de
  cada transação; desfazer aplica o inverso e reprocessa as nets sujas.
- Derivados (nets, ratsnest, estado de roteamento, DRC) nunca são desfeitos: são recalculados.
- O renderizador assina apenas os derivados da sua vista.

---

## 7. COMPATIBILIDADE COM `.fz`

### 7.1 Carga

1. Criar instâncias e geometria por vista.
2. Para cada vista, ler `<connects>` e criar as arestas com `originView` = vista lida; deduplicar pares e
   pares recíprocos.
3. **Unificar**: uma aresta presente em qualquer vista entra no grafo global uma vez; cada vista enxerga a sua
   projeção $G_v^{*}$ (seção 2.3). Se uma aresta realizável em $v$ (as duas portas existem lá) não estiver na
   seção de $v$ do arquivo, o arquivo é inconsistente: registrar aviso com a lista de diferenças e adotar a
   **união** (no Fritzing a conexão existiria em pelo menos uma vista).
4. Fios ligados a portas inexistentes na vista (ex.: via referenciada na breadboard) são ligados à porta
   equivalente do conector; se o conector não existe na peça, a ponta fica solta.

### 7.2 Classificação da vista de origem

`homeView` do fio vem de `wireFlags`: `PCBTrace` → PCB; `SchematicTrace` → esquemático; senão breadboard.

### 7.3 Gravação

Para cada instância e **cada uma das três vistas**:

- escrever a geometria da vista (para fios fora da vista de origem: segmento entre os pontos terminais dos
  conectores ligados naquela vista; ponta solta mantém a última geometria conhecida);
- escrever `<connects>` com **todas** as arestas do grafo que tocam a instância, resolvendo a camada do alvo
  na vista em questão (`breadboardbreadboard` para breadboards, `copper0`/`copper1` conforme a face na PCB,
  `breadboardWire`/`schematicTrace`/`copper0trace`/`copper1trace` para fios);
- conexões recíprocas nos dois lados; nunca escrever linhas de ratsnest.

Os valores de camada e largura usados pelo Fritzing para fios fora de sua vista de origem (ex.: fio de
breadboard na PCB com `layer="copper1trace"`, `mils="11.1111"`, cor `#f28a00`) devem ser reproduzidos para que
o arquivo reabra idêntico no Fritzing.

---

### 7.4 Exportação do netlist XML

```xml
<?xml version='1.0' encoding='UTF-8'?>
<!-- comentário de autoria do CircuitMaster -->
<netlist sketch="<arquivo>" date="<ISO 8601>">
  <net>
    <connector id="connector0" name="pin 1">
      <part id="<modelIndex × 10>" label="R1" title="220Ω Resistor"/>
      <erc etype="VCC"><voltage value="5"/><current flow="source" valueMax="0.1"/></erc>
    </connector>
  </net>
</netlist>
```

- Uma `<net>` por grupo de conectores equipotenciais **da vista corrente** (mesma conectividade do ratsnest,
  incluindo barramentos e classes de símbolo), só com conectores de peças visíveis na vista (fios não entram).
- Conectores com `<erc ignore="always">` na peça saem sempre; com `ignore="ifunconnected"` saem quando a net tem um
  único conector; nets vazias somem.
- `<erc>` só é escrito para `etype` `VCC` (com `voltage` e `current`) ou `ground` (com `current`), copiando os
  valores do `.fzp`.

## 8. CASOS DE BORDA

1. Peça com um único conector ligado a nada: net unitária (só aparece na exportação com singletons).
2. Dois pinos da mesma peça no mesmo barramento: nunca geram ratsnest entre si; contam como "roteados".
3. Breadboard invisível na PCB: conexões via breadboard geram ratsnest na PCB e no esquemático, não
   "roteamento".
4. Net labels com o mesmo texto em vistas diferentes: a classe Y é global (o texto é propriedade da instância,
   igual nas três vistas).
5. Símbolo de alimentação com conector `GND`: esse conector vale 0 V e entra na classe de terra.
6. Pernas elásticas: o ponto do ratsnest é a ponta da perna.
7. Peça SMD na face de baixo: a porta ativa é `copper0`; trilha `copper1trace` não conecta nela.
8. Fio com uma ponta solta: conduz entre suas pontas, mas não liga nada; não gera ratsnest.
9. Remoção de peça: "Apagar" leva junto a cadeia direta dos fios ligados (4.9); "Apagar sem fios" remove só as
   arestas da peça e os fios ficam com pontas soltas.
10. Conectores exatamente sobrepostos e não ligados: peso 0 → sem linha (comportamento de referência).

---

## 9. PLANO DE TESTES

1. **Equivalência de nets entre vistas**: para os 124 sketches de exemplo, as partições $\mathcal{N}_v$
   calculadas a partir das conexões de cada vista devem ser iguais às projeções $G_v^{*}$ do grafo unificado.
   Linha de base medida com um protótipo: 110 sketches com partições idênticas nas três vistas; os 14 restantes
   explicados por instrumentos sem porta na PCB (9) e arestas só na breadboard em arquivos antigos (5).
2. **Netlist de referência**: comparar a exportação XML de netlist (estrutura `netlist/net/connector@id@name/
   part@id@label@title` + `erc`) com a do grafo do CircuitMaster, módulo ordem.
3. **Ratsnest**: para cada vista e net, o multiconjunto de pesos das arestas da árvore deve coincidir com o do
   algoritmo de referência (árvores diferentes com o mesmo custo são aceitas).
4. **Estado de roteamento**: `netCount`, `netRoutedCount`, `connectorsLeftToRoute`, `jumperItemCount` iguais
   aos do Fritzing para cada sketch.
5. **Propriedade de não-laço**: teste de propriedade — sequência aleatória de 10⁴ transações seguida de
   desfazer total deve retornar ao estado inicial byte a byte, com o número de recomputações de net limitado
   pelo número de nets sujas por transação.

---

## 10. MENUS DE CONTEXTO E COMANDOS DE EDIÇÃO

Botão direito sobre um item abre o menu do tipo do item na vista corrente; o item clicado passa a ser a seleção
se ainda não fazia parte dela. Itens indisponíveis aparecem desabilitados (não somem), exceto onde indicado.

### 10.1 Peça

| Item | Atalho | Vistas | Regra |
|---|---|---|---|
| Girar ▸ 45° horário · 90° horário · 180° · 90° anti-horário · 45° anti-horário | `]` 90° horário, `[` 90° anti-horário | todas | desabilitado para peça travada; 45° desabilitado para breadboards |
| Espelhar horizontal · Espelhar vertical | `\|` horizontal | esquemático | só se a vista da peça permite (`fliphorizontal`/`flipvertical`) e a peça não está travada |
| Elevar e rebaixar ▸ Trazer para frente · Avançar · Recuar · Enviar para trás | `Ctrl+Shift+]`, `Ctrl+]`, `Ctrl+[`, `Ctrl+Shift+[` | todas | desabilitado se todos os itens estão selecionados |
| Travar peça (marcável) | — | todas | travada não move, não gira, não espelha, não é apagada |
| Sticky (marcável) | — | todas | visível só para peça com camada sticky; ligado ⇒ itens apoiados se movem junto |
| Copiar · Duplicar · Apagar · Apagar sem fios | `Ctrl+C`, `Ctrl+D`, `Delete`/`Backspace`, `Alt+Backspace` | todas | 4.9 |
| Editar (novo editor de peças) | — | todas | habilitado se a peça é editável |
| Adicionar ao bin ▸ (bins abertos graváveis) | — | todas | — |
| Mostrar/Ocultar rótulo da peça | — | todas | texto conforme o estado; só para peças com rótulo |
| Ocultar/Mostrar serigrafia da peça | — | PCB | só se a peça tem camada de serigrafia |
| Converter via em dobra | — | PCB | visível só para via; habilitado com duas ou mais trilhas ligadas |
| Definir semente de preenchimento de terra (marcável) · Limpar sementes | — | PCB | sobre um conector |

Rotação de $\theta$ em torno do centro da caixa da peça na cena (transformação acumulada na instância); espelhar
é escala $-1$ no eixo, em torno do mesmo centro. Fios ligados acompanham as pontas (3.2). Na breadboard, após
girar/espelhar aplica-se o encaixe 3.1.

Ordem em $z$: os itens da vista são ordenados por $z$; "Avançar"/"Recuar" troca cada selecionado com o vizinho
imediato **da mesma camada**; "Trazer para frente"/"Enviar para trás" leva ao extremo da camada; depois os $z$ da
camada são renumerados como $z_{camada} + k\cdot\Delta z$ preservando a ordem.

### 10.2 Fio, trilha e ratsnest

| Item | Breadboard | Esquemático | PCB | Regra |
|---|---|---|---|---|
| Elevar e rebaixar ▸ | ✓ | ✓ | ✓ | desabilitado em ratsnest |
| Cor do fio ▸ (4.1, marcando a atual) | ✓ | ✓ (sem white) | — | — |
| Mover para a outra face (Mover para a face de baixo/de cima) | — | — | ✓ | placa com 2 camadas e trilha que pode trocar de face |
| Criar fio a partir do ratsnest / Criar trilha a partir do ratsnest | ✓ | ✓ | ✓ | só em ratsnest |
| Não rotear automaticamente (marcável) | — | ✓ | ✓ | só em trilha |
| Apagar fio / Apagar linha de ratsnest | ✓ | ✓ | ✓ | 4.9 / 4.10 |
| Apagar fio até as dobras | ✓ | ✓ | ✓ | não em ratsnest |
| Adicionar dobra / Remover dobra | ✓ | ✓ | ✓ | "Remover" quando o clique foi numa dobra; não em ratsnest |
| Converter dobra em via | — | — | ✓ | numa dobra |
| Endireitar curva | ✓ | ✓ | ✓ | só se o fio é curvo |

### 10.3 Atalhos gerais

`Ctrl+Z`/`Ctrl+Shift+Z` desfazer/refazer, `Ctrl+X` recortar, `Ctrl+C` copiar, `Ctrl+V` colar (deslocado),
`Ctrl+Shift+V` colar no lugar, `Ctrl+D` duplicar, `Ctrl+A` selecionar tudo, `Delete`/`Backspace` apagar,
`Alt+Backspace` apagar sem fios, `[`/`]` girar 90°, `Escape` cancelar o arraste/limpar a seleção, setas movem a
seleção 1 px, ou 1 passo de grade com o alinhamento ligado (`Shift` multiplica por 10).

Colar: as peças coladas recebem novos `modelIndex` e títulos; as arestas entre itens copiados são recriadas; as
arestas para itens fora da cópia são descartadas; a $k$-ésima colagem seguida (k = 0, 1, …) desloca o conjunto de
$(20 + 20k,\ -20 + 20k)$ px (colar no lugar não desloca).

### 10.4 Barra de menus

Mesma organização da referência, com os rótulos do CircuitMaster em português:

| Menu | Itens (atalho) |
|---|---|
| Arquivo | Novo (`Ctrl+N`) · Abrir… (`Ctrl+O`) · Exemplos ▸ · Salvar (`Ctrl+S`) · Exportar ▸ |
| Exportar ▸ | Como imagem ▸ PNG · JPG · SVG · PDF; Para produção ▸ Gravável PDF · Gravável SVG · Gerber estendido (RS-274X) · Pick-and-place; Lista de materiais (HTML) · Lista de materiais (CSV) · Lista de materiais (PDF); Netlist IPC-D-356A; Netlist XML; Netlist SPICE |
| Editar | Desfazer · Refazer · Recortar · Copiar · Colar · Colar no lugar · Duplicar · Apagar · Apagar sem fios · Selecionar tudo · Desmarcar · Adicionar nota |
| Peça | Editar (editor de peças) · Girar ▸ · Espelhar · Elevar e rebaixar ▸ · Alinhar ▸ (esquerda, centro horizontal, direita, topo, centro vertical, base) · Travar peça · Sticky · Mostrar rótulo |
| Exibir | Ampliar (`Ctrl++`/`Ctrl+=`) · Reduzir (`Ctrl+-`) · Enquadrar (`Ctrl+0`) · Tamanho real (`Shift+Ctrl+0`) · Alinhar à grade · Mostrar grade · Protoboard/Esquemático/PCB (`Ctrl+1/2/3`) |
| Roteamento (PCB) | Autorotear (`Shift+Ctrl+A`) · DRC (`Shift+Ctrl+D`) · Configurações do autorouter/DRC · Preenchimento ▸ Preencher com cobre · Preencher com terra · Remover preenchimento · Definir sementes · Limpar sementes · Folga do preenchimento; Mover trilha para a outra face · Não rotear automaticamente; Selecionar todas as trilhas · vias · preenchimentos; Apagar trilhas autoroteadas |
| Roteamento (esquemático) | Autorotear · Não rotear automaticamente · Selecionar todos os fios |
| Roteamento (breadboard) | Selecionar todos os fios |

Exportações sem placa na PCB (Gerber, gravável, pick-and-place, IPC) ficam desabilitadas e explicam o motivo.

### 10.5 Notas

- Uma nota existe só na vista em que foi criada (o `.fz` grava apenas essa vista); `geometry` traz `x`, `y`,
  `width`, `height` (px) e `<text>` o HTML rico.
- Aparência de referência: retângulo `#ffe9c8`, canto superior direito dobrado (triângulo de 7 px em `#fabc4f`),
  borda inferior de 7 px em `#fabc4f`; texto padrão Noto Sans 8,5 pt cinza, entrelinha 90 %, área de texto
  deslocada (3,5 px, 3,5 px) com largura $w - 7$; tamanho inicial 140 × 45 px; alça de redimensionar no canto
  inferior direito; o tamanho mínimo é o do texto mais a alça.
- O HTML vindo do arquivo é dado não confiável: só marcação de formatação (parágrafo, `span`, negrito, itálico,
  sublinhado, listas, quebra, link `http`/`https`/`mailto`) e estilos de texto sobrevivem; `pt` é convertido
  para px de cena (×90/72).
- "Adicionar nota" cria a nota no centro da vista visível; duplo clique edita o texto; apagar, copiar, colar e
  mover seguem as regras de peça.
