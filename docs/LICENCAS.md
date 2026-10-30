# Licenças do acervo do Fritzing: pendências para uso comercial

Levantamento feito em 2026-10-21. Não é parecer jurídico; serve de ponto de partida para resolver antes de
distribuir o CircuitMaster comercialmente.

## Situação atual

- O acervo fica fora do repositório, em `../Fritzing` (ou `FRITZING_ROOT`), e é servido pelo plugin do
  `vite.config.ts` só em `dev` e `preview`. O `vite build` não copia nada dele para `dist/`.
- Enquanto nada for entregue a terceiros, não há redistribuição. As obrigações abaixo passam a valer quando
  uma versão publicada entregar peças, gráficos, fontes ou exemplos aos usuários.
- O projeto ainda não tem `LICENSE` próprio.

## O que é usado e sob qual licença

Raízes definidas em `tools/Fritzing/index.ts`; fontes em `FONT_FILES` (`src/core/Font/index.ts`).

| Asset | Origem | Licença | Comercial | Obrigações |
|---|---|---|---|---|
| Peças (`.fzp` + `.svg`) | `fritzing-parts/{core,contrib,obsolete,user}`, `fritzing-app/resources/parts/core` | CC BY-SA 3.0 | Sim | Crédito + link da licença; SVG modificado/gerado continua CC BY-SA |
| Exemplos (`.fzz`) | `fritzing-app/sketches` | CC BY-SA 3.0 | Sim | Idem |
| Droid Sans (regular, bold, mono) | `fritzing-app/resources/fonts/DroidSans` | Apache 2.0 | Sim | Distribuir o `NOTICE` |
| Noto Sans | `.../fonts/NotoSans` | SIL OFL 1.1 | Sim | Distribuir o `OFL.txt`; não vender a fonte isolada |
| OCR-Fritzing-mono | `.../fonts/OCR-Fritzing-mono.ttf` | SIL OFL 1.1, nome reservado; nome é marca da Fritzing GmbH | Sim | Se modificar, renomear |
| OCR-A (Matthew Skala) | `.../fonts/OCRA.ttf` | Domínio público | Sim | Autor só cede a digitalização, não o desenho original das letras |
| Segment16C Bold | `.../fonts/Segment16` | CC0 | Sim | Nenhuma |
| Código do fritzing-app | — | GPLv3 | — | Não usado: sala limpa (ver README) |

## Riscos

1. **FAQ do Fritzing proíbe uso dos gráficos em outros softwares.** Texto citado no fórum em 2016:
   *"we do not allow the use of Fritzing part graphics in other software systems at the moment. If you think
   we should make an exception for you, please contact us."* Isso contradiz a CC BY-SA 3.0, que é irrevogável e
   não admite restrições extras. A pergunta sobre a contradição ficou sem resposta oficial. O FAQ atual não pôde
   ser lido (403), então não se sabe se o texto continua lá.
2. **Alcance do ShareAlike.** SVGs alterados ou gerados pelo app (ex.: `Library.variants`, faixas de cor do
   resistor) são derivados e ficam CC BY-SA. O código do app provavelmente não é derivado dos gráficos e
   poderia ter licença própria, mas é zona cinzenta.
3. **Saídas dos usuários.** Segundo o Fritzing, circuitos e imagens publicados com os gráficos dele devem dar
   crédito e sair sob CC BY-SA. Afeta, por exemplo, a exportação de imagens da protoboard.
4. **Marca.** "Fritzing" e "OCR-Fritzing mono" só podem ser citados para dar crédito, não para divulgação.
5. **Sala limpa.** A defesa contra a GPLv3 depende de o código ter vindo só das specs em `docs/specs`. Manter
   isso documentado e não copiar código do fritzing-app.

## Pendências

- [ ] Confirmar o texto atual do FAQ em https://fritzing.org/faq (abrir no navegador).
- [ ] Pedir autorização por escrito à Fritzing GmbH para uso comercial das peças no CircuitMaster.
- [ ] Se a autorização não vier: decidir entre biblioteca própria/permissiva ou acervo do Fritzing como
      importação opcional feita pelo usuário.
- [ ] Definir a licença do código do CircuitMaster e criar `LICENSE`.
- [ ] Tela ou arquivo de créditos: "Peças e gráficos © Fritzing e colaboradores, CC BY-SA 3.0" + link.
- [ ] Distribuir junto das fontes: `DroidSans/NOTICE`, `NotoSans/OFL.txt`, licença OFL da OCR-Fritzing-mono.
- [ ] Marcar os SVGs gerados/modificados como CC BY-SA.
- [ ] Avisar nos termos de uso sobre a licença das imagens exportadas.
- [ ] Revisar com advogado antes do lançamento comercial.

## Fontes

- Fórum, citando o FAQ: https://forum.fritzing.org/t/fritzing-images-licensing/545
- FAQ: https://fritzing.org/faq
- Licença de trabalhos feitos com Fritzing: https://forum.fritzing.org/t/what-is-the-license-of-work-greated-with-fritzing/492
- Uso comercial de esquemático (sem resposta): https://forum.fritzing.org/t/use-fritzing-schematic-in-commercial-web-site/3822
- Debian, copyright do pacote: https://metadata.ftp-master.debian.org/changelogs/main/f/fritzing/experimental_copyright
- CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/legalcode
- CC sobre remix e ShareAlike: https://certificates.creativecommons.org/cccertedu/?p=89
- OCR-A: https://en.wikipedia.org/wiki/OCR-A
- Arquivos locais: `fritzing-parts/LICENSE.txt`, `fritzing-app/README.md`, licenças em `fritzing-app/resources/fonts/`
