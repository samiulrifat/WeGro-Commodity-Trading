import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The chain tests' own Hardhat node, apart from the developer's (8545). The
 * tests move its clock and use its keys freely, so the dev chain's dates and
 * nonces are left alone. A fresh node and deployment for every run.
 */
export const TEST_CHAIN_PORT = 8546;
export const TEST_CHAIN_URL = `http://127.0.0.1:${TEST_CHAIN_PORT}`;
const CONTRACTS = resolve(__dirname, '..', '..', '..', 'contracts');
const DEPLOYMENT_ID = 'chain-tests';
const PID_FILE = join(tmpdir(), 'wegro-test-chain.pid');
const LOG_FILE = join(tmpdir(), 'wegro-test-chain.log');

/** Starts the node, deploys the platform on it and points the tests at it. */
export async function startTestChain(): Promise<void> {
  // One left by a run that was killed: give it a moment to go.
  if (stopTestChain()) {
    for (let i = 0; i < 50 && (await answers()); i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (await answers()) {
    throw new Error(
      `Port ${TEST_CHAIN_PORT} is taken by something else; the chain tests start their own node there`,
    );
  }
  const log = openSync(LOG_FILE, 'w');
  const node = spawn(
    'npx',
    ['hardhat', 'node', '--port', String(TEST_CHAIN_PORT)],
    { cwd: CONTRACTS, stdio: ['ignore', log, log], detached: true },
  );
  closeSync(log);
  node.unref();
  writeFileSync(PID_FILE, String(node.pid));
  const deadline = Date.now() + 60_000;
  while (!(await answers())) {
    if (Date.now() > deadline) {
      stopTestChain();
      throw new Error(
        `The test chain did not start; see ${LOG_FILE}:\n${readFileSync(LOG_FILE, 'utf8').slice(-2000)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const deploy = spawnSync(
    'npx',
    [
      'hardhat',
      'ignition',
      'deploy',
      'ignition/modules/Platform.ts',
      '--network',
      'chainTests',
      '--deployment-id',
      DEPLOYMENT_ID,
      '--reset',
    ],
    { cwd: CONTRACTS, input: 'y\n', encoding: 'utf8' },
  );
  if (deploy.status !== 0) {
    stopTestChain();
    throw new Error(
      `Deploying to the test chain failed:\n${(deploy.stdout + deploy.stderr).slice(-2000)}`,
    );
  }
  // Read by every test app (the environment wins over .env).
  process.env.CHAIN_RPC_URL = TEST_CHAIN_URL;
  process.env.CONTRACTS_DEPLOYMENT_DIR = join(
    CONTRACTS,
    'ignition',
    'deployments',
    DEPLOYMENT_ID,
  );
}

/** Stops the node this run (or a killed one) started; whether there was one. */
export function stopTestChain(): boolean {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  rmSync(PID_FILE, { force: true });
  try {
    // The whole group: npx and the node it started.
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
  return true;
}

/** Whether something answers JSON-RPC on the test port. */
async function answers(): Promise<boolean> {
  try {
    const res = await fetch(TEST_CHAIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
