// Starts the chatgpt-bridge MCP server. On the first start after an install it runs `npm install` in this folder
// (about 30 seconds), so the plugin works without a manual setup step. npm's output goes to stderr, because stdout
// carries the MCP protocol and anything else written there would break it.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ready = ['@modelcontextprotocol/sdk', 'playwright-core', 'zod'].every((dep) => existsSync(join(HERE, 'node_modules', dep)));

if (!ready) {
  console.error('chatgpt-bridge: installing its dependencies once (npm install)...');
  const npm = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: HERE,
    stdio: ['ignore', 2, 2],
    // On Windows, npm is a .cmd script, which Node only starts through a shell.
    shell: process.platform === 'win32',
  });
  if (npm.status !== 0) {
    console.error(`chatgpt-bridge: npm install failed in ${HERE}. Run it there by hand and restart Claude Code.`);
    process.exit(1);
  }
}

await import('./server.mjs');
