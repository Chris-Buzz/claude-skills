#!/usr/bin/env node
// Renders a Design canvas's artboards to PNGs locally, for the review step: no claude.ai sign-in
// needed. It emulates the .dc.html basics (data-props defaults, renderVals(), {{holes}}, <sc-if>,
// <sc-for>) and screenshots each artboard at its canvas size in your installed Chrome, driven by
// playwright-core (run `npm install` once in this folder). Interactions are not run; each artboard
// renders in its initial state.
//
// Artboard scripts can be edited by other people on claude.ai, so they never run in Node: all
// emulation happens inside the headless page, in Chrome's sandbox, with no network but Google
// Fonts (request routing plus a CSP with connect-src 'none'), so a script can't reach local
// services or anything else.
//
// Usage: node render-board.mjs <board-root> <out-dir> [--theme dark|light] [--only <substring>]
//   <board-root> holds project/canvas.json. Writes <out-dir>/<file path with / as __>.png

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const theme = flag('--theme');
const only = flag('--only');
const [rootArg, outArg] = args;
if (!rootArg || !outArg) {
  console.error('usage: node render-board.mjs <board-root> <out-dir> [--theme dark|light] [--only <substring>]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright-core'));
} catch {
  console.error(`playwright-core not found. Run \`npm install\` once in ${path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')}.`);
  process.exit(2);
}

const root = path.resolve(rootArg);
const project = path.join(root, 'project');
const canvas = JSON.parse(fs.readFileSync(path.join(project, 'canvas.json'), 'utf8'));
fs.mkdirSync(outArg, { recursive: true });

// Runs inside the page. Builds the artboard's initial render from its template and logic class.
function emulate({ body, script, propsAttr, theme }) {
  const get = (scope, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), scope);
  class DCLogic {
    constructor(props) { this.props = props; this.state = null; }
    setState(s) { this.state = { ...(this.state || {}), ...(typeof s === 'function' ? s(this.state || {}) : s) }; }
    forceUpdate() {}
  }
  const defs = propsAttr ? JSON.parse(propsAttr) : {};
  const props = {};
  for (const [k, v] of Object.entries(defs)) if (k !== '$preview' && v && 'default' in v) props[k] = v.default;
  if (theme && 'theme' in defs) props.theme = theme;
  let scope = {};
  if (script) {
    const Component = new Function('DCLogic', `${script}\nreturn Component;`)(DCLogic);
    scope = new Component(props).renderVals();
  }
  const render = (tpl, sc) => {
    tpl = tpl.replace(/<sc-for list="\{\{\s*([\w.$]+)\s*\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g,
      (_, list, as, inner) => (get(sc, list) || []).map((item, i) => render(inner, { ...sc, [as]: item, $index: i })).join(''));
    tpl = tpl.replace(/<sc-if value="\{\{\s*([\w.$]+)\s*\}\}"[^>]*>([\s\S]*?)<\/sc-if>/g,
      (_, cond, inner) => (get(sc, cond) ? render(inner, sc) : ''));
    tpl = tpl.replace(/\s(on[A-Z]\w*)="\{\{[^}]*\}\}"/g, '');
    return tpl.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_, p) => { const v = get(sc, p); return v == null ? '' : String(v); });
  };
  document.body.innerHTML = render(body, scope);
}

const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'">`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
await context.route('**/*', (route) => {
  const url = route.request().url();
  return FONT_HOSTS.some((h) => url.startsWith(h)) ? route.continue() : route.abort();
});
const files = canvas.order.filter((f) => !only || f.includes(only));
let done = 0;
for (const file of files) {
  const b = canvas.boards[file];
  const src = fs.readFileSync(path.join(project, file), 'utf8');
  const helmet = (/<helmet>([\s\S]*?)<\/helmet>/.exec(src) || [])[1] || '';
  const body = ((/<x-dc>([\s\S]*?)<\/x-dc>/.exec(src) || [])[1] || '').replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const m = /<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/.exec(src);
  const propsAttr = m ? m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&') : '';
  const page = await context.newPage();
  await page.setViewportSize({ width: b.w, height: b.h });
  try {
    // Uploaded assets (/_blob/...) only resolve on claude.ai; they render as blanks here.
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">${CSP}${helmet}</head><body></body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(emulate, { body, script: m ? m[2] : '', propsAttr, theme });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(outArg, `${file.replace(/\.dc\.html$/, '').replace(/[\\/]/g, '__')}${theme ? `.${theme}` : ''}.png`);
    await page.screenshot({ path: out, fullPage: !!b.expand });
    done++;
  } catch (e) {
    console.log(`skip ${file}: ${e.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`rendered ${done} of ${files.length} artboards to ${path.resolve(outArg).replace(/\\/g, '/')}`);
