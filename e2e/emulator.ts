import { Data, Effect } from 'effect';
import type { TestInfo } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

export const root = resolve(__dirname, '..');
export type Platform = 'emery' | 'gabbro';
export type Button = 'back' | 'up' | 'select' | 'down';
export type Loader = 'empty' | 'arrivals';
export interface MemorySample { reason: string; used: number; free: number }
interface Requests {
  install: { params: { path: string }; result: string };
  send: { params: { data: string }; result: null };
  press: { params: { button: Button }; result: null };
  launch: { params: Record<string, never>; result: null };
  time: { params: { seconds: number }; result: null };
  screenshot: { params: { mask_clock?: boolean; mask_loader?: Loader; crop_loader?: Loader }; result: string };
}
class EmulatorError extends Data.TaggedError('EmulatorError')<{ message: string; cause?: unknown }> {}
type Resume = (result: Effect.Effect<unknown, EmulatorError>) => void;
type WireMessage = { event: 'ready' } | { event: 'appmessage'; data: Record<string, unknown> }
  | { event: 'log'; message: string } | { id: number; result: unknown; error?: string };

function pebblePython() {
  if (process.env.PEBBLE_PYTHON) return process.env.PEBBLE_PYTHON;
  const command = execFileSync('which', ['pebble'], { encoding: 'utf8' }).trim();
  const first = readFileSync(realpathSync(command), 'utf8').split('\n')[0];
  const interpreter = /^#!(\/[^\s]+)$/.exec(first)?.[1];
  if (!interpreter) throw new Error('Set PEBBLE_PYTHON to the Python in the pebble-tool environment.');
  return interpreter; // Resolving the interpreter symlink would bypass its virtualenv.
}

function emulator(testInfo: TestInfo) {
  const project = testInfo.project.name;
  if (project !== 'emery' && project !== 'gabbro') throw new Error(`Unsupported test platform: ${project}`);
  const platform: Platform = project;
  const child = spawn(pebblePython(), ['-B', '-u', 'e2e/emulator.py', platform], {
    cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map<number, Resume>();
  const memory: MemorySample[] = [];
  let sequence = 0, output = '', available = false, stopping = false;
  let onMessage = (_data: Record<string, unknown>) => {};
  let onLog = (_message: string) => {};
  let readyResolve!: () => void, readyReject!: (error: EmulatorError) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()));
  child.stderr.on('data', chunk => { output += chunk; });
  function fail(cause: unknown) {
    const error = cause instanceof EmulatorError ? cause : new EmulatorError({ message: String(cause), cause });
    output += `Bridge error: ${error.stack}\n`;
    available = false;
    readyReject(error);
    for (const resume of pending.values()) resume(Effect.fail(error));
    pending.clear();
  }
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('exit', code => { if (!stopping) fail(new Error(`Bridge exited (${code}). See emulator.log.`)); });
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const message: WireMessage = JSON.parse(line);
      if ('event' in message) {
        if (message.event === 'ready') { available = true; readyResolve(); }
        else if (message.event === 'log') {
          const sample = /^Metro memory (\S+): used=(\d+) free=(\d+)$/.exec(message.message);
          if (sample) memory.push({ reason: sample[1], used: Number(sample[2]), free: Number(sample[3]) });
          onLog(message.message);
        }
        else onMessage(message.data);
      } else {
        const resume = pending.get(message.id);
        if (!resume) return;
        pending.delete(message.id);
        resume(message.error ? Effect.fail(new EmulatorError({ message: message.error })) : Effect.succeed(message.result));
      }
    } catch (error) { fail(error); }
  });
  function request<M extends keyof Requests>(method: M, params: Requests[M]['params']) {
    return Effect.callback<unknown, EmulatorError>(resume => {
      if (!available) { resume(Effect.fail(new EmulatorError({ message: 'Bridge unavailable. See emulator.log.' }))); return; }
      const id = ++sequence;
      pending.set(id, resume);
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      return Effect.sync(() => { pending.delete(id); });
    }).pipe(
      Effect.timeout('30 seconds'),
      Effect.catchTag('TimeoutError', cause => {
        const error = new EmulatorError({ message: `Emulator ${method} timed out. See emulator.log.`, cause });
        return Effect.sync(() => fail(error)).pipe(Effect.andThen(Effect.fail(error)));
      }),
      // The JSON-lines bridge returns the result belonging to this request's ID.
      Effect.map(value => value as Requests[M]['result']),
    );
  }
  const close = Effect.gen(function* () {
    stopping = true; available = false;
    for (const resume of pending.values()) resume(Effect.fail(new EmulatorError({ message: 'Emulator scope closed' })));
    pending.clear();
    child.kill('SIGTERM');
    yield* Effect.promise(() => exited).pipe(
      Effect.timeout('7 seconds'),
      Effect.catchTag('TimeoutError', () => Effect.sync(() => {
        try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
      }).pipe(Effect.andThen(Effect.promise(() => exited)), Effect.timeout('2 seconds'))),
    );
    writeFileSync(testInfo.outputPath('emulator.log'), output);
    yield* Effect.promise(() => testInfo.attach('emulator log', { body: output, contentType: 'text/plain' }));
  }).pipe(Effect.orDie);
  return {
    platform,
    ready: Effect.tryPromise({ try: () => ready, catch: error => error }).pipe(Effect.timeout('45 seconds')),
    set onMessage(callback: (data: Record<string, unknown>) => void) { onMessage = callback; },
    set onLog(callback: (message: string) => void) { onLog = callback; },
    request, close, memory,
  };
}

export const acquireEmulator = (testInfo: TestInfo) => Effect.acquireRelease(
  Effect.try({ try: () => emulator(testInfo), catch: cause => new EmulatorError({ message: 'Cannot start emulator bridge', cause }) }),
  device => device.close,
);
