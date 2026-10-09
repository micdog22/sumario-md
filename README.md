# Sumário MD: gere o sumário do seu README com as âncoras certas (Node.js)

Fazer sumário à mão é chato e quebra fácil: basta um acento, um ponto de interrogação ou um título repetido para o link não bater com a âncora que o GitHub cria. O **Sumário MD** lê os títulos do seu Markdown e monta a lista de links usando as mesmas regras de âncora do GitHub, inclusive com acentos: `Instalação rápida` vira `#instalação-rápida`.

Funciona como CLI e como biblioteca, sem dependências. Rodar de novo não muda nada se os títulos não mudaram, então dá para usar no CI para avisar quando alguém esqueceu de atualizar o sumário.

<!-- sumario -->
- [Recursos](#recursos)
- [Instalação](#instalação)
- [Como usar](#como-usar)
  - [Na linha de comando](#na-linha-de-comando)
  - [No CI (GitHub Actions)](#no-ci-github-actions)
  - [Como biblioteca](#como-biblioteca)
- [Testes](#testes)
- [Como funciona](#como-funciona)
- [Contribuindo](#contribuindo)
- [Licença](#licença)
<!-- /sumario -->

## Recursos

- Âncoras iguais às do GitHub (mesmas regras do github-slugger): acentos mantidos, pontuação e emoji removidos, títulos repetidos com `-1`, `-2`...
- Títulos ATX (`## Título`, com ou sem `#` de fechamento) e Setext (texto sublinhado com `===` ou `---`).
- Ignora o que não é título: blocos de código com ```` ``` ```` e `~~~`, código indentado, comentários HTML e front matter.
- Links, ênfase e imagens dentro do título são reduzidos ao texto antes de calcular a âncora; trechos em `código` continuam como código no sumário.
- Níveis configuráveis (padrão: H2 e H3), marcador `-` ou `*` e título opcional.
- Insere ou atualiza o sumário entre `<!-- sumario -->` e `<!-- /sumario -->`, sem tocar no resto do arquivo.
- `--verificar` para o CI: sai com código 1 quando o sumário está desatualizado.
- Preserva quebras de linha CRLF e BOM.

## Instalação

```bash
# CLI global
npm install -g github:micdog22/sumario-md

# como dependência do projeto (CLI + biblioteca)
npm install github:micdog22/sumario-md

# sem instalar
npx --yes github:micdog22/sumario-md README.md
```

Requer Node.js 18 ou mais recente.

## Como usar

### Na linha de comando

1. Coloque os marcadores no ponto do README onde o sumário deve ficar:

   ```md
   # Meu Projeto

   <!-- sumario -->
   <!-- /sumario -->

   ## Instalação rápida
   ### Requisitos
   ## O que é? (FAQ)
   ```

2. Rode:

   ```bash
   sumario-md --escrever README.md
   ```

3. O bloco é preenchido assim:

   ```md
   <!-- sumario -->
   - [Instalação rápida](#instalação-rápida)
     - [Requisitos](#requisitos)
   - [O que é? (FAQ)](#o-que-é-faq)
   <!-- /sumario -->
   ```

Se só existir o `<!-- sumario -->`, o marcador de fim é adicionado automaticamente. Outros exemplos:

```bash
sumario-md                                   # mostra o sumário do README.md na tela
sumario-md docs/guia.md                      # outro arquivo
sumario-md --min 2 --max 4 README.md         # inclui H4
sumario-md --escrever --titulo "Sumário" README.md
sumario-md --marcador "*" README.md
sumario-md --verificar README.md docs/guia.md
cat README.md | sumario-md -                 # lê da entrada padrão
```

| Opção | O que faz |
| --- | --- |
| `--min N` | Menor nível de título incluído (padrão: 2). |
| `--max N` | Maior nível de título incluído (padrão: 3). |
| `--titulo TEXTO` | Título em negrito acima da lista, por exemplo `"Sumário"`. |
| `--marcador - \| *` | Marcador da lista (padrão: `-`). |
| `--escrever` | Insere ou atualiza o sumário no próprio arquivo. Com `-`, o documento atualizado vai para a saída padrão. |
| `--verificar` | Só confere; sai com código 1 se o sumário estiver desatualizado. |

Códigos de saída: `0` tudo certo, `1` sumário desatualizado (com `--verificar`), `2` erro de uso (arquivo inexistente, opção inválida, marcador ausente).

Use as mesmas opções no `--escrever` e no `--verificar`; caso contrário, o sumário gerado será diferente e a verificação vai falhar.

### No CI (GitHub Actions)

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx --yes github:micdog22/sumario-md --verificar README.md
```

### Como biblioteca

```js
import { generateToc, updateToc, extractHeadings, slugify } from 'sumario-md';

const sumario = generateToc(markdown, { min: 2, max: 3, bullet: '-', title: 'Sumário' });

const { content, changed } = updateToc(markdown); // insere/atualiza entre os marcadores

extractHeadings('## Uso\n## Uso');
// [{ level: 2, line: 1, raw: 'Uso', text: 'Uso', slug: 'uso' },
//  { level: 2, line: 2, raw: 'Uso', text: 'Uso', slug: 'uso-1' }]

slugify('O que é? (FAQ)'); // 'o-que-é-faq'
```

| Função | Descrição |
| --- | --- |
| `generateToc(markdown, opções)` | Devolve o sumário em Markdown. Opções: `min`, `max`, `bullet`, `title`. |
| `updateToc(markdown, opções)` | Devolve `{ content, changed, toc }` com o sumário inserido entre os marcadores. Lança `SumarioError` se não houver marcador. |
| `extractHeadings(markdown)` | Lista os títulos com nível, linha, texto e âncora. |
| `slugify(texto)` | Âncora de um texto, sem tratar repetições. |
| `Slugger` | Classe com `slug(texto)` que trata repetições (`-1`, `-2`...) e `reset()`. |
| `headingText(bruto)` | Texto visível de um título em Markdown. |

## Testes

```bash
npm test
```

Usa só o executor de testes nativo do Node (`node --test`).

## Como funciona

A âncora segue as regras do GitHub:

1. O título é reduzido ao texto que aparece na página: `[guia](url)` vira `guia`, `**negrito**` vira `negrito`, imagens somem e trechos em código ficam como estão.
2. Tudo vai para minúsculas.
3. Sai tudo o que não for letra, número, espaço, `-` ou `_`. Letras acentuadas ficam; pontuação, símbolos e emoji saem.
4. Cada espaço vira `-` (espaços seguidos viram hífens seguidos).
5. Se a âncora já existiu antes no documento, ganha `-1`, `-2`... Títulos de todos os níveis contam, mesmo os que ficam fora do sumário.

| Título | Âncora |
| --- | --- |
| `Instalação rápida` | `#instalação-rápida` |
| `O que é? (FAQ)` | `#o-que-é-faq` |
| `C++ & C#` | `#c--c` |
| `🚀 Começando` | `#-começando` |
| `Uso` (pela segunda vez) | `#uso-1` |

Títulos escritos dentro do bloco do sumário são ignorados, e marcadores que aparecem dentro de blocos de código (como os exemplos deste README) não contam.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
