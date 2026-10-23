# CircuitMaster

Editor de circuitos no navegador compatível com os arquivos do Fritzing 1.0.8 (`.fzz`, `.fz`, `.fzp`, `.fzpz`,
`.fzb`, `.fzbz`). Tem as três vistas sincronizadas (protoboard, esquemático e PCB), simulação SPICE com
instrumentos, autorroteador, DRC, preenchimento de cobre e as saídas de fabricação: Gerber RS-274X, Excellon,
BOM, IPC-D-356A, netlist XML, PDF e SVG.

## Requisitos

- Node 20 (o Vitest 5 exige Node 22; por isso o projeto fixa o Vitest 4).
- Rust com o alvo `wasm32-unknown-unknown` (`rustup target add wasm32-unknown-unknown`), para o netlist e o
  roteador.
- Acervo do Fritzing ao lado do projeto, em `../Fritzing/fritzing-parts` e `../Fritzing/fritzing-app`. Outra
  pasta pode ser indicada em `FRITZING_ROOT`.
- As bibliotecas e os demos do KiCad 10 em `../KiCad` (ou `KICAD_ROOT`), servidos em `/kicad`; o `kicad-cli` no `PATH`
  (opcional) é o oráculo dos testes dos arquivos do KiCad.
- Só para recompilar os módulos C/C++ já incluídos: emsdk (`emcc`), cmake ≥ 3.20 e bison ≥ 3.0 (flex também, para o
  ngspice com XSPICE).

## Uso

```bash
npm ci
npm run dev       # compila os módulos Rust e sobe o Vite
npm test          # testes Vitest; os relatórios vão para build/
npm run e2e       # fluxos no navegador (Playwright), no Chromium e no Firefox
npm run perf      # build de produção e medição de desempenho → build/perf-report.txt
npm run verify    # tipos, Vitest, E2E e desempenho: tem de passar antes de cada commit
npm run soak      # meia hora de edição automatizada sem a memória crescer → build/soak-report.txt
npm run build     # verificação de tipos e build de produção em dist/
npm run preview   # serve o dist/ com o acervo
```

O próprio Vite serve o acervo do Fritzing em `/fritzing`, tanto no `dev` quanto no `preview`. Os E2E usam o
Chromium e o Firefox do Playwright (`npx playwright install chromium firefox` na primeira vez).

## Interface

Barra superior (menus, vista e Simular), trilho de ícones, painel esquerdo, quadro com o painel de simulação embaixo
e o inspetor à direita. O app abre no Esquemático. Tema escuro ou claro pelo botão do trilho (ou Exibir › Tema),
guardado no navegador (`cm-theme`).

- **Paleta de comandos** (`Ctrl+K`): acha qualquer ação pelo nome, em português ou em inglês (termos do Fritzing e do
  KiCad), com o caminho no menu e o atalho.
- **Modos** (Exibir › Modo da interface): Iniciante (padrão), Maker e Profissional. O modo só esconde itens avançados
  dos menus; a paleta acha tudo em qualquer modo. No Iniciante o inspetor abre o cartão "Como funciona" da peça (o
  que é, como funciona, a fórmula e a fórmula com os valores do circuito simulado).
- **Preferências** (Editar › Preferências…, `Ctrl+,`): roda do mouse (zoom ou rolar a vista; Ctrl+roda dá zoom),
  arrastar o meio do fio curva por padrão (Ctrl inverte), modo, idioma, tema e a tecla de cada ação. A tecla escolhida sai da
  ação que a tinha; os menus, a paleta e Ajuda › Atalhos de teclado mostram as teclas em uso.
- **Idioma**: português (padrão) ou inglês, nas Preferências ou em Exibir › Idioma; a interface, as mensagens e a
  lista de materiais exportada mudam na hora e a escolha fica no navegador.
- **Abas de sketches**: Novo, Abrir, Exemplos e os circuitos de teste abrem numa aba nova (a vazia e sem mudança é
  reusada); cada aba tem o seu circuito, histórico de desfazer e vistas. Fechar uma aba com alterações pergunta;
  Arquivo › Salvar todos baixa o `.fzz` de cada sketch alterado. O salvamento automático guarda cada aba.
