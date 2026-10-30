# 05 — INTERFACE

Como a janela do CircuitMaster se organiza e por que cada função mora onde mora: as decisões "direto ao ponto" do
usuário, abas de sketches, paleta de comandos, modos, preferências e atalhos, idioma, didática, camadas da PCB e o
teste de clareza de cada função existente. Fase 2 do plano `FRIZING_KICAD.md` (seção 5). Pré-requisitos: docs 02
(edição, menus e atalhos, §10), 04 (simulação, §5) e 06 (salvamento automático, §6).

---

## 1. PRINCÍPIOS

- **Padrão certo em vez de escolha.** Se o programa consegue decidir, decide; mudar fica a um clique, onde o efeito
  aparece. Exemplos: o app abre no Esquemático; Simular decide sozinho entre regime e transitório; o DRC roda sozinho
  na PCB.
- **Juntar o que dá para juntar.** Uma simulação, um painel de simulação, uma busca de peças.
- **O resultado aparece onde se olha.** Valores sobre o circuito, gráfico aberto ao simular, problema de DRC marcado no
  desenho; o painel Problemas só lista.
- **Contagem de cliques.** Ação frequente leva um clique a partir da tela normal; rara, no máximo dois, ou a paleta
  (`Ctrl+K` e o nome).
- **Onde cada função mora**, nesta ordem: no objeto (alças, cartão de valor, arrastar); no menu de contexto e no
  inspetor da seleção; na paleta; no menu da barra; botão fixo só para o que se usa em quase toda sessão, e a barra
  não cresce.
- **Sem botão morto.** Função sem efeito real sai da interface em vez de ficar desabilitada; o que só vale numa vista
  aparece só nela (ferramentas de ponta fora da PCB, legenda de camadas e face da placa só na PCB, Salvar todos só com
  mais de uma aba).

## 2. A JANELA

| Região | Conteúdo |
|---|---|
| Barra superior (`ui/Topbar`) | marca, menus (`ui/MenuBar`), as três vistas em abas e o botão Simular/Parar |
| Trilho (`ui/Rail`) | Peças, Projeto e Problemas (com o número de alertas), tema e atalhos; no celular, também o inspetor |
| Painel esquerdo (`ui/LeftPanel`) | biblioteca de peças (`ui/Library`), prontos (os circuitos de teste, cada um com Protoboard, Esquemático e PCB), projeto (`ui/Outline`: peças, nós, histórico de desfazer) ou problemas (`ui/Problems`) |
| Palco (`ui/Stage`) | ferramentas (Editar, Seletor, pontas V/A/V·A, desfazer, girar, espelhar, apagar), face da placa na PCB, o nome do sketch com o selo (ou as abas de sketches) e o quadro (`ui/Canvas`) com chip da simulação, barra da seleção múltipla, zoom, legenda de camadas e boas-vindas |
| Doca (`ui/SimulationPanel`) | o painel único de simulação (§3) |
| Inspetor (`ui/SidePanel`) | Propriedades (`ui/Inspector`), Roteamento (`ui/RoutingPanel`) e Documento (`ui/ProjectPanel`) |
| Barra de status (`ui/StatusBar`) | vista, peças, ligações pendentes, a última mensagem, o autorouter em andamento, as coordenadas do cursor (do Maker em diante, §11) e o zoom |

Até 1280 px os painéis estreitam; até 860 px (celular) o
trilho vira barra inferior, os painéis viram folhas sobre o quadro e a doca empilha.

## 3. DECISÕES DO USUÁRIO

1. **Abre no Esquemático**: o app, o sketch novo e o arquivo aberto (`START_VIEW` em `ui/Store`).
2. **Uma simulação só**: saiu o seletor DC/Transitório. Simular roda o transitório na janela automática; se todo
   vetor fica parado (até 10⁻⁴ do nível, `Simulation.isStill()`), mostra o regime sem animação e diz como fazer
   variar (o sinal na fonte de tensão). Os valores sobre o circuito seguem o instante corrente; editar com o simulador ligado retoma do
   passo corrente; o `.fzz` segue gravando as propriedades `simulator_*` (spec 04 §5.1).
