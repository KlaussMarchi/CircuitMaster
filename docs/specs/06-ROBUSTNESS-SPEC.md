# 06 — ROBUSTEZ

Como o CircuitMaster não trava, não perde trabalho e dá saída para todo erro: workers vigiados, limites de erro na
interface, arquivos como fronteira de confiança, armazenamento do usuário, salvamento automático com recuperação e
histórico de desfazer. Fase 1 do plano `FRIZING_KICAD.md` (seção 7). Pré-requisitos: docs 01 (pacotes), 02
(documento e edição), 03 e 04 (workers de PCB e de simulação).

---

## 1. PRINCÍPIOS

- **Falha suave nos dados, alta na configuração.** Arquivo ruim, peça ilegível ou worker que cai viram uma mensagem e
  nada mais muda; o que falta para o app funcionar (o WASM do netlist ao iniciar) aparece como "falha ao iniciar".
- **Nenhum pedido sem resposta, nenhuma promessa sem dono.** Todo pedido a um worker termina com resultado ou com a
  causa; `unhandledrejection` e erro de página reprovam os testes E2E.
- **O documento só muda inteiro.** Um arquivo aberto substitui o documento só depois de lido; uma falha no meio de
  uma região da interface não toca no documento.
- **Erro diz a causa e a saída**: "autorouter: o processo de fundo ficou 60 s sem responder e foi reiniciado; tente
  de novo".

## 2. WORKERS VIGIADOS

Indexador, simulador e PCB usam o mesmo cliente (`ui/Supervisor`) e o mesmo servidor (`workers/Serve`).

### 2.1 Protocolo

| Direção | Mensagem |
|---|---|
| app → worker | `{ ...pedido, id }` |
| worker → app | `{ id, result }` · `{ id, progress }` (autorouter, a cada ciclo) · `{ id, error }` (o trabalho lançou) |
| worker → app, sem `id` | estado do próprio worker: `progress`, `ready` e `bin` do indexador |

O `serve` do worker responde todo pedido: o resultado, ou `error` com a mensagem quando o trabalho lança (WASM
abortado, motor que falha). A falha ao carregar o motor (WASM do Clipper, do roteador ou do ngspice) chega a cada
pedido pelo `await`, nunca como rejeição sem dono.

### 2.2 Vigia

O worker é criado no primeiro pedido. Enquanto há pedido em aberto, um vigia de inatividade reinicia a cada mensagem
(qualquer uma prova que o worker está vivo, com ou sem `id`). Os pedidos em aberto terminam com nulo e a causa fica
em `failure` quando:

| Evento | Causa |
|---|---|
| silêncio além do limite (indexador 60 s, PCB 60 s, simulador 15 s) | "o processo de fundo ficou N s sem responder e foi reiniciado" |
| `onerror` do worker (script que não carrega, falta de memória) | "o processo de fundo falhou (mensagem)" |
| `onmessageerror` | "o processo de fundo mandou uma resposta ilegível" |
| resposta `error` | "o processo de fundo falhou (mensagem)" |
| `stop()` do app (Cancelar do autorouter) | vazia: o pedido foi cancelado |

Nos quatro primeiros casos o worker é encerrado, porque o motor pode ter ficado inconsistente, e o pedido seguinte o
recria (o indexador relê o índice do IndexedDB). Parar duas vezes não é erro. Sem pedido em aberto não há vigia: o
indexador pode levar o tempo que for na primeira indexação.

### 2.3 Uso

- **Indexador** (`ui/Catalog`): pedido que falha devolve vazio (`[]` na busca, `{}` no `locate`): a peça fica "não
  encontrada" e o app segue.
- **Simulador** (`ui/Simulator`): devolve a execução com `error` "simulação interrompida: …" (spec 04 §10.2).
- **PCB** (`ui/Pcb`, `createPcbTools`): DRC, preenchimento e autorouter mostram "tarefa: causa; tente de novo" ou
  "tarefa cancelado".
- **Firefox**: o SpiderMonkey acusa `InternalError: too much recursion` numa regex interrompida dentro do worker,
  com a pilha rasa e sob carga; o indexador repete uma vez a leitura de uma peça e a busca quando o erro é esse.

## 3. LIMITES DE ERRO NA INTERFACE

Cada região é envolvida por um `Boundary` (`ui/Boundary`): barra superior, trilho, painel lateral, quadro, doca de
simulação, inspetor, barra de status, diálogo e editor de peças. Uma exceção ao desenhar a região mostra, no lugar
dela e com a mesma área da grade, "‹Região› parou", a mensagem do erro, a garantia de que o circuito não foi alterado
e **Recarregar painel**, que monta a região de novo. Nos dois que se sobrepõem ao app (diálogo e editor de peças) há
também **Fechar**, que tira a janela do estado do app. As outras regiões continuam funcionando.

