// chatgpt-bridge: a token-light MCP server that drives your own ChatGPT in a visible
// Chrome window. It returns text and file paths, never page snapshots, so a round trip costs
// a few hundred tokens instead of tens of thousands.
//
// Rules baked in (see the plugin README): you sign in yourself, one request at a time, no batches,
// a challenge page stops the tool and hands the window back to you, and nothing is saved to disk
// except by chatgpt_save_image.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SEL, HOME, TEMP_HOME } from './selectors.mjs';

// The signed-in browser profile and the list of named chats live in your home folder, outside the plugin, so
// updating or reinstalling the plugin never signs you out. CHATGPT_BRIDGE_HOME moves both.
const DATA = process.env.CHATGPT_BRIDGE_HOME || path.join(os.homedir(), '.chatgpt-bridge');
const PROFILE = process.env.CHATGPT_BRIDGE_PROFILE || path.join(DATA, 'profile');
const STATE_FILE = path.join(DATA, 'state.json');
const DEFAULT_OUT = process.env.CHATGPT_BRIDGE_OUT || path.join(os.tmpdir(), 'chatgpt-bridge');
const MAX_TEXT = 6000;

// ---------- small helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: msg }) }] });

let queue = Promise.resolve();
/** One ChatGPT action at a time: you are watching one window, not a pile of tabs. */
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch { return { chats: {} }; }
}
async function saveState(state) {
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- browser ----------

let context = null;
let page = null;
let pending = null; // { before, baseline, startedAt } for a request still generating

async function ensurePage() {
  if (!context) {
    await fs.mkdir(PROFILE, { recursive: true });
    context = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
    });
    context.on('close', () => { context = null; page = null; pending = null; });
  }
  if (!page || page.isClosed()) {
    page = context.pages().find((p) => p.url().startsWith('https://chatgpt.com')) || (await context.newPage());
    if (!page.url().startsWith('https://chatgpt.com')) await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  }
  return page;
}

/** ready | signed_out | challenge. Never tries to fix the last two: that is the user's to do. */
async function pageState(p) {
  const title = await p.title().catch(() => '');
  if (/just a moment|attention required/i.test(title)) return 'challenge';
  const url = p.url();
  if (/auth\.openai\.com|\/auth\/|\/log-?in/i.test(url)) return 'signed_out';
  if (await p.locator('iframe[src*="challenges.cloudflare.com"]').count()) return 'challenge';
  if (await p.locator(SEL.loginButton).count()) return 'signed_out';
  if (await p.locator(SEL.composer).count()) return 'ready';
  return 'loading';
}

async function needUser(p, state) {
  await p.bringToFront().catch(() => {});
  return ok({
    status: 'needs_user',
    reason: state === 'challenge' ? 'ChatGPT is showing a bot check. Ask the user to clear it in the Chrome window.' : 'Not signed in. Ask the user to sign in to ChatGPT in the Chrome window, then retry.',
  });
}

/** Snapshot of the newest turn, as small as possible. The reply is the turn minus the user's bubble. */
function probe(p) {
  return p.evaluate(({ turnSel, stateSel, userSel, stopSel, labels, minPx, minShown }) => {
    const turns = [...document.querySelectorAll(turnSel)];
    const last = turns[turns.length - 1];
    let text = '';
    let imgs = [];
    let turnState = null;
    if (last) {
      // innerText needs the live, laid-out node for its line breaks, so cut the user's bubble out of
      // the turn's text rather than out of a detached clone.
      let all = last.innerText || '';
      for (const u of last.querySelectorAll(userSel)) all = all.replace(u.innerText || '', '\n');
      text = all.split('\n').map((l) => l.trim()).filter((l) => l && !labels.includes(l)).join('\n');
      imgs = [...last.querySelectorAll('img')]
        .filter((i) => !i.closest(userSel) && i.complete && Math.min(i.naturalWidth, i.naturalHeight) >= minPx
          && i.getBoundingClientRect().width >= minShown)
        .map((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));
      const st = last.matches(stateSel) ? last : last.querySelector(stateSel);
      turnState = st ? st.getAttribute('data-talvt-turn-state') : null;
    }
    return {
      turns: turns.length,
      generating: !!document.querySelector(stopSel) || turnState === 'in_progress',
      text,
      images: imgs,
    };
  }, { turnSel: SEL.turn, stateSel: SEL.turnState, userSel: SEL.userMessage, stopSel: SEL.stopButton, labels: SEL.srLabels, minPx: SEL.minImagePx, minShown: SEL.minShownPx });
}

