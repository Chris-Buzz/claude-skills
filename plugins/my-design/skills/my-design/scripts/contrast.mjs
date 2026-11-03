#!/usr/bin/env node
// WCAG contrast check for a Design System tokens.json: every pair in pairs.json, in every theme.
// Usage: node contrast.mjs <tokens.json> <pairs.json>   (exit 0 = all pass, 1 = failures, 2 = bad input)
// pairs.json: [{"fg": "ink-2", "bg": "ground", "min": 4.5}, ...]  (min defaults to 4.5)

import fs from 'node:fs';

const [tokensPath, pairsPath] = process.argv.slice(2);
if (!tokensPath || !pairsPath) {
  console.error('usage: node contrast.mjs <tokens.json> <pairs.json>');
  process.exit(2);
}

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error(`cannot read ${p}: ${e.message}`); process.exit(2); }
};
const tokens = readJson(tokensPath);
const pairs = readJson(pairsPath);
const themes = (tokens.color?.themes || [{ id: 'default' }]).map((t) => t.id);
const byName = new Map((tokens.color?.tokens || []).map((t) => [t.name, t.value]));

// A token's value in a theme: a plain string is the first theme's; a missing theme inherits the first.
function valueIn(name, theme, depth = 0) {
  if (depth > 8) return null;
  const v = byName.get(name);
  if (v == null) return null;
  const raw = typeof v === 'string' ? v : (v[theme] ?? v[themes[0]]);
  if (typeof raw !== 'string') return null;
  const alias = raw.match(/^\{(.+)\}$/);
  return alias ? valueIn(alias[1], theme, depth + 1) : raw.trim();
}

function parseColor(s) {
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }
  m = s.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i);
  if (m) {
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const C = +m[2];
    const H = (+m[3] * Math.PI) / 180;
    const [a_, b_] = [C * Math.cos(H), C * Math.sin(H)];
    const l = (L + 0.3963377774 * a_ + 0.2158037573 * b_) ** 3;
    const mm = (L - 0.1055613458 * a_ - 0.0638541728 * b_) ** 3;
    const s2 = (L - 0.0894841775 * a_ - 1.291485548 * b_) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s2,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s2,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s2,
    ].map((x) => Math.min(1, Math.max(0, x)));
    const enc = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: enc(lin[0]), g: enc(lin[1]), b: enc(lin[2]), a };
  }
  return null;
}

const luminance = ({ r, g, b }) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
// A translucent foreground is composited over its background first.
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const ratio = (fg, bg) => {
  const [l1, l2] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

let failures = 0;
let checked = 0;
for (const theme of themes) {
  for (const p of pairs) {
    const min = p.min ?? 4.5;
    const fs_ = valueIn(p.fg, theme);
    const bs = valueIn(p.bg, theme);
    const fg = fs_ && parseColor(fs_);
    const bg = bs && parseColor(bs);
    if (!fg || !bg) {
      console.log(`[${theme}] ${p.fg} on ${p.bg}: cannot resolve (${fs_ ?? 'missing'} / ${bs ?? 'missing'})`);
      failures++;
      continue;
    }
    const r = ratio(fg, bg);
    checked++;
    const pass = r >= min;
    if (!pass) failures++;
    console.log(`${pass ? 'pass' : 'FAIL'} [${theme}] ${p.fg} ${fs_} on ${p.bg} ${bs}: ${r.toFixed(2)}:1 (min ${min})`);
  }
}
console.log(failures ? `${failures} failing or unresolved of ${pairs.length * themes.length}.` : `All ${checked} pairs pass.`);
process.exit(failures ? 1 : 0);