3. **Um painel de simulação só**, aberto sozinho ao simular. **Decisão do usuário de 2026-10-23**, que substitui a
   primeira forma: o estímulo fica na própria fonte de tensão (controle Sinal no inspetor: Contínuo, Degrau, Rampa,
   Senoide, Onda quadrada; spec 04 §5.5) e o painel fica o mais limpo possível: no cabeçalho o tempo de simulação
   (digitar o fim o fixa, com o início ao lado e Automático para voltar), reproduzir/pausar e a barra de tempo; no
   topo do corpo só as pontas que o usuário pôs, uma pílula por curva que mostra ou esconde, com filtro; embaixo o
   gráfico. As medidas (média, RMS, pico a pico e, quando valem, período, subida, τ, sobressinal, acomodação, ζ,
   ganho e fase) vão para o cartão da ponta no inspetor; animação, valores sobre o circuito, janela manual e opções
   do SPICE, para a aba Documento.
4. **As análises do KiCad (fase 9) entram nesse painel** como formas de ver o resultado; o seletor de análise antes de
   simular não volta.

## 4. SKETCHES EM ABAS

- **Novo**, **Abrir**, **Exemplos**, **Circuito de teste** e **Recuperar** abrem numa aba nova; a ativa é reusada quando
  está vazia e sem mudança, ou é o mesmo arquivo sem mudança (reabrir recarrega). Nada é descartado sem pergunta.
- Com um sketch só, o palco mostra o nome e o selo (Novo, Salvo, Alterações não salvas); com dois ou mais, as abas,
  cada uma com o ponto de alterações não salvas e o × de fechar.
- Cada aba guarda o documento, o histórico de desfazer, a vista, o enquadramento de cada vista, a seleção, a ponta
  escolhida e o DRC. Trocar de aba refaz o netlist; com o simulador ligado, simula o sketch da aba (sem misturar o
  resultado do outro).
- **Fechar sketch** (Arquivo e o × da aba) pergunta só se há alterações; a última aba fechada dá lugar a um sketch
  novo. **Salvar todos** (Arquivo, com mais de uma aba) baixa o `.fzz` de cada sketch com alterações.
- O salvamento automático tem uma sequência de versões por sketch (spec 06 §6).

## 5. PALETA DE COMANDOS

`Ctrl+K` (também dentro de campos de texto) ou Ajuda › Paleta de comandos. Lista todo item dos menus da barra, com os
submenus e os exemplos, e os painéis do trilho, com o caminho e o atalho. A busca casa cada termo com o rótulo nas
duas línguas, com o caminho e com os termos em inglês do Fritzing e do KiCad de cada rótulo (`ALIASES`); rótulo vale
mais que caminho e começo de palavra mais que meio. Setas escolhem, Enter executa, Esc fecha. A paleta acha qualquer
função em qualquer modo (§6).

## 6. MODOS

| Modo | O que os menus mostram |
|---|---|
| Iniciante (padrão) | o essencial: montar, ligar, simular, exportar imagem, BOM e produção |
| Maker | mais colar no lugar, apagar sem fios, elevar e rebaixar, travar e sticky, 100%, fios ortogonais, camadas da PCB, graváveis, netlist SPICE, regras do autorouter, vias, preenchimentos e trilhas para a outra face |
| Profissional | tudo: tamanho real, pick-and-place e IPC avulsos, netlist XML, sementes de terra, trilhas autoroteáveis e fixas, serigrafia da peça |

O modo só esconde itens de menu (a tabela `ADVANCED` de `ui/Modes`, pelo rótulo em português) e nunca muda o arquivo.
Fica gravado no navegador e se troca em Exibir › Modo da interface ou nas Preferências. As seções avançadas do
inspetor (Pinos) ficam recolhidas em qualquer modo; o cartão "Como funciona" abre sozinho só no Iniciante.

## 7. PREFERÊNCIAS E ATALHOS

**Editar › Preferências…** (`Ctrl+,`): roda do mouse (zoom ou rolar a vista), arrastar o meio de um fio (dobra ou
curva, como o "curvy wires" do Fritzing), modo da interface, idioma, tema, unidades, cursor em cruz, grades, cores de
realce dos terminais ligado e solto, texto dos net labels novos (na ponta de fora ou junto ao conector; o inspetor
troca em cada um) e a tecla de cada ação. Ficam no navegador. O Gerber sai sempre com seis casas (a opção beta do
Fritzing é o padrão aqui).