- **Tour** curto por modo, uma vez só (Ajuda › Tour da interface repete).
- **Navegação do KiCad** (Exibir e o teclado; spec 05 §11): coordenadas do cursor na barra de status em mm, polegadas
  ou mils (`Ctrl+U` alterna; `Espaço` zera as relativas; polares opcionais), cursor do teclado (setas sem seleção,
  `Ctrl`+setas rápido, `Enter` clica, `End` dá duplo clique ou termina o fio), cursor em cruz pequeno, na janela toda
  ou a 45°, `Shift`+setas e `F4` para mover a vista, zoom na seleção e na área arrastada (`Ctrl+F5`), desfazer e
  refazer o último zoom, lista de grades por vista (`N`, `Shift+N`, grades rápidas `Alt+1`/`Alt+2`), origem da grade,
  grade própria para peças ou fios, seleção por laço, apagar com cliques, copiar como texto (`Ctrl+Shift+C`), ver a
  seleção em outra vista e recolher o painel da esquerda pelo trilho.
- **Ajuda**: Guia de uso (como fazer cada coisa), Tour, Boas-vindas, Atalhos de teclado e a paleta (`Ctrl+K`).
- **Arquivo**: Salvar como (`Shift+Ctrl+S`), Salvar uma cópia, Reverter ao arquivo, Abrir recentes (até 10, guardados
  no navegador) e Imprimir (`Ctrl+P`).
- **Camadas** nas três vistas, pela legenda do quadro ou Exibir › Camadas; na protoboard, Exibir › Colorir fios pelo
  comprimento; grade de tamanho livre (Exibir › Grade) e cor de fundo da vista (aba Documento).
- **PCB**: Roteamento › Ver de baixo espelha a placa; uma face de cobre só clicável (`Shift+Ctrl+1`, `2` e `3`);
  Mostrar não roteadas realça as conexões que faltam; a largura das trilhas selecionadas muda no inspetor (8 a 128
  mil); Escolher sementes… lista os conectores de terra para o preenchimento.
- **Rótulo da peça**: clique direito no rótulo para editar o texto, escolher os valores exibidos, girar, espelhar e
  mudar a fonte.

- **Peças** (painel esquerdo, atalho `/` para buscar): os básicos (resistor, capacitor, fonte DC, gerador, terra,
  diodo, LED, transistores, amp-op, 555…) vêm primeiro, agrupados, e depois a biblioteca completa do Fritzing. A
  busca entende português e inglês ("fonte", "source", "DC", "power", "amp op") e põe os básicos na frente. Clique
  numa peça e clique no quadro, arraste, ou dê duplo clique para pôr no centro. O trilho também abre **Projeto**
  (lista de peças e nós, com a tensão de cada nó na simulação) e **Problemas** (erro da simulação, peças acima do
  limite, ligações pendentes e o DRC, com o atalho para ir até cada um).
- **Inspetor**: **Propriedades** da peça (valores com nomes em português, medição ao vivo, V = R·I e dissipação no
  resistor, visor do multímetro, pinos e nets) ou da ponta de prova escolhida; **Roteamento** (autorouter com
  progresso, regras gravadas no sketch, DRC e preenchimento de cobre); **Documento** (resumo, arquivo, exportação,
  ajustes da vista e os exemplos do Fritzing).
- **Fios**: clique num terminal (na protoboard, também na ponta de uma perna dobrável), clique para cada dobra e
  clique no terminal de destino (ou no meio de outro fio, para uma junção em T). O caminho sai e chega pela direção
  dos pinos, em 90° (45° na PCB), desviando de peças, rótulos e fios. Botão direito deixa a ponta solta, Backspace
  desfaz a última dobra e Esc cancela. Arrastar um trecho reto o desloca mantendo os ângulos; mover peças mantém os
  fios retos, e se a peça passa da dobra do próprio fio o trecho é refeito por fora dela.
- **Vista e seleção**: na ferramenta Editar (mão, `H`) arraste o fundo para mover; no Seletor (seta, `V`) arraste
  para selecionar várias peças (da esquerda para a direita, o que fica dentro; da direita para a esquerda, o que
  tocar). Roda do mouse para zoom. Fio, ponta e peça sob o cursor ficam realçados, e o fio encaixa no terminal mais
  próximo ao chegar perto (anel com o nome do pino).