## 4. ARQUIVOS COMO FRONTEIRA DE CONFIANÇA

- `readFile(nome, bytes)` (`core/Sketch`) lê `.fz`, `.fzb` e os pacotes zip (`.fzz`, `.fzpz`, `.fzbz`): devolve o
  pacote, a causa (texto) ou nulo para o ilegível. Nada lança para fora.
- **Zip-bomba:** o pacote é recusado antes de descompactar se passa de **20.000 arquivos** ou de **256 MB**
  descompactados pelo tamanho declarado. O fflate não escreve além do tamanho declarado, então um zip que declara
  menos sai truncado, sem crescer a memória.
- **Transformações SVG:** número inválido ou resultado não finito invalida o atributo `transform` inteiro, que então
  não transforma, como no SVG; nenhum NaN chega à geometria.
- Leitores sob fuzzing (§8): bytes aleatórios, pacotes truncados, `.fz` e `.fzp` com números estranhos (`NaN`,
  `1e308`, `Infinity`), ids duplicados, 20.000 níveis de aninhamento e lixo no meio.

## 5. ARMAZENAMENTO DO USUÁRIO

- **Dados do usuário** no IndexedDB `circuitmaster-user` (`ui/Vault`), versão 1, com dois depósitos: `parts`
  (arquivos das peças de pacote e do editor, pelo nome do arquivo) e `autosave` (versões, §6). O localStorage guarda
  só o que é pequeno: tema, Meus itens, bins, preferências da simulação.
- **Migração:** as peças que versões anteriores guardaram no localStorage (`circuitmaster.parts`) passam para o
  IndexedDB na abertura e a chave sai; se o IndexedDB falhar, elas ficam onde estão e seguem valendo.
