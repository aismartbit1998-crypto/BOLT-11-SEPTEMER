import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Vite plugin that starts the Cortex engine (Express on port 5000)
 * as a child process when the dev/preview server starts, and kills it
 * on shutdown. This ensures the /api proxy always has a target.
 */
export function enginePlugin(): Plugin {
  let engineProc: ReturnType<typeof spawn> | null = null;
  let engineStarted = false;

  function startEngine() {
    if (engineProc || engineStarted) return;
    engineStarted = true;

    const engineDir = join(process.cwd(), '..', '..', 'engine');
    const rootDir = join(process.cwd(), '..', '..');
    const cwd = process.cwd().includes('apps') ? rootDir : process.cwd();

    engineProc = spawn('npx', ['tsx', join(engineDir, 'src', 'server.ts')], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    engineProc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) console.log(`\x1b[35m[engine]\x1b[0m ${line}`);
      }
    });

    engineProc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) console.error(`\x1b[35m[engine]\x1b[0m ${line}`);
      }
    });

    engineProc.on('exit', (code) => {
      console.log(`\x1b[35m[engine]\x1b[0m Engine process exited with code ${code}`);
      engineProc = null;
      engineStarted = false;
    });

    console.log('\x1b[35m[engine]\x1b[0m Starting Cortex engine on port 5000...');
  }

  function stopEngine() {
    if (engineProc) {
      console.log('\x1b[35m[engine]\x1b[0m Stopping engine process...');
      engineProc.kill('SIGTERM');
      engineProc = null;
    }
  }

  return {
    name: 'cortex-engine-spawn',
    apply: () => true,
    configureServer() {
      startEngine();
    },
    configurePreviewServer() {
      startEngine();
    },
    closeBundle() {
      stopEngine();
    },
  };
}
