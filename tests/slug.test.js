import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Slugger, headingText, slugify, tocLabel } from '../src/index.js';

const anchor = (raw) => slugify(headingText(raw));

test('mantém letras acentuadas e troca espaços por hífen', () => {
  assert.equal(anchor('Instalação rápida'), 'instalação-rápida');
  assert.equal(anchor('Configuração Avançada'), 'configuração-avançada');
  assert.equal(anchor('ÉPOCA DE OURO'), 'época-de-ouro');
});

test('remove pontuação, símbolos e emoji', () => {
  assert.equal(anchor('O que é? (FAQ)'), 'o-que-é-faq');
  assert.equal(anchor('C++ & C#'), 'c--c');
  assert.equal(anchor('🚀 Começando'), '-começando');
  assert.equal(anchor('Versão 2.0: novidades!'), 'versão-20-novidades');
  assert.equal(anchor('Antes — depois'), 'antes--depois');
  assert.equal(anchor('Preço: R$ 10,00'), 'preço-r-1000');
});

test('mantém hífen e sublinhado', () => {
  assert.equal(anchor('snake_case e kebab-case'), 'snake_case-e-kebab-case');
});

test('reduz Markdown inline ao texto visível', () => {
  assert.equal(anchor('Usando `npm install`'), 'usando-npm-install');
  assert.equal(anchor('Veja o [guia](docs/guia.md)'), 'veja-o-guia');
  assert.equal(anchor('**Muito** _importante_'), 'muito-importante');
  assert.equal(anchor('`__init__.py`'), '__init__py');
  assert.equal(anchor('__init__.py'), 'initpy');
  assert.equal(anchor('nome_da_variavel'), 'nome_da_variavel');
  assert.equal(anchor('Projeto ![selo](selo.svg)'), 'projeto-');
  assert.equal(anchor('Título <small>extra</small>'), 'título-extra');
  assert.equal(anchor('Perguntas &amp; respostas'), 'perguntas--respostas');
  assert.equal(anchor('\\_privado\\_'), '_privado_');
});

test('títulos repetidos recebem -1, -2...', () => {
  const slugger = new Slugger();
  assert.deepEqual(['Uso', 'Uso', 'Uso'].map((t) => slugger.slug(t)), ['uso', 'uso-1', 'uso-2']);
});

test('colisão com sufixo segue o github-slugger', () => {
  const slugger = new Slugger();
  assert.deepEqual(['foo', 'foo', 'foo-1'].map((t) => slugger.slug(t)), ['foo', 'foo-1', 'foo-1-1']);
  slugger.reset();
  assert.equal(slugger.slug('foo'), 'foo');
});

test('rótulo do sumário preserva código e escapa o que quebraria o link', () => {
  assert.equal(tocLabel('Usando `npm install`'), 'Usando `npm install`');
  assert.equal(tocLabel('Veja [o guia](x.md) e **isto**'), 'Veja o guia e isto');
  assert.equal(tocLabel('Lista [x] e a*b'), 'Lista \\[x\\] e a\\*b');
  assert.equal(tocLabel('\\_privado\\_ e nome_composto'), '\\_privado\\_ e nome_composto');
  assert.equal(tocLabel('Use ``a ` b``'), 'Use ``a ` b``');
});