`ui/Keys` é a tabela única de ações com tecla: nome, teclas padrão do Fritzing (spec 02 §10.3) e o que faz. O teclado,
os atalhos mostrados nos menus e na paleta, Ajuda › Atalhos de teclado e o editor de teclas das Preferências leem
dela. A tecla escolhida para uma ação sai da ação que a tinha; "padrão" e "Restaurar todos os atalhos" voltam.

## 8. IDIOMA

- Português (Brasil) e inglês, com textos próprios. A chave de cada texto é o próprio texto em português, com `{0}`,
  `{1}`… para os valores (`t('{0} peças', n)`); sem tradução, fica o português.
- `core/Text` guarda o dicionário corrente e a etiqueta da língua (datas e o `lang` dos documentos exportados);
  `core/Text/en.ts` é o dicionário do inglês, carregado só quando escolhido (fora do JavaScript inicial). A interface
  só desenha depois de carregar a língua gravada; trocar remonta a interface com o documento intacto.
- Rótulos de tabelas de módulo (menus, testes, camadas, modos, ações, peças em destaque, propriedades, lições) ficam
  em português e são mostrados por `t` na hora do desenho; os rótulos dos menus seguem em português por dentro porque
  são a chave dos modos e da paleta.
- Mensagens, BOM em HTML, CSV e PDF e as causas dos workers e do armazenamento saem na língua escolhida. Nomes que
  vêm dos arquivos (peças, exemplos, bins do Fritzing) ficam como estão.

## 9. DIDÁTICA

- **Cartão "Como funciona"** no inspetor de cada peça (`core/Lesson`, `ui/Lesson`): o que é, como funciona e a
  fórmula, com a fórmula refeita com os valores do circuito simulado (I = V/R, Q = C·V, E = ½·L·I², P = V·I…). Cobre
  as famílias do acervo por expressões em ordem de especificidade; peça sem família conhecida mostra a descrição do
  `.fzp`.
- **Tour curto por modo** (`ui/Tour`): aparece uma vez por modo (o Iniciante na primeira abertura, os outros na
  primeira troca), um passo por vez junto do alvo com a linha de seleção; Próximo, Pular, Esc; Ajuda › Tour da
  interface repete.
- **Dicas** com nome, atalho e para que serve em todo botão de ícone; a barra do quadro diz o que o próximo clique faz.
- **Estado vazio que ensina**: o quadro vazio mostra como começar, abrir, ver exemplos ou abrir um circuito de teste;
  cada painel vazio diz como enchê-lo.
- **Erro com causa e saída**: "autorouter: … ; tente de novo", "Onda quadrada precisa de uma fonte de pulso…".

## 10. CAMADAS, FACES DA PCB E DRC AUTOMÁTICO

- A legenda "Camadas" no canto do quadro liga e desliga cada grupo num clique, nas três vistas (protoboard: protoboards,
  peças, fios, rótulos, ratsnest, notas, réguas; esquemático: moldura, peças, texto, fios, rótulos, ratsnest, notas,
  réguas; PCB: cobre de cima e de baixo, serigrafias, placa, imagem das peças, montagem e área da peça (spec 09),
  ratsnest, notas, réguas); fora da PCB
  ela começa recolhida. Exibir › Camadas tem os mesmos e mostrar/ocultar todas; o que fica oculto é guardado por vista.
- Roteamento › Ver de baixo espelha o quadro da PCB e põe as camadas de baixo por cima (como o Fritzing), com os
  rótulos legíveis; clique, pan e a exportação da vista seguem o espelho. Vale só na sessão.
- Só uma face de cobre clicável (`Shift+Ctrl+1`, `2` e `3`): a outra esmaece, e nem as trilhas nem as peças SMD dela
  recebem clique.
- Roteamento › Mostrar não roteadas realça em amarelo os terminais das linhas de ratsnest até o próximo clique.
- O DRC roda sozinho 600 ms depois de cada mudança na PCB (e ao chegar nela) e marca cada violação no desenho
  (`[data-drc]`); Problemas lista com "Mostrar na placa".

