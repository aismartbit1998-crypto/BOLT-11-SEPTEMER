import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const processes: { name: string; proc: ChildProcess }[] = [];

function log(name: string, color: string, msg: string) {
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const line = msg.replace(/\n$/, '');
  if (line.trim()) console.log(`${tag} ${line}`);
}

function startProcess(name: string, color: string, args: string[], cwd: string) {
  const proc = spawn(npmCmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: isWin,
  });

  proc.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().trim().split('\n')) {
      if (line.trim()) log(name, color, line);
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().trim().split('\n')) {
      if (line.trim()) log(name, color, line);
    }
  });

  proc.on('exit', (code) => {
    log(name, color, `Process exited with code ${code}`);
  });

  processes.push({ name, proc });
  log(name, color, 'Starting...');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('\n\x1b[1;37m========================================\x1b[0m');
  console.log('\x1b[1;37m   OnePalace — Staggered Boot Sequence   \x1b[0m');
  console.log('\x1b[1;37m========================================\x1b[0m\n');

  // ── Step 1: Engine (port 5000) ──────────────────────────────────────
  console.log('\x1b[1;35m[BOOT] Step 1/4: Starting Engine on port 5000...\x1b[0m');
  startProcess('engine', '35', ['run', 'dev', '--workspace', '@cortex/engine'], root);
  await sleep(3000);

  // ── Step 2: Master Admin (port 5175) — default preview port ────────
  console.log('\n\x1b[1;33m[BOOT] Step 2/4: Starting Master Admin on port 5175...\x1b[0m');
  startProcess('master', '33', ['run', 'dev', '--workspace', '@cortex/master'], root);
  await sleep(3000);

  // ── Step 3: Sub-Admin (port 5174) ───────────────────────────────────
  console.log('\n\x1b[1;33m[BOOT] Step 3/4: Starting Sub-Admin on port 5174...\x1b[0m');
  startProcess('admin', '93', ['run', 'dev', '--workspace', '@cortex/admin'], root);
  await sleep(2000);

  // ── Step 4: User (port 5173) ────────────────────────────────────────
  console.log('\n\x1b[1;36m[BOOT] Step 4/4: Starting User Panel on port 5173...\x1b[0m');
  startProcess('user', '36', ['run', 'dev', '--workspace', '@cortex/user'], root);
  await sleep(2000);

  // ── Print clickable URLs ────────────────────────────────────────────
  console.log('\n\x1b[1;37m========================================\x1b[0m');
  console.log('\x1b[1;37m   All panels are starting up!           \x1b[0m');
  console.log('\x1b[1;37m========================================\x1b[0m\n');
  console.log('  \x1b[4;33m http://localhost:5175 \x1b[0m  — Master Admin Panel');
  console.log('  \x1b[4;93m http://localhost:5174 \x1b[0m  — Sub-Admin Panel');
  console.log('  \x1b[4;36m http://localhost:5173 \x1b[0m  — User Panel');
  console.log('  \x1b[4;35m http://localhost:5000 \x1b[0m  — Engine API');
  console.log('\n  Default preview: \x1b[1;33mhttp://localhost:5175\x1b[0m (Master Admin)\n');
}

// ── Graceful shutdown ──────────────────────────────────────────────────
function shutdown(signal: string) {
  console.log(`\n\x1b[1;31m[BOOT] ${signal} received. Shutting down all processes...\x1b[0m`);
  for (const { name, proc } of processes) {
    if (!proc.killed) {
      try {
        if (isWin) {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']);
        } else {
          proc.kill('SIGTERM');
        }
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('\x1b[1;31m[BOOT] Fatal error:', err, '\x1b[0m');
  process.exit(1);
});