- **Valores**: com uma peça selecionada, um cartão abaixo dela edita o valor principal com a unidade (Ω/kΩ/MΩ,
  nF/µF, mH…) e ‹ › pela série E12; a roda e as setas também ajustam. No esquemático, as peças básicas aparecem com
  o símbolo de livro.
- **Chaves e botões**: o selo acima da peça abre e fecha; no inspetor, "Comutação no tempo" programa quando ela
  fecha e abre no transitório.
- **Peças próprias**: "Editar (editor de peças)" no menu da peça abre o editor (metadados, conectores e o elemento e
  o terminal de cada conector em cada vista, com a marca do terminal arrastável); gravar pede o registro da revisão
  (histórico `<history>` do `.fzp`, com a opção de subir a versão) e cria uma peça nova em Meus itens, que pode
  trocar a peça do sketch e ser baixada como `.fzpz`; uma peça sua é regravada no lugar. O editor desfaz e refaz
  (`Ctrl+Z`, `Ctrl+Y`), define todos os conectores como macho, fêmea ou pad, passa de passante a SMD, liga conectores
  por dentro (conexões internas), aceita PNG e JPG, tem zoom, grade e camadas e baixa o SVG de cada vista. Os bins do
  usuário e as peças importadas ou criadas ficam guardados no navegador.
- **Bins**: Core, Simulador, Meus itens e os bins do Fritzing pelo "+" (em ícones ou em lista); o clique direito numa
  peça do bin edita, exporta, remove ou localiza no sketch.
- **Peças geradas**: CI DIP e SIP, mystery part, borne com parafuso, barras de pinos, perfboard e stripboard mudam
  pinos, espaçamento e tamanho no inspetor; na stripboard, um clique entre dois furos corta ou religa a tira. Logos de
  imagem e a placa de forma livre carregam SVG, PNG ou JPG pelo inspetor.
- **Simulação**: as ferramentas V, A e V·A do quadro colocam pontas de prova num fio ou terminal. **Simular** roda,
  numa ação, o ponto de operação e o transitório; se nada no circuito varia no tempo, mostra o regime direto, sem
  animação. O que varia é escolhido na própria fonte de tensão (fonte DC, bateria, fonte de bancada): clique nela e
  escolha o **Sinal** no inspetor — Contínuo (padrão), Degrau (de 0 à tensão da fonte com o circuito descarregado:
  carga do capacitor, τ e sobressinal), Rampa, Senoide ou Onda quadrada —, com a frequência ou a duração ali mesmo
  (vazias, saem da escala de tempo do circuito). Os valores aparecem no circuito e o painel de simulação abre
  embaixo, um só:
  - **no cabeçalho**, o tempo de simulação (automático pela escala do circuito e pelos sinais; digite o fim e escolha
    s, ms, µs ou ns para fixar, com o início ao lado e o botão Automático para voltar), reproduzir/pausar e a barra
    de tempo;
  - **no topo**, só as pontas que você pôs: uma pílula por curva (P1 V, P2 I…) que mostra ou esconde, com filtro;
  - **embaixo, o gráfico**.

  As medidas ficam no cartão da ponta (clique na ponta): valor no passo, média, RMS e pico a pico e, quando valem,
  período, valor inicial e final, subida 10–90%, τ, sobressinal, acomodação a ±2%, ζ, ganho (V/V e dB), fase e nível
  DC. Duração da animação (3 s ou tempo real), valores sobre o circuito, amostragem e início da janela manual e
  opções do SPICE ficam na aba Documento.

  O gráfico tem tensões à esquerda e correntes à direita, leitura sob o cursor e clique para ir ao instante. A aba
  **Prontos** do trilho lista os circuitos de teste com um cartão didático e três botões, Protoboard, Esquemático e
  PCB: cada um abre o circuito numa aba nova naquela vista, já simulando com as pontas (a PCB abre com a placa criada
  e roteada). Simulação › Circuitos de teste (ou a tela inicial) abre LED com resistor, RC, onda quadrada, filtro passa-baixa, RLC com sobressinal, amplificador inversor com
  amp-op, emissor comum com transistor e chave temporizada, já ligados no esquemático e na protoboard, com as pontas
  e o sinal certo na fonte. Mudar o circuito durante o transitório
  continua a simulação do instante em que ela estava.
