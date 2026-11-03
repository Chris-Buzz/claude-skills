#!/usr/bin/env node
// Builds the review packet that outside reviewers (Codex, Antigravity) are given, and nothing else.
//   node packet.mjs <outDir> --mode design|code|architecture --brief <brief.md> [--root <dir>] [--max-kb 300] <file...>
// Writes <outDir>/packet.md (the brief, then each file with line numbers) and <outDir>/prompt.md (the task).
// Refuses secrets, keys, certificates, binaries, anything matching blocked.txt and oversized packets, so nothing
// private leaves the machine.
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
};
const mode = flag('--mode', 'code');
const briefPath = flag('--brief');
const root = resolve(flag('--root', process.cwd()));
const maxBytes = Number(flag('--max-kb', '300')) * 1024;
const [outDir, ...files] = args;

if (!outDir || !briefPath || files.length === 0 || !['design', 'code', 'architecture'].includes(mode)) {
  console.error('usage: packet.mjs <outDir> --mode design|code|architecture --brief <brief.md> [--root <dir>] [--max-kb N] <file...>');
  process.exit(2);
}

const SENSITIVE_PATH = /(^|[\\/])(\.env[^\\/]*|\.cert|\.git|\.ssh|\.aws|node_modules|credentials[^\\/]*|secrets?[^\\/]*|oauth_creds[^\\/]*|auth\.json|\.credentials[^\\/]*)([\\/]|$)|\.(pem|key|p12|pfx|crt|keystore)$/i;
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|\bsk-[A-Za-z0-9_-]{20,}|\bghp_[A-Za-z0-9]{30,}|\bxox[abp]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}/;

// Your own never-send list in ../blocked.txt: one case-insensitive regular expression per line, matched against each
// file's path, with # for comments. Put client folders, confidential projects and regulated material there.
const BLOCKED_FILE = join(HERE, '..', 'blocked.txt');
const BLOCKED = existsSync(BLOCKED_FILE)
  ? readFileSync(BLOCKED_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => new RegExp(line, 'i'))
  : [];

const refusals = [];
const parts = [];
let total = 0;
const brief = readFileSync(resolve(briefPath), 'utf8');
parts.push('# Review packet\n\n## Brief (facts only, no conclusions)\n\n' + brief.trim() + '\n');
total += Buffer.byteLength(parts[0]);

// Real paths, so a symlink or junction inside the root cannot point the packet at a file outside it. On Windows,
// relative() between two drives returns an absolute path, which is also outside.
const realRoot = realpathSync(resolve(root));
for (const file of files) {
  let abs;
  try { abs = realpathSync(resolve(root, file)); } catch { refusals.push(`${file}: not found`); continue; }
  const rel = relative(realRoot, abs).replaceAll('\\', '/');
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('../')) { refusals.push(`${file}: outside the root ${root}`); continue; }
  const blocked = BLOCKED.find((re) => re.test(rel) || re.test(abs));
  if (blocked) { refusals.push(`${rel}: matches ${blocked.source} in blocked.txt, so it never goes to outside reviewers`); continue; }
  if (SENSITIVE_PATH.test(rel)) { refusals.push(`${rel}: path looks like a secret, key, certificate or dependency folder`); continue; }
  let size;
  try { size = statSync(abs).size; } catch { refusals.push(`${rel}: not found`); continue; }
  if (size > 200 * 1024) { refusals.push(`${rel}: ${Math.round(size / 1024)} KB is over the 200 KB per-file limit`); continue; }
  const text = readFileSync(abs, 'utf8');
  if (text.includes('\0')) { refusals.push(`${rel}: binary file`); continue; }
  if (SECRET_TEXT.test(text)) { refusals.push(`${rel}: contains text that looks like a key or token`); continue; }
  const numbered = text.split(/\r?\n/).map((line, i) => `${String(i + 1).padStart(5)}  ${line}`).join('\n');
  const block = `\n## FILE ${rel}\n\n\`\`\`\n${numbered}\n\`\`\`\n`;
  total += Buffer.byteLength(block);
  if (total > maxBytes) { refusals.push(`${rel}: would take the packet past ${Math.round(maxBytes / 1024)} KB; cut the scope or raise --max-kb`); break; }
  parts.push(block);
}

if (refusals.length) {
  console.error('Refused:\n  ' + refusals.join('\n  '));
  process.exit(1);
}

mkdirSync(resolve(outDir), { recursive: true });
writeFileSync(join(resolve(outDir), 'packet.md'), parts.join(''));
const template = readFileSync(join(HERE, '..', 'references', 'seat-prompt.md'), 'utf8');
const section = new RegExp(`<!-- lenses:${mode} -->([\\s\\S]*?)<!-- /lenses -->`).exec(template)?.[1].trim();
if (!section) { console.error(`no lenses for mode ${mode} in references/seat-prompt.md`); process.exit(2); }
const prompt = template
  .replace(/<!-- lenses:[a-z]+ -->[\s\S]*?<!-- \/lenses -->\s*/g, '')
  .replace('{{LENSES}}', section);
writeFileSync(join(resolve(outDir), 'prompt.md'), prompt);
console.log(`packet.md ${Math.round(total / 1024)} KB, ${parts.length - 1} file(s), mode ${mode} -> ${resolve(outDir)}`);
