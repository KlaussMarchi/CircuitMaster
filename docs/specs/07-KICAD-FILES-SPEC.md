# 07 — ARQUIVOS E BIBLIOTECAS DO KICAD

Base da integração com o KiCad 10.0.7 (fase 4 do plano): o acervo do KiCad servido como dados, o leitor e o
gravador dos arquivos S-expression e o `kicad-cli` como oráculo. As fases 5 e 6 constroem sobre esta camada (peças de
três vistas a partir de símbolos e footprints; abrir e gravar projetos).

## 1. ACERVO EM `/kicad`

- `tools/KiCad` define a raiz `KICAD_ROOT` (padrão `../KiCad`, ao lado do repositório) e as pastas servidas:
  `symbols` (`kicad-symbols`), `footprints` (`kicad-footprints`), `models` (`kicad-packages3D`), `templates`
  (`kicad-templates`) e `demos` (`kicad/demos`).
- O plugin `dataServer` do `vite.config.ts` serve `/kicad/<pasta>/<caminho>` e as listagens `symbols.json` (um
  `.kicad_sym` por símbolo, dentro das pastas `.kicad_symdir` do KiCad 10), `footprints.json`, `models.json` (só
  STEP), `templates.json` e `demos.json`, no `dev` e no `preview`, como o `/fritzing`. Nada sai das raízes e nada é
  copiado para `src/`; os arquivos S-expression vão como texto UTF-8.
- As bibliotecas são CC BY-SA 4.0 com a exceção do KiCad: entram só como dados. Peça do KiCad gravada num `.fzz`
  leva a atribuição (fase 5).

## 2. S-EXPRESSION (`core/Sexpr`)

- **Árvore**: `Sexpr = string | Sexpr[]`. O átomo fica como está no texto — número, símbolo ou string com as aspas e
  os escapes —, então ler e gravar não muda nenhum valor (nem `1.0` vira `1`). `unquote` e `quote` passam do átomo ao
  texto e de volta (`\"`, `\\`, `\n`); `headOf`, `childOf` e `childrenOf` navegam.
- **Leitura** (`readSexpr`): sem recursão, então aninhamento fundo não estoura a pilha; texto mal formado (parêntese
  sobrando ou faltando, string sem fim) volta nulo, sem exceção.
- **Gravação** (`writeSexpr`): a árvore numa linha (`flatSexpr`, sem recursão) passa pelo `Prettify` portado de
  `kicad/common/io/kicad/kicad_io_utils.cpp`: tabulação, uma lista por linha, listas `(xy …)` seguidas na mesma linha
  até a coluna 99, quebra de linha entre átomos depois da coluna 72 e um `\n` no fim. Os modos `compact` (fonte,
  traço e preenchimento numa linha, como a área de transferência do KiCad) e `library` (cada `(lib …)` numa linha,
  das tabelas de bibliotecas) seguem os do KiCad; os arquivos gravam no `normal`.
- **Sem perda**: todo arquivo relido dá a mesma árvore; o que o KiCad 10 gravou (`generator_version "10.0"`) volta
  igual byte a byte. Arquivos de geradores antigos (footprints com um `(xy …)` por linha, por exemplo) voltam com a
  formatação do KiCad 10 e a mesma árvore — é o que o próprio KiCad faria ao regravar.
- **Memória**: o formatador copia cada átomo inteiro e junta as partes no fim; a maior placa dos demos (85 MB) lê em
  ~4 s e grava em ~18 s no Node.

## 3. ORÁCULO `kicad-cli`

- O `kicad-cli` do Flatpak só enxerga a pasta pessoal: os testes gravam em `build/kicad/`. Sem o `kicad-cli` no
  `PATH` (ou em `KICAD_CLI`), os testes do oráculo são pulados.
- Comparações: o SVG exportado (`fp export svg`, `sym export svg`) do arquivo regravado é o mesmo do original (sem a
  data do `<title>`); o DRC (`pcb drc --format json`) e o ERC (`sch erc --format json`) do projeto regravado acham as
  mesmas violações do original.

## 4. PLANO DE TESTES

`tests/sexpr.test.ts`:

1. Átomos crus, strings com escapes, `quote`/`unquote` de ida e volta.
2. Texto mal formado volta nulo; 200 mil níveis de aninhamento lidos e achatados sem estourar a pilha.
3. Formato do `Prettify`: tabulação, `(xy)` juntos, fechamento em linha própria.
4. Todos os símbolos (22.905), footprints (15.464) e arquivos dos demos (placas, esquemáticos, símbolos e folhas de
   desenho) lidos e regravados: mesma árvore, gravação estável e os do KiCad 10 iguais byte a byte. Relatórios em
   `build/sexpr-*.txt`.
5. Oráculo: SVG de três bibliotecas de footprints (uma de formatação antiga) e de um símbolo; DRC e ERC do demo
   `royalblue54L_feather` regravado.

`e2e/kicad.spec.ts`: as listagens e os arquivos de `/kicad` respondem no servidor do app.