- **PCB**: desenhada com as cores do Altium (cobre de cima vermelho, de baixo azul, pads passantes prateados,
  serigrafia amarela, placa preta). Ambas/Topo/Base no cabeçalho esmaecem a outra face (e escolhem a face das
  trilhas novas). Sem placa, "Criar placa e rotear" (aba Roteamento) cria uma em volta das peças e traça as trilhas.
- **PCB com várias placas**: DRC, autorroteador, preenchimento e exportação para fabricação trabalham com a placa
  selecionada (com uma placa só, com ela).
- **Nada se perde**: o sketch é salvo sozinho no navegador (IndexedDB) 1,5 s depois de cada mudança e ao esconder a
  aba, guardando as 20 versões mais recentes (Arquivo › Versões salvas automaticamente…). Se a aba fecha ou trava
  com alterações não salvas, a próxima abertura oferece recuperá-las; outra aba aberta no mesmo navegador não é
  confundida com trabalho perdido.
- **Histórico de desfazer** (Editar › Histórico de desfazer, no painel Projeto): cada passo com nome ("adicionou
  R1", "girou R1", "mudou resistência de R1"); um clique volta ou avança até ele.
- **Falhas contidas**: se um painel falha, ele mostra a causa e "Recarregar painel" no lugar, e o resto do app
  e o circuito seguem; se o simulador, o roteador ou o indexador param, a ação explica a causa e a próxima os
  recria. Arquivos abertos têm limite de tamanho e de número de arquivos (zip-bomba é recusada); sem rede, o que
  já está carregado continua funcionando e as fontes da interface vêm do próprio app.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/core` | formatos e geometria, sem interface: sketch, peças, SVG e fontes, netlist, SPICE, PCB (CAM, Gerber, DRC, preenchimento, roteador), BOM, IPC e PDF |
| `src/engine` | cena de cada vista, lista de desenho, operações de edição e efeitos da simulação |
| `src/ui` | interface em React: canvas, menus, inspetor e painéis |
| `src/workers` | indexação do acervo, simulador (ngspice) e ferramentas de PCB, fora da thread da interface |
| `crates` | netlist e roteador em Rust, compilados para WASM |
| `tools` | acesso ao acervo e scripts de build do Clipper2 e do ngspice |
| `docs/specs` | especificação que a implementação segue |
| `tests` | testes Vitest sobre as peças e os exemplos do Fritzing |
| `e2e` | testes Playwright: fluxos da interface, exemplos, exportações e desempenho (`perf.spec.ts`) |

## Licença

GPL-3.0-or-later (`LICENSE`), a mesma do Fritzing e do KiCad, o que permite portar código dos dois. Cada módulo
com código portado ou adaptado traz a origem na primeira linha e é listado em `THIRD_PARTY.md`. Até 2026-10-21 o
código foi escrito a partir das especificações em `docs/specs`, sem transcrever o código do Fritzing.

## Terceiros

- **ngspice**: núcleo sob BSD modificada, com partes LGPLv2+. É distribuído como módulo WASM separado em
  `src/workers/Simulator/ngspice`, junto com o `COPYING`, e pode ser reconstruído com `tools/Ngspice/build.sh`.
  O comando `build.sh native` gera o executável nativo usado na comparação numérica da spec 04 §11, e
  `build.sh xspice` o nativo com XSPICE e code models, usado só para conferir a fonte de bancada (spec 04 §10.1);
  os testes que precisam deles são pulados quando os executáveis não existem.
- **Clipper2** (Boost 1.0): em `src/core/Clipper`, com a licença ao lado; reconstruível com
  `tools/Clipper2/build.sh`.
- **Public Sans** e **JetBrains Mono** (SIL OFL 1.1), as fontes da interface, pelos pacotes `@fontsource/*`
  (subconjunto latino), servidas pelo próprio app.
- **fast-check** (MIT) nos testes de fuzzing e **Playwright** (Apache-2.0) nos testes E2E; não vão para o build.
- Peças, gráficos, fontes e exemplos vêm do acervo do Fritzing e seguem as licenças dele. Os gráficos e a
  documentação estão sob CC BY-SA 3.0.
