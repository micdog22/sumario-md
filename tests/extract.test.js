import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeadings } from '../src/index.js';

const summary = (markdown) => extractHeadings(markdown).map((h) => [h.line, h.level, h.text, h.slug]);

test('títulos ATX com e sem # de fechamento', () => {
  const md = '# Título #\n## Seção ##   \n### Três\n####### Sete não\n#Sem espaço não\n## C# no fim\n';
  assert.deepEqual(summary(md), [
    [1, 1, 'Título', 'título'],
    [2, 2, 'Seção', 'seção'],
    [3, 3, 'Três', 'três'],
    [6, 2, 'C# no fim', 'c-no-fim'],
  ]);
});

test('títulos Setext com === e ---', () => {
  const md = 'Principal\n=========\n\nSecundário\n---\n\nTexto em\nduas linhas\n===\n';
  assert.deepEqual(summary(md), [
    [1, 1, 'Principal', 'principal'],
    [4, 2, 'Secundário', 'secundário'],
    [7, 1, 'Texto em\nduas linhas', 'texto-emduas-linhas'],
  ]);
});

test('--- depois de linha em branco ou de item de lista não vira título', () => {
  const md = 'Parágrafo\n\n---\n- item\n---\n';
  assert.deepEqual(summary(md), []);
});

test('ignora blocos de código cercados com ``` e ~~~', () => {
  const md = [
    '```bash',
    '# comentário de shell',
    '```',
    '~~~~',
    '## dentro',
    '```',
    '## ainda dentro',
    '~~~~',
    '## Fora',
  ].join('\n');
  assert.deepEqual(summary(md), [[9, 2, 'Fora', 'fora']]);
});

test('ignora código indentado, comentários HTML e front matter', () => {
  const md = [
    '---',
    'title: "# não é título"',
    '---',
    '    # código indentado',
    '<!--',
    '## comentado',
    '-->',
    '## Real <!-- nota -->',
  ].join('\n');
  assert.deepEqual(summary(md), [[8, 2, 'Real ', 'real-']]);
});

test('títulos dentro de citação também contam', () => {
  assert.deepEqual(summary('> ## Citação\n'), [[1, 2, 'Citação', 'citação']]);
});

test('âncoras repetidas consideram todos os níveis, em ordem', () => {
  const md = '# Uso\n## Uso\n### Uso\n## Exemplo\n## Exemplo\n';
  assert.deepEqual(
    extractHeadings(md).map((h) => h.slug),
    ['uso', 'uso-1', 'uso-2', 'exemplo', 'exemplo-1'],
  );
});

test('aceita CRLF e BOM', () => {
  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(summary(`${bom}# Olá\r\n\r\nTexto\r\n---\r\n`), [
    [1, 1, 'Olá', 'olá'],
    [3, 2, 'Texto', 'texto'],
  ]);
});