async function waitForReply(p, maxWaitS) {
  const deadline = Date.now() + maxWaitS * 1000;
  let lastSig = '';
  let stable = 0;
  while (Date.now() < deadline) {
    const state = await pageState(p);
    if (state === 'challenge' || state === 'signed_out') return { status: 'needs_user', state };
    const s = await probe(p);
    // A new turn whose reply has text or an image; the user's own bubble alone does not count.
    const answered = s.turns > pending.baseline;
    const sig = `${s.text.length}|${s.images.length}`;
    if (answered && !s.generating && (s.text || s.images.length)) {
      stable = sig === lastSig ? stable + 1 : 0;
      if (stable >= 2) return { status: 'done', snap: s };
    } else {
      stable = 0;
    }
    lastSig = sig;
    await sleep(1000);
  }
  return { status: 'pending' };
}

function summarize(res, saveAs) {
  if (res.status === 'pending') return { status: 'pending', note: 'Still generating. Call chatgpt_wait.' };
  const { snap } = res;
  const text = snap.text.length > MAX_TEXT ? `${snap.text.slice(0, MAX_TEXT)}\n[cut: ${snap.text.length - MAX_TEXT} more chars]` : snap.text;
  return { status: 'done', chat: saveAs || undefined, text, images: snap.images };
}

async function finish(p, res, chatName) {
  if (res.status === 'needs_user') return needUser(p, res.state);
  if (res.status === 'done') {
    pending = null;
    if (chatName && /\/c\//.test(p.url())) {
      const state = await loadState();
      state.chats[chatName] = p.url();
      await saveState(state);
    }
  }
  return ok(summarize(res, chatName));
}

async function typePrompt(p, prompt) {
  await p.locator(SEL.composer).first().click();
  const lines = prompt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await p.keyboard.press('Shift+Enter');
    if (lines[i]) await p.keyboard.insertText(lines[i]);
  }
  const send = p.locator(SEL.sendButton).first();
  try {
    await send.waitFor({ state: 'visible', timeout: 5000 });
    await send.click();
  } catch {
    await p.keyboard.press('Enter');
  }
}

async function openChat(p, chat, temporary) {
  if (chat === 'current') return;
  if (chat === 'new') {
    await p.goto(temporary ? TEMP_HOME : HOME, { waitUntil: 'domcontentloaded' });
    return;
  }
  const state = await loadState();
  if (state.chats[chat]) await p.goto(state.chats[chat], { waitUntil: 'domcontentloaded' });
  else await p.goto(temporary ? TEMP_HOME : HOME, { waitUntil: 'domcontentloaded' });
}

/** Fetch the newest generated image's bytes from inside the page, so cookies and blob: URLs just work. */
async function fetchImage(p, index, maxPx) {
  return p.evaluate(async ({ turnSel, userSel, minPx, minShown, index, maxPx }) => {
    const turns = [...document.querySelectorAll(turnSel)];
    for (let t = turns.length - 1; t >= 0; t--) {
      const imgs = [...turns[t].querySelectorAll('img')].filter((i) => !i.closest(userSel) && i.complete
        && Math.min(i.naturalWidth, i.naturalHeight) >= minPx && i.getBoundingClientRect().width >= minShown);
      if (!imgs.length) continue;
      const img = imgs[index < 0 ? imgs.length + index : index];
      if (!img) return { error: `turn has ${imgs.length} image(s), no index ${index}` };
      const blob = await (await fetch(img.currentSrc || img.src, { credentials: 'include' })).blob();
      let out = blob;
      if (maxPx) {
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      }
      const b64 = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(out); });
      return { b64, type: out.type, w: img.naturalWidth, h: img.naturalHeight };
    }
    return { error: 'no generated image on the page' };
  }, { turnSel: SEL.turn, userSel: SEL.userMessage, minPx: SEL.minImagePx, minShown: SEL.minShownPx, index, maxPx });
}

// ---------- tools ----------

const server = new McpServer({ name: 'chatgpt-bridge', version: '1.0.0' });

server.registerTool('chatgpt_status', {
  description: 'Open (or reuse) the visible ChatGPT window and report whether it is ready, signed out, or showing a bot check. Cheap; call first.',
  inputSchema: {},
}, () => serial(async () => {
  const p = await ensurePage();
  const state = await pageState(p);
  if (state === 'signed_out' || state === 'challenge') return needUser(p, state);
  const s = await loadState();
  return ok({ status: state, url: p.url(), chats: Object.keys(s.chats) });
}));

