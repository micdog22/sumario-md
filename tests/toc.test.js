import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER_END, MARKER_START, SumarioError, generateToc, hasMarkers, updateToc } from '../src/index.js';

const DOC = [
  '# Projeto',
  '',
  '## Instalação',
  '### Requisitos',
  '#### Detalhes',
  '## Uso',
  '### Exemplos',
  '## Licença',
].join('\n');

test('padrão: H2 e H3, lista aninhada com -', () => {
  assert.equal(
    generateToc(DOC),
    [
      '- [Instalação](#instalação)',
      '  - [Requisitos](#requisitos)',
      '- [Uso](#uso)',
      '  - [Exemplos](#exemplos)',
      '- [Licença](#licença)',
    ].join('\n'),
  );
});

test('filtros de profundidade --min e --max', () => {
  assert.equal(generateToc(DOC, { min: 2, max: 2 }), '- [Instalação](#instalação)\n- [Uso](#uso)\n- [Licença](#licença)');
  assert.equal(
    generateToc(DOC, { min: 3, max: 4 }),
    '- [Requisitos](#requisitos)\n  - [Detalhes](#detalhes)\n- [Exemplos](#exemplos)',
  );
  assert.equal(generateToc(DOC, { min: 1, max: 1 }), '- [Projeto](#projeto)');
});

test('níveis pulados não criam recuo extra', () => {
  const md = '## A\n#### A1\n#### A2\n### B\n## C\n';
  assert.equal(
    generateToc(md, { max: 4 }),
    '- [A](#a)\n  - [A1](#a1)\n  - [A2](#a2)\n  - [B](#b)\n- [C](#c)',
  );
});

test('marcador * e título opcional', () => {
  assert.equal(
    generateToc('## Um\n## Dois\n', { bullet: '*', title: 'Sumário' }),
    '**Sumário**\n\n* [Um](#um)\n* [Dois](#dois)',
  );
  assert.equal(generateToc('# Só H1\n', { title: 'Sumário' }), '');
});

test('opções inválidas geram SumarioError', () => {
  assert.throws(() => generateToc(DOC, { min: 0 }), SumarioError);
  assert.throws(() => generateToc(DOC, { min: 4, max: 2 }), SumarioError);
  assert.throws(() => generateToc(DOC, { max: 7 }), SumarioError);
  assert.throws(() => generateToc(DOC, { min: 'dois' }), SumarioError);
  assert.throws(() => generateToc(DOC, { bullet: '+' }), SumarioError);
});

test('atualiza o conteúdo entre os marcadores e é idempotente', () => {
  const md = `# Projeto\n\n${MARKER_START}\n- [Antigo](#antigo)\n${MARKER_END}\n\n## Instalação\n## Uso\n`;
  const first = updateToc(md);
  assert.equal(first.changed, true);
  assert.equal(
    first.content,
    `# Projeto\n\n${MARKER_START}\n- [Instalação](#instalação)\n- [Uso](#uso)\n${MARKER_END}\n\n## Instalação\n## Uso\n`,
  );
  const second = updateToc(first.content);
  assert.equal(second.changed, false);
  assert.equal(second.content, first.content);
});

test('com só o marcador de início, insere o sumário e o marcador de fim', () => {
  const md = `# Projeto\n${MARKER_START}\n\n## Uso\n`;
  const { content } = updateToc(md, { title: 'Sumário' });
  assert.equal(content, `# Projeto\n${MARKER_START}\n**Sumário**\n\n- [Uso](#uso)\n${MARKER_END}\n\n## Uso\n`);
  assert.equal(updateToc(content, { title: 'Sumário' }).changed, false);
  assert.equal(updateToc(`## Uso\n${MARKER_START}`).content, `## Uso\n${MARKER_START}\n- [Uso](#uso)\n${MARKER_END}\n`);
});

test('marcadores sem espaços e em maiúsculas também valem', () => {
  const { content } = updateToc('<!--SUMARIO-->\n<!--/sumario-->\n## A\n');
  assert.equal(content, '<!--SUMARIO-->\n- [A](#a)\n<!--/sumario-->\n## A\n');
});

test('títulos escritos dentro do bloco do sumário são ignorados', () => {
  const md = `${MARKER_START}\n## Velho título\n${MARKER_END}\n## Novo\n`;
  assert.equal(generateToc(md), '- [Novo](#novo)');
  assert.equal(updateToc(md).content, `${MARKER_START}\n- [Novo](#novo)\n${MARKER_END}\n## Novo\n`);
});

test('marcadores dentro de bloco de código não contam', () => {
  const md = `\`\`\`md\n${MARKER_START}\n${MARKER_END}\n\`\`\`\n## A\n`;
  assert.equal(hasMarkers(md), false);
  assert.throws(() => updateToc(md), (error) => error instanceof SumarioError && error.message.includes(MARKER_START));
});

test('preserva CRLF', () => {
  const md = `${MARKER_START}\r\n${MARKER_END}\r\n## Olá\r\n`;
  const { content } = updateToc(md);
  assert.equal(content, `${MARKER_START}\r\n- [Olá](#olá)\r\n${MARKER_END}\r\n## Olá\r\n`);
  assert.equal(updateToc(content).changed, false);
});

test('sem títulos, deixa o bloco vazio', () => {
  const { content } = updateToc(`${MARKER_START}\n- [x](#x)\n${MARKER_END}\nsó texto\n`);
  assert.equal(content, `${MARKER_START}\n${MARKER_END}\nsó texto\n`);
});
