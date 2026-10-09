#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { SumarioError, generateToc, updateToc } from '../src/index.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `sumario-md: gera o sumário do seu Markdown com as âncoras do GitHub

Uso:
  sumario-md [opções] [arquivo...]

Sem arquivo, usa README.md. Use "-" para ler da entrada padrão.
Sem --escrever ou --verificar, o sumário é mostrado na saída padrão.

Opções:
  --min N            menor nível de título incluído (padrão: 2)
  --max N            maior nível de título incluído (padrão: 3)
  --titulo TEXTO     título em negrito acima da lista, ex.: "Sumário"
  --marcador - | *   marcador da lista (padrão: -)
  --escrever         insere ou atualiza o sumário no próprio arquivo, entre
                     <!-- sumario --> e <!-- /sumario -->
                     (com "-", o documento atualizado vai para a saída padrão)
  --verificar        só confere; sai com código 1 se o sumário estiver
                     desatualizado (útil no CI)
  -h, --help         mostra esta ajuda
  -v, --version      mostra a versão

Exemplos:
  sumario-md README.md
  sumario-md --escrever --titulo "Sumário" README.md
  sumario-md --verificar README.md docs/guia.md

Códigos de saída: 0 = ok, 1 = sumário desatualizado, 2 = erro de uso.
`;

function fail(message) {
  process.stderr.write(`sumario-md: ${message}\nUse --help para ver as opções.\n`);
  return 2;
}

function translateParseError(error) {
  const option = /'(-[^' ]+)/.exec(error.message)?.[1] ?? '';
  if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return `opção desconhecida: ${option}`;
  if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return `valor ausente ou inválido para ${option}`;
  return error.message;
}

function readInput(file) {
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        min: { type: 'string' },
        max: { type: 'string' },
        titulo: { type: 'string' },
        marcador: { type: 'string' },
        escrever: { type: 'boolean' },
        verificar: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    return fail(translateParseError(error));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`sumario-md ${version}\n`);
    return 0;
  }
  if (values.escrever && values.verificar) return fail('use --escrever ou --verificar, não os dois juntos');

  const options = {
    min: values.min ?? 2,
    max: values.max ?? 3,
    bullet: values.marcador ?? '-',
    title: values.titulo ?? '',
  };
  const files = positionals.length ? positionals : ['README.md'];
  let exitCode = 0;

  for (const file of files) {
    const name = file === '-' ? 'entrada padrão' : file;
    let markdown;
    try {
      markdown = readInput(file);
    } catch (error) {
      return fail(error.code === 'ENOENT' ? `arquivo não encontrado: ${file}` : `não foi possível ler ${name} (${error.code || error.message})`);
    }
    try {
      if (values.verificar) {
        const { changed } = updateToc(markdown, options);
        if (changed) {
          process.stderr.write(`${name}: sumário desatualizado. Rode: sumario-md --escrever ${file}\n`);
          exitCode = 1;
        } else {
          process.stdout.write(`${name}: sumário em dia.\n`);
        }
      } else if (values.escrever) {
        const { content, changed } = updateToc(markdown, options);
        if (file === '-') {
          process.stdout.write(content);
        } else if (changed) {
          writeFileSync(file, content);
          process.stdout.write(`${file}: sumário atualizado.\n`);
        } else {
          process.stdout.write(`${file}: sumário já estava em dia.\n`);
        }
      } else {
        const toc = generateToc(markdown, options);
        if (files.length > 1) process.stdout.write(`==> ${name} <==\n`);
        if (toc) process.stdout.write(`${toc}\n`);
        else process.stderr.write(`${name}: nenhum título entre H${options.min} e H${options.max}.\n`);
      }
    } catch (error) {
      if (error instanceof SumarioError) return fail(`${name}: ${error.message}`);
      throw error;
    }
  }
  return exitCode;
}

process.exitCode = main(process.argv.slice(2));
