#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name;
const CELL = 8.4;
const LINE = 22;
const PAD = 26;
const BAR = 38;

const COLOR = {
  bg: '#0d1117',
  panel: '#161b22',
  bar: '#161b22',
  chrome: '#30363d',
  head: '#e6edf3',
  dim: '#7d8590',
  text: '#c9d1d9',
  bad: '#f85149',
  warn: '#d29922',
  good: '#3fb950',
  cool: '#58a6ff',
};

const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A quote in an aria-label would close the attribute early and break the whole file.
function attr(text) {
  return escape(text).replace(/"/g, '&quot;');
}

// SVG collapses runs of spaces, so alignment is held by non-breaking spaces of the same width.
function cells(text) {
  return escape(text).replace(/ /g, '\u00a0');
}

function must(lines, expected) {
  for (const want of expected) {
    if (!lines.some((line) => want.test(line))) {
      throw new Error(`${want} is missing from the captured output:\n${lines.join('\n')}`);
    }
  }
  return lines;
}

// GitHub Actions colours vitest output, which made the summary filter match nothing.
function plain(out) {
  return out.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '');
}

function frame(width, height, title) {
  const dots = ['#ff5f57', '#febc2e', '#28c840']
    .map((fill, i) => `<circle cx="${20 + i * 18}" cy="19" r="6" fill="${fill}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(title)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <path d="M0 10a10 10 0 0 1 10-10h${width - 20}a10 10 0 0 1 10 10v28H0z" fill="${COLOR.bar}"/>
  ${dots}
  <text x="${PAD + 48}" y="23" font-family="${MONO}" font-size="12" fill="${COLOR.dim}">${escape(title)}</text>`;
}

// A plain panel, no terminal chrome: for the glance tiles, not a captured shell.
function panel(width, height, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(label)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <g font-family="${MONO}">`;
}

function box(lines, title, extraRows = 0) {
  return {
    width: Math.round(Math.max(...lines.map((l) => l.length), title.length + 24) * CELL + PAD * 2),
    height: BAR + (lines.length + extraRows) * LINE + PAD,
  };
}

// A caption that runs past its box clips silently, so the build fails on it instead.
const TILES = [
  ['PROVIDERS', '2, sequential', 'OpenAI then Gemini', COLOR.cool],
  ['VALIDATION', 'Zod, pre-store', 'malformed JSON throws', COLOR.bad],
  ['ANSWER RULE', 'exactly 1 of 4', 'zero or many rejected', COLOR.warn],
  ['TIMEOUT', '30,000 ms', 'then Gemini takes over', COLOR.good],
];

function glance() {
  // 195px tile holds 24 glyphs at font-size 12, 14 at font-size 16.
  for (const [, big, small] of TILES) {
    if (small.length > 24 || big.length > 14) throw new Error(`tile text too long: ${big} / ${small}`);
  }
  const width = 880;
  const height = 130;
  const tiles = TILES.map(([role, big, small, fill], i) => {
    const x = 20 + i * 215;
    return `<rect x="${x}" y="17" width="195" height="96" rx="8" fill="${COLOR.panel}" stroke="${COLOR.chrome}"/>
    <text x="${x + 16}" y="43" fill="${COLOR.dim}" font-size="11" letter-spacing="1">${role}</text>
    <text x="${x + 16}" y="69" fill="${fill}" font-size="16" font-weight="600">${cells(big)}</text>
    <text x="${x + 16}" y="93" fill="${COLOR.dim}" font-size="12">${cells(small)}</text>`;
  }).join('\n    ');
  const label = 'llm-assessment-pipeline at a glance: 2 providers in sequence, Zod validation before persistence, exactly 1 correct option of 4 required, 30,000 millisecond timeout before the fallback runs';
  return `${panel(width, height, label)}
    ${tiles}
  </g>
</svg>
`;
}

// Every LangChain client is mocked in tests/pipeline.test.ts, so this needs no network or key.
function testRun() {
  const raw = execFileSync(
    join(ROOT, 'node_modules', '.bin', 'vitest'),
    ['run'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC', CI: 'true', NO_COLOR: '1' },
    },
  );
  const text = plain(raw);
  // Non-TTY vitest logs a per-file line carrying a duration, so only the totals are reproducible.
  const lines = text
    .split('\n')
    .map((line) => line.replaceAll(ROOT, PKG_NAME).trimEnd())
    .filter((line) => /^\s*(RUN\s+v|(Test Files|Tests)\s)/.test(line));
  if (!lines.length) throw new Error(`no test output captured:\n${text}`);
  return lines;
}

const DEMO_FILE = 'scripts/demo-schema.ts';

// The refinement is what the repo is for, so the picture shows it rejecting a real payload.
function schemaRun() {
  const out = execFileSync(join(ROOT, 'node_modules', '.bin', 'ts-node'), [DEMO_FILE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC', NO_COLOR: '1' },
  });
  return plain(out).trim().split('\n');
}

function colorOf(line) {
  if (/^\s*RUN\b/.test(line)) return COLOR.dim;
  if (/rejected/.test(line)) return COLOR.bad;
  if (/passed|accepted/.test(line)) return COLOR.good;
  if (/^\$ /.test(line)) return COLOR.head;
  return COLOR.text;
}

function session(rows, title) {
  const { width, height } = box(rows, title, 1);
  const body = rows
    .map((line, i) => `<text x="${PAD}" y="${BAR + 16 + i * LINE}" fill="${colorOf(line)}">${cells(line)}</text>`)
    .join('\n    ');
  return `${frame(width, height, title)}
  <g font-family="${MONO}" font-size="14" font-weight="500">
    ${body}
  </g>
</svg>
`;
}

function demo() {
  const schema = must(schemaRun(), [
    /^one correct option of 4: accepted$/,
    /^two correct options of 4: rejected: exactly one option must be marked isCorrect$/,
  ]);
  const captured = must(testRun(), [/^\s*Test Files\s+[1-9]\d* passed/, /Tests\s+[1-9]\d* passed/]);
  const rows = [`$ ts-node ${DEMO_FILE}`, ...schema, '', '$ npm test', ...captured];
  return session(rows, 'the Zod refinement and the suite, both offline');
}

mkdirSync(join(ROOT, 'assets'), { recursive: true });
for (const [name, markup] of [['glance.svg', glance()], ['demo.svg', demo()]]) {
  writeFileSync(join(ROOT, 'assets', name), markup);
  process.stdout.write(`wrote assets/${name}\n`);
}