server.registerTool('chatgpt_send', {
  description: 'Send one prompt to ChatGPT and wait for the reply. Works for text (ideas, critique, opposing views) and for image requests (ChatGPT draws in the same reply). Returns the reply text (cut at 6000 chars) and the size of any generated images, never the pixels; use chatgpt_view to look and chatgpt_save_image to keep. One request at a time, in the visible window. Never put secrets, client data or regulated data in a prompt.',
  inputSchema: {
    prompt: z.string().min(1).describe('The message. Newlines become Shift+Enter, so they stay one message.'),
    chat: z.string().default('new').describe('"new" for a fresh chat, "current" to continue the open one, or a name: continues that named chat if it exists, else starts one and remembers it under that name.'),
    temporary: z.boolean().default(false).describe('Start in a Temporary Chat (not saved to history). Only applies when a new chat starts.'),
    max_wait_s: z.number().int().min(10).max(600).default(180).describe('How long to wait before returning "pending". Images take 60-180 s.'),
  },
}, ({ prompt, chat, temporary, max_wait_s }) => serial(async () => {
  const p = await ensurePage();
  await openChat(p, chat, temporary);
  let state = await pageState(p);
  for (let i = 0; i < 10 && state === 'loading'; i++) { await sleep(500); state = await pageState(p); }
  if (state !== 'ready') return needUser(p, state === 'loading' ? 'signed_out' : state);
  await p.bringToFront().catch(() => {});
  const before = await probe(p);
  pending = { baseline: before.turns, startedAt: Date.now() };
  await typePrompt(p, prompt);
  const named = !['new', 'current'].includes(chat) ? chat : undefined;
  return finish(p, await waitForReply(p, max_wait_s), named);
}));

server.registerTool('chatgpt_wait', {
  description: 'Keep waiting for a reply that chatgpt_send returned as "pending".',
  inputSchema: { max_wait_s: z.number().int().min(10).max(600).default(180) },
}, ({ max_wait_s }) => serial(async () => {
  if (!pending || !page || page.isClosed()) return fail('nothing is pending');
  return finish(page, await waitForReply(page, max_wait_s));
}));

server.registerTool('chatgpt_view', {
  description: 'Look at a generated image from the newest turn: returns one downscaled JPEG for you to see (about 1k tokens at 768 px). Use sparingly; the text and sizes from chatgpt_send are often enough.',
  inputSchema: {
    index: z.number().int().default(0).describe('Which image in the newest turn that has any; negative counts from the end.'),
    max_px: z.number().int().min(256).max(1600).default(768),
  },
}, ({ index, max_px }) => serial(async () => {
  const p = await ensurePage();
  const r = await fetchImage(p, index, max_px);
  if (r.error) return fail(r.error);
  return { content: [{ type: 'image', data: r.b64, mimeType: r.type || 'image/jpeg' }, { type: 'text', text: JSON.stringify({ original: `${r.w}x${r.h}` }) }] };
}));

server.registerTool('chatgpt_save_image', {
  description: 'Save a generated image from the newest turn to disk at full size and return its path. Only call after the user has agreed to the save; say the destination first.',
  inputSchema: {
    dest_dir: z.string().optional().describe(`Absolute folder. Default ${DEFAULT_OUT}.`),
    name: z.string().regex(/^[\w.\- ]{1,80}$/).describe('File name without extension.'),
    index: z.number().int().default(0),
  },
}, ({ dest_dir, name, index }) => serial(async () => {
  const p = await ensurePage();
  const r = await fetchImage(p, index, 0);
  if (r.error) return fail(r.error);
  const ext = r.type === 'image/jpeg' ? 'jpg' : r.type === 'image/webp' ? 'webp' : 'png';
  const dir = dest_dir ? path.resolve(dest_dir) : DEFAULT_OUT;
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.${ext}`);
  await fs.writeFile(file, Buffer.from(r.b64, 'base64'));
  const stat = await fs.stat(file);
  return ok({ status: 'saved', path: file.replace(/\\/g, '/'), bytes: stat.size, size: `${r.w}x${r.h}` });
}));

server.registerTool('chatgpt_debug', {
  description: 'Selector repair aid: a short outline of the composer and the newest turn (tags, test ids, aria labels). Use only when chatgpt_send misbehaves.',
  inputSchema: {},
}, () => serial(async () => {
  const p = await ensurePage();
  const out = await p.evaluate(({ turnSel }) => {
    const describe = (el) => [el.tagName.toLowerCase(), el.id && `#${el.id}`, el.getAttribute('data-testid') && `[testid=${el.getAttribute('data-testid')}]`, el.getAttribute('data-message-author-role') && `[role=${el.getAttribute('data-message-author-role')}]`, el.getAttribute('aria-label') && `"${el.getAttribute('aria-label').slice(0, 40)}"`].filter(Boolean).join('');
    const turns = [...document.querySelectorAll(turnSel)];
    const last = turns[turns.length - 1];
    const pick = (root) => [...root.querySelectorAll('[data-testid],[aria-label],[data-message-author-role],img,button')].slice(0, 40).map(describe);
    return { title: document.title, url: location.href, turns: turns.length, lastTurn: last ? pick(last) : [], page: pick(document.body).slice(0, 25) };
  }, { turnSel: SEL.turn });
  return ok(out);
}));

server.registerTool('chatgpt_close', {
  description: 'Close the ChatGPT window. The sign-in survives in the profile folder.',
  inputSchema: {},
}, () => serial(async () => {
  if (context) await context.close().catch(() => {});
  context = null; page = null; pending = null;
  return ok({ status: 'closed' });
}));

process.on('SIGINT', async () => { if (context) await context.close().catch(() => {}); process.exit(0); });
await server.connect(new StdioServerTransport());