- **Falhas:** cota cheia, banco bloqueado por outra aba ou aba privada viram um motivo ("o armazenamento do
  navegador está cheio") e uma mensagem; a sessão continua com o que tem em memória.
- **Cache do índice do acervo** no IndexedDB `circuitmaster` (`workers/Indexer`): descartável, gravado a cada
  **1.000** peças lidas, para recarregar no meio da primeira indexação aproveitar o que já foi lido.

## 6. SALVAMENTO AUTOMÁTICO E RECUPERAÇÃO

### 6.1 Sessões

Cada aba do navegador é uma sessão com um id aleatório que segura o Web Lock `circuitmaster-session-‹id›` enquanto
vive. Ao abrir, as sessões cujo lock ninguém segura estão mortas (aba fechada ou travada); as vivas, mesmo em outra
aba, não são oferecidas para recuperar. Dentro da sessão, cada sketch aberto (spec 05 §4, abas de sketches) tem a sua
sequência de versões, identificada por `session` e `sheet`.

### 6.2 Versões

| Campo | Conteúdo |
|---|---|
| `id` | tempo com 15 dígitos, o id da sessão e o do sketch |
| `session`, `sheet`, `time` | sessão, sketch (aba) e instante da gravação; versões gravadas antes das abas não têm `sheet` |
| `name`, `count` | nome do sketch e número de itens |
| `dirty` | o documento tinha alterações não salvas |
| `bytes` | o `.fzz` como o Salvar gravaria, com as peças de pacote, montado no worker `workers/Saver` (o texto de 1.000 peças leva centenas de milissegundos) |

Mudança do documento, do nome ou do estado salvo agenda a gravação daquele sketch **1,5 s** depois da última mudança,
com a foto tirada na hora da mudança (trocar de aba não mistura os sketches); esconder ou fechar a aba grava na hora
tudo o que está agendado. Uma versão nova entra no histórico a cada **minuto** de edição de cada sketch; entre elas,
a mais nova é regravada. Ficam as **20** mais recentes de cada sessão, e o que passa das 20 mais novas no total é
apagado quando sessões mortas são resolvidas. Fechar a aba de um sketch de propósito deixa a última versão dele no
histórico como não oferecida (`dirty: false`). A mesma falha de gravação é avisada uma vez: "salvamento automático
parado: causa; salve o arquivo para não perder o trabalho".

### 6.3 Recuperação

- Ao abrir, se a última versão de algum sketch de uma sessão morta tem `dirty`, o diálogo **Recuperar trabalho não
  salvo** lista as versões desses sketches (nome, data e hora, itens, salvo ou não) com **Abrir** em cada uma e
  **Descartar**.
- **Abrir** abre a versão numa aba como documento **não salvo** ("Alterações não salvas"): salvar grava o arquivo.
  Aquele sketch é resolvido (a versão mais nova passa a `dirty: false`) e sai da lista; os outros sketches da sessão
  morta continuam oferecidos, e o diálogo fecha quando não sobra nenhum.
- **Descartar** resolve as sessões sem abrir nada; o diálogo fecha só depois de gravar.
- **Arquivo › Versões salvas automaticamente…** lista todas as versões guardadas a qualquer momento.
- **Abrir**, **Novo**, **Exemplos** e **Circuito de teste** nunca descartam: abrem numa aba nova, ou na ativa quando
  ela está vazia e sem mudança ou é o mesmo arquivo sem mudança. Só **fechar uma aba** com alterações pergunta ("as
  alterações ficam nas versões salvas automaticamente"). Abrir um pacote de peças (`.fzpz`, `.fzbz`) não troca o
  documento.

## 7. HISTÓRICO DE DESFAZER

- O histórico guarda até 200 documentos (`past`, `future`); desfazer e refazer trocam o documento inteiro, então
  desfazer devolve o documento idêntico.
- O nome de cada passo vem da diferença entre os dois documentos (`engine/History.describeChange`), na ordem:
  peça adicionada (`adicionou R1, R2 +N`), peça apagada (`apagou …`), fio desenhado, fio apagado, fios refeitos,
  título trocado (`renomeou R1 para Rcarga`), propriedade (`mudou resistência de R1`, com o nome em português do
  inspetor), giro (`girou R1`) ou espelho (`espelhou R1`, pela troca do sinal do determinante), movimento
  (`moveu …`), ajuste de fio, ligações, pontas de prova (`pôs`, `tirou`, `moveu ponta de prova`) e, por fim, ajustes
  do projeto.
- **Histórico de desfazer** no painel Projeto (Editar › Histórico de desfazer o abre): o passo mais novo em cima, o
  atual sublinhado em 1 px de `--accent` com "agora", os refazíveis esmaecidos e "início (sketch aberto ou novo)" no
  fim; um clique salta para o passo (`jump(n)`: negativo desfaz, positivo refaz).

## 8. REDE

Os arquivos que o app busca no próprio servidor (`fetchBytes`, `fetchText` de `ui/Catalog`) voltam nulos sem rede
(o `TypeError` do `fetch`): peça nova vira "não encontrada", exemplo vira "não encontrado ou sem rede". O que já está
carregado continua: editar, simular, exportar e salvar. As fontes da interface (Public Sans e JetBrains Mono, OFL) vêm
do próprio app, sem depender do Google Fonts.

## 9. PLANO DE TESTES

| Teste | Onde |
|---|---|
| Supervisor: casa por id, progresso e mensagens sem id; erro do trabalho, erro do worker e silêncio resolvem com nulo e a causa e recriam; parar é idempotente | `tests/supervisor.test.ts` |
| Zip que declara mais de 256 MB ou tem mais de 20.000 arquivos é recusado; zip que mente para menos sai truncado | `tests/sketch.test.ts` |
| Fuzzing dos leitores (bytes, truncados, `.fz` e `.fzp` mutados), da geometria (inversa, transformações de texto) e de sequências de edição (entrada intacta, geometria finita, gravar e reler) | `tests/fuzz.test.ts` |
| Rótulos do histórico | `tests/history.test.ts` |
| Falha no inspetor: causa no lugar, quadro segue, circuito intacto, recarregar volta | `e2e/robust.spec.ts` |
| Worker de PCB, do simulador e indexador que falham no meio do trabalho; o pedido seguinte funciona | `e2e/robust.spec.ts` |
| Recarregar no meio da edição oferece a versão; Abrir devolve o circuito não salvo; Descartar some | `e2e/robust.spec.ts` |
| Duas abas: cada uma guarda a sua versão e a viva não é oferecida | `e2e/robust.spec.ts` |
| Armazenamento cheio avisa uma vez e a edição continua | `e2e/robust.spec.ts` |
| Migração das peças do localStorage para o IndexedDB | `e2e/robust.spec.ts` |
| Dois sketches na mesma aba do navegador: recarregar oferece os dois; abrir um mantém o outro na lista; cada um volta na sua aba | `e2e/robust.spec.ts` |
| Abrir um exemplo com alterações abre outra aba sem perguntar; fechar uma aba com alterações pergunta | `e2e/robust.spec.ts`, `e2e/ui.spec.ts` |
| Toda ação dos menus com a seleção vazia nas três vistas | `e2e/robust.spec.ts` |
| 500 desfazer e refazer seguidos voltam aos mesmos documentos | `e2e/robust.spec.ts` |
| Maior exemplo do Fritzing e projeto vazio: três vistas e todas as exportações | `e2e/robust.spec.ts` |
| Sem rede no meio da sessão | `e2e/robust.spec.ts` |
| Histórico de desfazer: nomes, saltar para trás e para a frente | `e2e/robust.spec.ts` |
| Recarregar durante a primeira indexação aproveita as peças já lidas | `e2e/robust.spec.ts` |
| Meia hora de edição automatizada com o heap estável (crescimento abaixo de 30 MB depois do GC) | `e2e/soak.spec.ts` (`npm run soak`) |
