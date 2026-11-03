#!/usr/bin/env node
// Runs one outside reviewer ("seat") on a packet made by packet.mjs and writes its answer to a file.
//   node seat.mjs check
//   node seat.mjs codex|gemini <packetDir> <outFile> [--model M] [--effort low|medium|high|xhigh] [--timeout seconds]
// Each seat runs in a throwaway folder that holds only the packet, and any file it changes there is discarded.
// The folder is a working directory, not a read sandbox: Codex in its read-only mode can still read any file this
// user can, so text in a reviewed file that tells it to read elsewhere could pull other files into its answer.
// Codex gets the whole packet inside its prompt; Antigravity (agy) gets one read_file permission for packet.md.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOME = homedir();
const AGY = existsSync(join(HOME, '.gemini', 'bin', 'agy.exe')) ? join(HOME, '.gemini', 'bin', 'agy.exe') : 'agy';
const DEFAULTS = { codex: { model: 'gpt-6-astra', effort: 'high' }, gemini: { model: 'gemini-3.8-flash-high', effort: 'high' } };

function codexCompanion() {
  try {
    const installed = JSON.parse(readFileSync(join(HOME, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const path = installed.plugins?.['codex@openai-codex']?.[0]?.installPath;
    if (path && existsSync(join(path, 'scripts', 'codex-companion.mjs'))) return join(path, 'scripts', 'codex-companion.mjs');
  } catch { /* fall through */ }
  const fallback = join(HOME, '.claude', 'plugins', 'marketplaces', 'openai-codex', 'plugins', 'codex', 'scripts', 'codex-companion.mjs');
  return existsSync(fallback) ? fallback : null;
}

const [seat, ...rest] = process.argv.slice(2);

if (seat === 'check') {
  const companion = codexCompanion();
  const codex = companion ? spawnSync(process.execPath, [companion, 'setup', '--json'], { encoding: 'utf8', timeout: 60000 }) : null;
  const ready = codex?.status === 0 && /"loggedIn":\s*true/.test(codex.stdout);
  const agy = spawnSync(AGY, ['--version'], { encoding: 'utf8', timeout: 20000 });
  console.log(`codex:  ${ready ? 'ready' : companion ? 'plugin found but not signed in' : 'plugin not installed'} (default ${DEFAULTS.codex.model})`);
  console.log(`gemini: ${agy.status === 0 ? `ready, agy ${agy.stdout.trim().split(/\r?\n/)[0]}` : 'agy not found'} (default ${DEFAULTS.gemini.model})`);
  process.exit(0);
}

const [packetDirArg, outArg] = rest;
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
if (!['codex', 'gemini'].includes(seat) || !packetDirArg || !outArg) {
  console.error('usage: seat.mjs check | seat.mjs codex|gemini <packetDir> <outFile> [--model M] [--effort E] [--timeout S]');
  process.exit(2);
}
const model = opt('--model', DEFAULTS[seat].model);
const effort = opt('--effort', DEFAULTS[seat].effort);
const seconds = Number(opt('--timeout', '900'));
const packetDir = resolve(packetDirArg);
const out = resolve(outArg);

const packet = readFileSync(join(packetDir, 'packet.md'), 'utf8');
const prompt = readFileSync(join(packetDir, 'prompt.md'), 'utf8');
const work = mkdtempSync(join(tmpdir(), `council-${seat}-`));
const vendor = seat === 'codex' ? 'OpenAI' : 'Google';
console.error(`Sending ${Math.round((packet.length + prompt.length) / 1024)} KB to ${vendor} (${model}, effort ${effort}).`);

const digest = () => readdirSync(work).sort().map((f) => `${f}:${createHash('sha256').update(readFileSync(join(work, f))).digest('hex')}`).join('|');
const started = Date.now();
let run;
let text;

if (seat === 'codex') {
  const companion = codexCompanion();
  if (!companion) { finish('NOT RUN: the Codex plugin is not installed'); }
  writeFileSync(join(work, 'prompt.md'), `${prompt}\n\n---\n\n${packet}`);
  const before = digest();
  run = spawnSync(process.execPath, [companion, 'task', '--fresh', '--model', model, '--effort', effort, '--cwd', work, '--prompt-file', join(work, 'prompt.md')], { cwd: work, encoding: 'utf8', timeout: seconds * 1000, maxBuffer: 64 * 1024 * 1024 });
  text = run.stdout.split(/\r?\n/).filter((l) => !l.startsWith('[codex]')).join('\n').trim();
  if (digest() !== before) text = `WARNING: the reviewer changed files in its throwaway folder (discarded).\n\n${text}`;
} else {
  writeFileSync(join(work, 'packet.md'), `${prompt}\n\n---\n\n${packet}`);
  const before = digest();
  const allow = ['read_file(packet.md)', `read_file(${join(work, 'packet.md').replaceAll('\\', '/')})`];
  run = spawnSync(AGY, [
    '-p=Use only the read_file tool, on packet.md in the current folder, and do exactly what it says. It holds your task and the material. Do not run commands and do not write files.',
    '--mode', 'plan', '--model', model, '--effort', effort, '--print-timeout', `${seconds}s`,
    '--settings', JSON.stringify({ permissions: { allow } }),
  ], { cwd: work, encoding: 'utf8', timeout: (seconds + 30) * 1000, maxBuffer: 64 * 1024 * 1024 });
  text = (run.stdout ?? '').trim();
  if (digest() !== before) text = `WARNING: the reviewer changed files in its throwaway folder (discarded).\n\n${text}`;
}

if (run.error || run.status !== 0 || !text || /^jetski: no output produced/.test(text)) {
  finish(`NOT RUN: ${run.error?.message ?? (text || run.stderr || `exit ${run.status}`).toString().slice(0, 400)}`);
}
finish(text);

function finish(body) {
  const header = `<!-- seat: ${seat} | model: ${model} | effort: ${effort} | ${Math.round((Date.now() - started) / 1000)} s -->\n\n`;
  writeFileSync(out, header + body + '\n');
  // Windows can keep the folder locked for a moment after the seat exits; the answer is already saved.
  try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { /* temp folder, cleaned by the OS later */ }
  console.log(`${body.startsWith('NOT RUN') ? 'not run' : 'done'}: ${out}`);
  process.exit(body.startsWith('NOT RUN') ? 1 : 0);
}
