import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/sumario-md.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function run(args, { cwd, input } = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function withFolder(callback) {
  const folder = mkdtempSync(join(tmpdir(), 'sumario-md-'));
  try {
    return callback(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const README = '# Projeto\n\n<!-- sumario -->\n<!-- /sumario -->\n\n## Instalação rápida\n### Requisitos\n## Uso\n';

test('sem opções, mostra o sumário do README.md da pasta atual', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'README.md'), README);
    const { code, stdout } = run([], { cwd: folder });
    assert.equal(code, 0);
    assert.equal(stdout, '- [Instalação rápida](#instalação-rápida)\n  - [Requisitos](#requisitos)\n- [Uso](#uso)\n');
  });
});

test('--escrever atualiza o arquivo e --verificar confirma', () => {
  withFolder((folder) => {
    const file = join(folder, 'README.md');
    writeFileSync(file, README);
    assert.equal(run(['--verificar', 'README.md'], { cwd: folder }).code, 1);
    const written = run(['--escrever', '--titulo', 'Sumário', 'README.md'], { cwd: folder });
    assert.equal(written.code, 0);
    assert.match(written.stdout, /README\.md: sumário atualizado\./);
    assert.match(readFileSync(file, 'utf8'), /<!-- sumario -->\n\*\*Sumário\*\*\n\n- \[Instalação rápida\]/);
    const again = run(['--escrever', '--titulo', 'Sumário', 'README.md'], { cwd: folder });
    assert.match(again.stdout, /já estava em dia/);
    const checked = run(['--verificar', '--titulo', 'Sumário', 'README.md'], { cwd: folder });
    assert.equal(checked.code, 0);
    assert.match(checked.stdout, /sumário em dia/);
  });
});

test('--verificar falha quando um título muda', () => {
  withFolder((folder) => {
    const file = join(folder, 'README.md');
    writeFileSync(file, README);
    run(['--escrever', 'README.md'], { cwd: folder });
    writeFileSync(file, readFileSync(file, 'utf8').replace('## Uso', '## Como usar'));
    const result = run(['--verificar', 'README.md'], { cwd: folder });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /desatualizado/);
  });
});

test('entrada padrão com "-"', () => {
  const toc = run(['--max', '2', '-'], { input: README });
  assert.equal(toc.stdout, '- [Instalação rápida](#instalação-rápida)\n- [Uso](#uso)\n');
  const doc = run(['--escrever', '-'], { input: README });
  assert.equal(doc.code, 0);
  assert.match(doc.stdout, /<!-- sumario -->\n- \[Instalação rápida\]/);
});

test('erros de uso saem com código 2', () => {
  withFolder((folder) => {
    assert.equal(run(['nao-existe.md'], { cwd: folder }).code, 2);
    const unknown = run(['--abc'], { cwd: folder });
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /opção desconhecida: --abc/);
    writeFileSync(join(folder, 'SEM.md'), '## A\n');
    const noMarker = run(['--escrever', 'SEM.md'], { cwd: folder });
    assert.equal(noMarker.code, 2);
    assert.match(noMarker.stderr, /Marcador <!-- sumario --> não encontrado/);
    assert.equal(run(['--min', '5', '--max', '2', 'SEM.md'], { cwd: folder }).code, 2);
    assert.equal(run(['--escrever', '--verificar', 'SEM.md'], { cwd: folder }).code, 2);
  });
});

test('--help e --version', () => {
  const help = run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--escrever/);
  assert.equal(run(['-v']).stdout, `sumario-md ${version}\n`);
});
