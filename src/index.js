/**
 * Sumário MD: gera sumários (TOC) de Markdown com âncoras iguais às do GitHub.
 */

export const MARKER_START = '<!-- sumario -->';
export const MARKER_END = '<!-- /sumario -->';

const START_LINE = /^\s*<!--\s*sumario\s*-->\s*$/i;
const END_LINE = /^\s*<!--\s*\/sumario\s*-->\s*$/i;

const PRIVATE_BASE = 0xe000;
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
const CODE_SPAN = /(?<!`)(`+)(?!`)([\s\S]+?)(?<!`)\1(?!`)/g;
const COMMENT = /<!--[\s\S]*?-->/g;
const AUTOLINK = /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/g;
const EMAIL_AUTOLINK = /<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/g;
const IMAGE = /!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g;
const LINK = /\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g;
const TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;
const EMPHASIS = [
  /(\*{1,3})(?=\S)(.+?)(?<=\S)\1/g,
  /(?<![\p{L}\p{N}_\\])(_{1,3})(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}_])/gu,
  /(~~)(?=\S)(.+?)(?<=\S)\1/g,
];
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0), copy: '©', reg: '®',
  trade: '™', hellip: '…', mdash: '\u2014', ndash: '\u2013', laquo: '«', raquo: '»', ldquo: '“',
  rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', deg: '°', ordm: 'º', ordf: 'ª', euro: '€',
};

const FENCE = /^[ \t]*(?:>[ \t]?)*[ \t]*(`{3,}|~{3,})(.*)$/;
const FRONT_MATTER_END = /^(?:---|\.\.\.)[ \t]*$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ATX_CLOSING = /(?:^|[ \t]+)#+[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const QUOTE_PREFIX = /^(?: {0,3}>[ ]?)+/;
const NOT_PARAGRAPH = /^ {0,3}(?:[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|<!--|<\/?[A-Za-z]|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/;

/** Erro de uso (opções inválidas, marcadores ausentes). */
export class SumarioError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SumarioError';
  }
}

/**
 * Converte um texto na âncora do GitHub, sem tratar repetições: minúsculas,
 * remove o que não for letra, número, espaço, "-" ou "_" e troca espaços por "-".
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** Gera âncoras únicas na ordem do documento: repetidas ganham -1, -2... */
export class Slugger {
  #occurrences = new Map();

  slug(text) {
    const base = slugify(text);
    let result = base;
    while (this.#occurrences.has(result)) {
      const count = this.#occurrences.get(base) + 1;
      this.#occurrences.set(base, count);
      result = `${base}-${count}`;
    }
    this.#occurrences.set(result, 0);
    return result;
  }

  reset() {
    this.#occurrences.clear();
  }
}

function normalizeNewlines(text) {
  return String(text).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
}

function protect(raw) {
  return raw.replace(ESCAPED, (_, char) => String.fromCharCode(PRIVATE_BASE + char.charCodeAt(0)));
}

function restore(text, keepBackslash = false) {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= PRIVATE_BASE && code < PRIVATE_BASE + 128) {
      const original = String.fromCharCode(code - PRIVATE_BASE);
      out += keepBackslash ? `\\${original}` : original;
    } else {
      out += char;
    }
  }
  return out;
}

function decodeEntities(text) {
  return text.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]+);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
  });
}

function inlineToText(text) {
  let out = text.replace(COMMENT, '').replace(AUTOLINK, '$1').replace(EMAIL_AUTOLINK, '$1').replace(IMAGE, '');
  let previous;
  do {
    previous = out;
    out = out.replace(LINK, '$1');
  } while (out !== previous);
  out = out.replace(TAG, '');
  do {
    previous = out;
    for (const pattern of EMPHASIS) out = out.replace(pattern, '$2');
  } while (out !== previous);
  return restore(decodeEntities(out));
}

function segments(raw) {
  const text = protect(raw);
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(CODE_SPAN)) {
    parts.push({ code: false, text: text.slice(last, match.index) });
    let code = match[2].replace(/\n/g, ' ');
    if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && /[^ ]/.test(code)) {
      code = code.slice(1, -1);
    }
    parts.push({ code: true, text: restore(code, true) });
    last = match.index + match[0].length;
  }
  parts.push({ code: false, text: text.slice(last) });
  return parts;
}

