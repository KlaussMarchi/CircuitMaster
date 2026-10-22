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
npm run build     # verificação de tipos e build de produção em dist/
npm run preview   # serve o dist/ com o acervo
```

O próprio Vite serve o acervo do Fritzing em `/fritzing`, tanto no `dev` quanto no `preview`. Os E2E usam o
Chromium e o Firefox do Playwright (`npx playwright install chromium firefox` na primeira vez).

## Interface

Layout do guia `circuit-master-ui/DESIGN.md`: barra superior (menus, vista, DC/Transitório e Simular), trilho de
ícones, painel esquerdo, quadro com a doca de simulação embaixo e o inspetor à direita. Tema escuro ou claro pelo
botão do trilho (ou Exibir › Tema), guardado no navegador (`cm-theme`).

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
  trocar a peça do sketch e ser baixada como `.fzpz`. Os bins do usuário e as peças importadas ou criadas ficam
  guardados no navegador.
- **Simulação**: as ferramentas V, A e V·A do quadro colocam pontas de prova num fio ou terminal; Simular liga o
  ngspice e as leituras aparecem no circuito. A doca de baixo tem três abas:
  - **Medidas**: valor no cursor, média, RMS e pico a pico de cada curva marcada, e as curvas disponíveis (pontas,
    tensão de cada nó e corrente de cada fonte).
  - **Resposta**: na curva escolhida, valor inicial e final, subida 10–90%, constante de tempo τ, pico, sobressinal,
    acomodação a ±2%, período da oscilação e amortecimento ζ; com fonte senoidal, ganho (V/V e dB), fase e nível DC
    da saída frente à entrada. O gráfico marca a faixa de ±2%, o valor final, o pico com o sobressinal, τ e a
    acomodação.
  - **Ajustes**: o teste do transitório — Automático (janela pela escala de tempo do circuito), Degrau (parte
    descarregado, para carga do capacitor e sobressinal), Onda quadrada (três períodos da fonte pulsada), Senoide
    (cinco períodos, para amplificadores) ou Manual (início, fim, número de pontos ou passo fixo e se parte
    descarregado) —, a duração da animação (3 s por padrão, ou tempo real), os valores sobre o circuito e opções do SPICE.
    O fim da janela também fica no cabeçalho da doca: digite o valor e escolha s, ms, µs ou ns; "auto" volta ao cálculo
    automático.

  O gráfico tem tensões à esquerda e correntes à direita, leitura sob o cursor e clique para ir ao instante. Simulação
  › Circuitos de teste (ou a tela inicial) abre RC, onda quadrada, RLC com sobressinal, amplificador inversor com
  amp-op, emissor comum com transistor e chave temporizada, já ligados no esquemático e na protoboard, com as pontas
  e o teste certo. Mudar o circuito durante o transitório
  continua a simulação do instante em que ela estava.
- **PCB**: desenhada com as cores do Altium (cobre de cima vermelho, de baixo azul, pads passantes prateados,
  serigrafia amarela, placa preta). Ambas/Topo/Base no cabeçalho esmaecem a outra face (e escolhem a face das
  trilhas novas). Sem placa, "Criar placa e rotear" (aba Roteamento) cria uma em volta das peças e traça as trilhas.
- **PCB com várias placas**: DRC, autorroteador, preenchimento e exportação para fabricação trabalham com a placa
  selecionada (com uma placa só, com ela).

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
- Peças, gráficos, fontes e exemplos vêm do acervo do Fritzing e seguem as licenças dele. Os gráficos e a
  documentação estão sob CC BY-SA 3.0.