## 11. CURSOR, COORDENADAS, GRADE E NAVEGAÇÃO (KICAD)

As funções comuns dos editores do KiCad, com as teclas padrão dele, no `ui/Navigation` e na tabela `ui/Keys`:

| Função | Como |
|---|---|
| Coordenadas | X e Y do cursor (na grade) pela origem da grade, na barra de status; com origem local, dX e dY ou r e θ (Exibir › Unidades › Coordenadas polares) |
| Unidades | milímetros (padrão), polegadas ou mils; `Ctrl+U` alterna métrico e polegadas |
| Origem local | `Espaço` zera as coordenadas relativas no cursor; segurado, o Espaço ainda arrasta a vista como no Fritzing |
| Cursor do teclado | sem seleção, as setas andam um passo de grade e `Ctrl`+setas, dez; perto da borda a vista acompanha; com seleção, as setas movem a seleção (Fritzing) |
| Clique pelo teclado | `Enter` clica no cursor e `End` dá duplo clique (o quadro recebe o clique como do mouse); durante o fio, `End` termina com a ponta solta |
| Cursor em cruz | pequeno (padrão), na janela toda ou a 45°; aparece com o cursor do teclado ou sempre (Exibir › Cursor) |
| Vista | `Shift`+setas sem seleção movem um quarto da janela; `F4` centraliza no cursor; Centralizar na seleção; Zoom na seleção; `Ctrl+F5` zoom na área arrastada; desfazer e refazer o último zoom (50 por vista; só zoom e enquadrar entram, mover não) |
| Grade | lista de grades de cada vista nas Preferências; `N` e `Shift+N` andam por ela; as duas primeiras são as grades rápidas (`Alt+1`, `Alt+2`, `Alt+4` alterna) |
| Origem da grade | colocada com um clique (Exibir › Grade), no cursor, digitada na aba Documento (x, y na unidade escolhida) ou restaurada; peças coladas e postas, fios, dobras e os pontos da grade partem dela; gravada na vista do `.fz` (`gridOrigin`) |
| Grade por tipo | Preferências › Grade das peças e Grade dos fios sobrepõem a da vista (grid overrides) |
| Seleção | Editar › Seleção por laço (o centro da peça dentro do polígono) e Apagar com cliques |
| Copiar como texto | `Ctrl+Shift+C`: uma linha por peça selecionada (rótulo, peça e propriedades, separados por tabulação) |
| Ver em outra vista | Peça › Ver na protoboard, no esquemático ou na PCB: a mesma seleção, centralizada (seleção cruzada) |
| Painel da esquerda | o botão do painel aberto no trilho o recolhe na tela larga; Exibir › Painel da esquerda |

Limites: o roteamento de fios (`engine/Path`) põe as dobras intermediárias na grade a partir do zero, não da origem
da grade; as pontas e as peças seguem a origem.

## 12. ESTILO

Estilo "data terminal" (CLAUDE.md, Interface): só os tokens de `src/ui/Theme/style.css`, definidos nos dois temas; cor
só em dados; seleção como linha de 1px em `--accent`; Public Sans no texto e JetBrains Mono só em números; um estilo
de botão, aba e pílula; ícones de linha; sombra só em menus e janelas. O editor de peças segue as mesmas classes
(`.modal`, `.card`, `.field`, `.in`, `.tab`, `.pill`, `.tbl`); o desenho dele fica sobre `--well` e o esquemático é
invertido no tema escuro como no quadro. Nome de classe nosso não pode coincidir com utilitário do Tailwind (a camada
`utilities` passa por cima de `components`: `.btn.block` virava `display: block`).

## 13. TESTE DE CLAREZA

Como um iniciante chega a cada função, a partir da tela normal. Toda ação dos menus também está a dois passos pela
paleta (`Ctrl+K` e o nome, em português ou em inglês).