/** Texto visível de um título: links viram texto, ênfase e imagens somem, código fica. */
export function headingText(raw) {
  return segments(String(raw))
    .map((part) => (part.code ? part.text : inlineToText(part.text)))
    .join('');
}

function escapeMarkdown(text) {
  return text
    .replace(/[\\`*[\]<>]/g, '\\$&')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');
}

function codeSpan(content) {
  const runs = content.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${content}${pad}${fence}`;
}

/** Rótulo seguro para usar dentro de [ ] no sumário (mantém trechos em código). */
export function tocLabel(raw) {
  return segments(String(raw))
    .map((part) => (part.code ? codeSpan(part.text) : escapeMarkdown(inlineToText(part.text))))
    .join('')
    .trim();
}

/** Esconde front matter YAML e blocos de código cercados, preservando posições. */
function hideBlocks(text) {
  const lines = text.split('\n');
  const hidden = new Array(lines.length).fill(false);
  let first = 0;
  if (lines.length && lines[0].trimEnd() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (FRONT_MATTER_END.test(lines[i])) {
        for (let k = 0; k <= i; k++) hidden[k] = true;
        first = i + 1;
        break;
      }
    }
  }
  let fence = null;
  for (let i = first; i < lines.length; i++) {
    const match = FENCE.exec(lines[i]);
    if (!fence) {
      if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
        fence = { char: match[1][0], size: match[1].length };
        hidden[i] = true;
      }
    } else {
      hidden[i] = true;
      if (match && match[1][0] === fence.char && match[1].length >= fence.size && !match[2].trim()) {
        fence = null;
      }
    }
  }
  return lines.map((line, i) => (hidden[i] ? ' '.repeat(line.length) : line)).join('\n');
}

function codeSpanRanges(text) {
  const ranges = [];
  const runs = /`+/g;
  let match;
  while ((match = runs.exec(text))) {
    const start = match.index;
    if (start > 0 && text[start - 1] === '\\') {
      runs.lastIndex = start + 1;
      continue;
    }
    const closing = new RegExp(`(?<!\`)${match[0]}(?!\`)`, 'g');
    closing.lastIndex = runs.lastIndex;
    const close = closing.exec(text);
    if (!close || /\n[ \t]*\n/.test(text.slice(runs.lastIndex, close.index))) continue;
    ranges.push([start, close.index + close[0].length]);
    runs.lastIndex = close.index + close[0].length;
  }
  return ranges;
}

