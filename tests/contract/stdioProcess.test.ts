import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const serverEntry = path.join(projectRoot, 'dist/index.js');

describe('Stdio Process Test', () => {
  it('launches dist/index.js and responds to MCP initialize over stdio with clean stdout', async () => {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GDM_LOG_LEVEL: 'info',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(String(chunk));
    });

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });

    const initMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-stdio-client',
          version: '1.0.0',
        },
      },
    }) + '\n';

    child.stdin.write(initMessage);

    // Wait for the ready event on stderr or initialize response on stdout
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (
          (stdoutChunks.join('').includes('"jsonrpc":"2.0"') || stdoutChunks.join('').includes('"id":1')) &&
          stderrChunks.join('').includes('"tool":"server"')
        ) {
          clearInterval(check);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });

    child.kill();

    const fullStdout = stdoutChunks.join('');
    const fullStderr = stderrChunks.join('');

    // Stderr should contain startup logs
    expect(fullStderr).toContain('"tool":"server"');

    // Stdout should ONLY contain JSON-RPC message frames, no human log lines
    expect(fullStdout).toContain('"jsonrpc":"2.0"');
    expect(fullStdout).toContain('"name":"gmail-docs-mcp"');

    // Each non-empty line of stdout must be valid JSON
    const lines = fullStdout.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
    }
  }, 10000);
});