| Função | Como chega |
|---|---|
| Pôr uma peça | clica na peça do painel e depois no quadro (ou arrasta) |
| Achar uma peça que não está nos destaques | digita o nome na busca do painel (português ou inglês) |
| Ligar dois terminais | clica num terminal e no outro |
| Dobrar um fio | clica no meio do caminho ao desenhar, ou arrasta o fio |
| Mudar o valor de uma peça | seleciona e digita no cartão abaixo dela (ou no inspetor) |
| Andar pela série de valores comerciais | seleciona e usa ‹ › do cartão, a roda ou as setas |
| Girar, espelhar, apagar | seleciona e usa o botão da barra do quadro (ou o atalho mostrado na dica) |
| Mover a vista e dar zoom | arrasta o fundo e usa a roda |
| Abrir um arquivo recente | Arquivo › Abrir recentes |
| Imprimir a vista | `Ctrl+P` (ou Arquivo › Imprimir…) |
| Achar uma peça no sketch | `Ctrl+F` e o nome, ou clique direito na peça do bin › Localizar no sketch |
| Ocultar uma camada | clica nela na legenda Camadas do quadro |
| Ver a placa por baixo | Roteamento › Ver de baixo |
| Mudar a largura de uma trilha | seleciona a trilha e escolhe no campo Largura do inspetor |
| Girar ou mudar o texto do rótulo | clique direito no rótulo |
| Cortar uma tira da stripboard | clica entre os dois furos |
| Mudar os pinos de um CI genérico ou de um borne | seleciona e escolhe Pinos no inspetor |
| Pôr um logo de imagem ou uma placa de forma livre | põe a peça e clica em Carregar imagem no inspetor |
| Desfazer no editor de peças | `Ctrl+Z` ou o botão do cabeçalho do editor |
| Selecionar várias | Shift+arrastar no fundo, ou o Seletor da barra |
| Trocar de vista | clica em Protoboard, Esquemático ou PCB na barra superior |
| Simular | clica em Simular |
| Medir um fio ou terminal | clica em V, A ou V·A e no fio |
| Ver a carga de um capacitor | clica na fonte, Degrau em Sinal e Simular |
| Ver o ganho de um amplificador | clica na fonte, Senoide em Sinal e Simular |
| Ver as medidas de uma curva | clica na ponta de prova no quadro |
| Escolher a janela de tempo | digita o fim da janela no cabeçalho do painel |
| Abrir ou fechar uma chave na simulação | clica no selo acima da chave |
| Programar a chave no tempo | seleciona e "Programar comutação" no inspetor |
| Entender uma peça | seleciona: o cartão "Como funciona" está no inspetor |
| Abrir um exemplo | "Ver exemplos" no quadro vazio, ou Arquivo › Exemplos |
| Abrir um circuito de teste | clica nele no quadro vazio, ou Simulação › Circuitos de teste |
| Salvar | Ctrl+S ou Arquivo › Salvar |
| Abrir um arquivo | Ctrl+O ou "Abrir arquivo" no quadro vazio |
| Trabalhar em dois sketches | Arquivo › Novo (ou abrir outro): aparece a aba de cada um |
| Recuperar trabalho depois de fechar sem salvar | o diálogo aparece sozinho ao abrir; depois, Arquivo › Versões salvas automaticamente |
| Desfazer vários passos | Projeto no trilho e clicar no passo |
| Abrir um circuito pronto para testar | Prontos no trilho e a vista no cartão |
| Ver o que está errado | Problemas no trilho (o número aparece no ícone) |
| Criar a placa e rotear | abre a PCB: "Criar placa e rotear" aparece no próprio quadro quando há peças e não há placa |
| Verificar a placa (DRC) | abrir a PCB: roda sozinho e marca no desenho |
| Ligar e desligar camadas | clica na camada na legenda do quadro da PCB |
| Preencher com terra | Roteamento › Preencher com terra (menu ou aba) |
| Mandar fabricar | Arquivo › Exportar › Para produção › Tudo para fabricar (zip) |
| Lista de materiais | aba Documento › Lista de materiais |
| Exportar imagem | aba Documento › PNG, SVG ou PDF |
| Editar uma peça | botão direito na peça › Editar (editor de peças) |
| Guardar peças num bin | botão direito › Adicionar ao bin |
| Trocar a roda do mouse, o fio curvo ou as teclas | Editar › Preferências (Ctrl+,) |
| Mudar o idioma | Exibir › Idioma (ou `Ctrl+,` e o idioma) |
| Ver menos ou mais opções | Exibir › Modo da interface |
| Mover o cursor e clicar pelo teclado | setas sem nada selecionado e Enter |
| Mudar a grade | N e Shift+N, ou Alt+1 e Alt+2 |
| Ver a peça em outra vista | Peça › Ver na PCB (ou no esquemático, na protoboard) |
| Aprender o básico | Ajuda › Guia de uso ou Ajuda › Tour da interface |
| Achar qualquer outra ação | Ctrl+K e o nome |