function mask(text, ranges) {
  if (!ranges.length) return text;
  const chars = text.split('');
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

/** Texto preparado para achar títulos: sem código cercado, front matter e comentários. */
function headingSource(text) {
  const blocks = hideBlocks(text);
  const withoutCode = mask(blocks, codeSpanRanges(blocks));
  const comments = [...withoutCode.matchAll(COMMENT)].map((m) => [m.index + 4, m.index + m[0].length - 3]);
  return mask(blocks, comments);
}

/**
 * Lista os títulos ATX (# Título) e Setext (Título + ===/---) do documento,
 * com o texto visível e a âncora única de cada um, na ordem em que aparecem.
 */
export function extractHeadings(markdown) {
  const found = [];
  let paragraph = [];
  let paragraphLine = 0;
  headingSource(normalizeNewlines(markdown))
    .split('\n')
    .forEach((original, index) => {
      const number = index + 1;
      const line = original.replace(QUOTE_PREFIX, '');
      if (!line.trim()) {
        paragraph = [];
        return;
      }
      const atx = ATX.exec(line);
      if (atx) {
        const raw = (atx[2] || '').replace(ATX_CLOSING, '').trim();
        found.push({ level: atx[1].length, line: number, raw });
        paragraph = [];
        return;
      }
      const setext = SETEXT.exec(line);
      if (setext && paragraph.length) {
        const raw = paragraph.map((p) => p.trim()).join('\n');
        found.push({ level: setext[1][0] === '=' ? 1 : 2, line: paragraphLine, raw });
        paragraph = [];
        return;
      }
      if (NOT_PARAGRAPH.test(line)) {
        paragraph = [];
        return;
      }
      if (!paragraph.length) {
        if (/^(?: {4}|\t)/.test(line)) return;
        paragraphLine = number;
      }
      paragraph.push(line);
    });
  const slugger = new Slugger();
  return found.map((heading) => {
    const text = headingText(heading.raw);
    return { ...heading, text, slug: slugger.slug(text) };
  });
}

function findBlock(text) {
  const lines = hideBlocks(text).split('\n');
  let offset = 0;
  let start = null;
  for (const line of lines) {
    const lineEnd = offset + line.length;
    if (start === null && START_LINE.test(line)) {
      start = { contentStart: Math.min(lineEnd + 1, text.length), newline: lineEnd < text.length };
    } else if (start !== null && END_LINE.test(line)) {
      return { ...start, contentEnd: offset, closed: true };
    }
    offset = lineEnd + 1;
  }
  return start ? { ...start, contentEnd: start.contentStart, closed: false } : null;
}

function checkOptions({ min = 2, max = 3, bullet = '-', title = '' } = {}) {
  const minLevel = Number(min);
  const maxLevel = Number(max);
  const valid = (n) => Number.isInteger(n) && n >= 1 && n <= 6;
  if (!valid(minLevel) || !valid(maxLevel) || minLevel > maxLevel) {
    throw new SumarioError('Os níveis devem ser números inteiros de 1 a 6, com o mínimo menor ou igual ao máximo.');
  }
  if (bullet !== '-' && bullet !== '*') {
    throw new SumarioError('O marcador da lista deve ser "-" ou "*".');
  }
  return { min: minLevel, max: maxLevel, bullet, title: String(title ?? '').trim() };
}

/**
 * Gera o sumário em Markdown (lista aninhada de links).
 * Opções: min e max (níveis, padrão 2 e 3), bullet ("-" ou "*") e title.
 * Títulos que estiverem entre os marcadores do sumário são ignorados.
 */
export function generateToc(markdown, options = {}) {
  const { min, max, bullet, title } = checkOptions(options);
  const text = normalizeNewlines(markdown);
  const block = findBlock(text);
  const source = block ? text.slice(0, block.contentStart) + text.slice(block.contentEnd) : text;
  const lines = [];
  const stack = [];
  for (const heading of extractHeadings(source)) {
    if (heading.level < min || heading.level > max) continue;
    while (stack.length && stack[stack.length - 1] >= heading.level) stack.pop();
    lines.push(`${'  '.repeat(stack.length)}${bullet} [${tocLabel(heading.raw)}](#${heading.slug})`);
    stack.push(heading.level);
  }
  if (lines.length && title) lines.unshift(`**${escapeMarkdown(title)}**`, '');
  return lines.join('\n');
}

/** Indica se o documento tem o marcador de início do sumário (fora de blocos de código). */
export function hasMarkers(markdown) {
  return findBlock(normalizeNewlines(markdown)) !== null;
}

/**
 * Insere ou atualiza o sumário entre <!-- sumario --> e <!-- /sumario -->.
 * Se só houver o marcador de início, o de fim é adicionado. Devolve
 * { content, changed, toc }. Preserva quebras de linha CRLF e o BOM, se houver.
 */
export function updateToc(markdown, options = {}) {
  const original = String(markdown);
  const crlf = original.includes('\r\n');
  const text = normalizeNewlines(original);
  const block = findBlock(text);
  if (!block) {
    throw new SumarioError(
      `Marcador ${MARKER_START} não encontrado. Coloque ${MARKER_START} e ${MARKER_END} onde o sumário deve ficar.`,
    );
  }
  const toc = generateToc(text, options);
  const inner = toc ? `${toc}\n` : '';
  const before = text.slice(0, block.contentStart) + (block.newline ? '' : '\n');
  const updated = block.closed
    ? before + inner + text.slice(block.contentEnd)
    : before + inner + `${MARKER_END}\n` + text.slice(block.contentStart);
  const bom = original.startsWith('\ufeff') ? '\ufeff' : '';
  const content = bom + (crlf ? updated.replace(/\n/g, '\r\n') : updated);
  return { content, changed: content !== original, toc };
}
