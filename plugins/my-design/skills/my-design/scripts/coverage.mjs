#!/usr/bin/env node
// Page coverage check for a /my-design board: every page in pages.json must have an artboard in the
// canvas, every artboard file must exist, and every checklist category must be considered.
// Usage: node coverage.mjs <pages.json> <canvas.json>   (exit 0 = complete, 1 = gaps, 2 = bad input)

import fs from 'node:fs';
import path from 'node:path';

const CATEGORIES = [
  'entry', 'auth', 'first_run', 'core', 'create_edit', 'states', 'navigation',
  'notifications', 'settings', 'platform', 'system', 'legal_support', 'responsive',
];

const [pagesPath, canvasPath] = process.argv.slice(2);
if (!pagesPath || !canvasPath) {
  console.error('usage: node coverage.mjs <pages.json> <canvas.json>');
  process.exit(2);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`cannot read ${p}: ${e.message}`);
    process.exit(2);
  }
}

const inv = readJson(pagesPath);
const canvas = readJson(canvasPath);
const pages = Array.isArray(inv.pages) ? inv.pages : [];
const boards = canvas.boards && typeof canvas.boards === 'object' ? canvas.boards : {};
const projectDir = path.dirname(canvasPath);
const problems = [];

// The inventory itself: ids and files unique, files shaped like artboards.
const seenIds = new Set();
const seenFiles = new Map();
for (const p of pages) {
  if (!p.id || !p.file) { problems.push(`page without id or file: ${JSON.stringify(p)}`); continue; }
  if (seenIds.has(p.id)) problems.push(`duplicate page id: ${p.id}`);
  seenIds.add(p.id);
  if (!p.file.endsWith('.dc.html')) problems.push(`${p.id}: file must end in .dc.html (${p.file})`);
  if (seenFiles.has(p.file)) problems.push(`${p.id} and ${seenFiles.get(p.file)} share ${p.file}`);
  seenFiles.set(p.file, p.id);
}

// Every page on the board, and its file written.
const missing = [];
const unwritten = [];
for (const p of pages) {
  if (!p.file) continue;
  if (!boards[p.file]) missing.push(`${p.id} (${p.file})`);
  else if (!fs.existsSync(path.join(projectDir, p.file))) unwritten.push(`${p.id} (${p.file})`);
}

// Artboards that no page claims: concept and reference boards are allowed if listed in `extras`.
const allowed = new Set([...seenFiles.keys(), ...(inv.extras || [])]);
const extra = Object.keys(boards).filter((f) => !allowed.has(f));

// Every checklist category answered, and every page id it names real.
const considered = inv.considered || {};
const unconsidered = CATEGORIES.filter((c) => !(c in considered));
for (const [cat, v] of Object.entries(considered)) {
  if (Array.isArray(v)) {
    for (const id of v) if (!seenIds.has(id)) problems.push(`considered.${cat} names unknown page ${id}`);
    if (!v.length) problems.push(`considered.${cat} is an empty list; use "n/a: <reason>"`);
  } else if (typeof v !== 'string' || !/^n\/a: .{3,}/.test(v)) {
    problems.push(`considered.${cat} must be page ids or "n/a: <reason>"`);
  }
}

const covered = pages.length - missing.length - unwritten.length;
console.log(`pages: ${pages.length}  on board: ${covered}  artboards: ${Object.keys(boards).length}`);
if (missing.length) console.log(`missing from board:\n  ${missing.join('\n  ')}`);
if (unwritten.length) console.log(`listed but file not written:\n  ${unwritten.join('\n  ')}`);
if (extra.length) console.log(`artboards no page claims (add to pages or extras):\n  ${extra.join('\n  ')}`);
if (unconsidered.length) console.log(`checklist categories not considered: ${unconsidered.join(', ')}`);
if (problems.length) console.log(`inventory problems:\n  ${problems.join('\n  ')}`);

const ok = !missing.length && !unwritten.length && !extra.length && !unconsidered.length && !problems.length;
console.log(ok ? `COMPLETE: all ${pages.length} pages have artboards.` : 'INCOMPLETE: fix the items above.');
process.exit(ok ? 0 : 1);