## 14. AUDITORIA DE CLIQUES

| Fluxo | Antes da fase 2 | Depois |
|---|---|---|
| Começar a desenhar no esquemático | 1 (o app abria na protoboard) | 0 |
| Ver o circuito no tempo | 2 (Transitório + Simular) | 1 (Simular) |
| Gráfico e medidas depois de simular | 0 a 1 (trocar de aba) | 0 o gráfico; 1 as medidas (clicar na ponta) |
| Trocar o estímulo para Degrau | 2, só com Transitório ligado | 1 (Degrau na fonte selecionada) |
| Ver τ, sobressinal e acomodação | 1 (aba Resposta) | 0 |
| Janela manual | 3 | 1 |
| Opções raras da simulação | 1 + rolar | 1 (aba Documento) |
| Achar uma ação sem saber o menu | percorrer os menus | 2 (Ctrl+K e o nome) |
| Criar a placa a partir da PCB vazia | 2 (aba Roteamento + botão) | 1 (o botão no quadro) |
| DRC depois de mexer na placa | 1 a 2 (Roteamento › Verificar) | 0 |
| Ocultar uma camada da PCB | ausente | 1 |
| Abrir outro sketch sem perder o atual | ausente (descartava) | 1 |

Fotos do antes em `build/ui-antes/`; do depois em `build/ui/`.

## 15. PLANO DE TESTES

| Teste | Onde |
|---|---|
| Simular decide entre regime e transitório pelo resultado | `tests/spice.test.ts` |
| Cartão didático: família certa, fallback da descrição e fórmulas com valores | `tests/lesson.test.ts` |
| Tabela de ações e teclas: mapa, troca e padrão | `tests/keys.test.ts` |
| Dicionário do inglês: toda chave de `t('…')` traduzida, mesmos `{0}`, nenhuma tradução sobrando | `tests/text.test.ts` |
| Do esquemático vazio ao gráfico em um clique; Sinal da fonte (Degrau, Onda quadrada, Contínuo), regime | `e2e/circuit.spec.ts` |
| Painel limpo: pílulas das pontas com filtro, medidas no cartão da ponta, janela manual e Automático, opções na aba Documento | `e2e/simulation.spec.ts` |
| Paleta de comandos em português e em inglês | `e2e/ui.spec.ts` |
| Modos: Iniciante esconde, a paleta acha, fica na recarga | `e2e/ui.spec.ts` |
| Preferências: roda, fio curvo, atalho trocado nos menus e na recarga | `e2e/ui.spec.ts` |
| Tour por modo: uma vez, avança, pula, volta pela Ajuda | `e2e/ui.spec.ts` |
| Abas de sketches: Novo e exemplo em abas, desfazer por aba, reabrir reusa, fechar pergunta, Salvar todos | `e2e/ui.spec.ts` |
| Inglês: todas as telas sem texto em português, a língua fica na recarga e volta | `e2e/ui.spec.ts` |
| Camadas da PCB na legenda e no menu; DRC automático marcado no desenho | `e2e/pcb.spec.ts` |
| Tudo para fabricar (zip) | `e2e/export.spec.ts` |
| Editor de peças no estilo da interface (abas, conectores, terminal, gravar) | `e2e/parts.spec.ts` |
| Cursor do teclado, coordenadas, unidades, Espaço, Enter e F4; zoom (desfazer, refazer, seleção, área) e Shift+setas; grades, grades rápidas, origem e grade por tipo; laço, apagar com cliques, copiar como texto, End; painel recolhível, ver em outra vista, PCB sem placa, guia e boas-vindas; manutenção | `e2e/navigation.spec.ts` |
| Fotos de cada tela nos dois temas a 1920, 1280 e 390 px | `e2e/ui.spec.ts` (`build/ui/`) |
