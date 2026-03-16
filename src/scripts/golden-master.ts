/**
 * Golden Master Test for combineResults()
 *
 * Usage:
 *   yarn golden:record   — compute rewards, save snapshot
 *   yarn golden:verify   — re-compute and compare against saved snapshot
 *
 * Block range is auto-computed at record time from the current chain head
 * and frozen in the snapshot file. The existing .env is used for all config
 * (subgraph URLs, API keys, etc.) — only block-range vars are overridden.
 */

import { execSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import { providers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Load .env so we can read RPC_URL for fetching current block
dotenvConfig({ path: path.join(__dirname, '..', '..', '.env') });

const SNAPSHOTS_DIR = path.join(__dirname, '..', '..', 'golden-snapshots');
const WORKER_PATH = path.join(__dirname, 'golden-worker.ts');
const SNAPSHOT_FILE = path.join(SNAPSHOTS_DIR, 'snapshot.json');
const MAX_RETRIES = 3;

type Snapshot = {
  recordedAt: string;
  envOverrides: Record<string, string>;
  result: Record<string, { address: string; earned: number }[]>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchWindowsEndBlock(
  windowsJson: string | undefined,
  endBlock: number
): string {
  if (!windowsJson) return '[]';
  try {
    const windows = JSON.parse(windowsJson);
    return JSON.stringify(
      windows.map((w: any) => ({
        ...w,
        endBlock: w.endBlock ?? endBlock,
      }))
    );
  } catch {
    return '[]';
  }
}

function buildEnvOverrides(
  endBlock: number
): Record<string, string> {
  return {
    END_BLOCK: String(endBlock),
    LP_END_BLOCK: String(endBlock),
    HAIVELO_END_BLOCK: String(endBlock),
    MINTER_END_BLOCK: String(endBlock),
    LP_STAKING_END_BLOCK: String(endBlock),
    HAIAERO_END_BLOCK: String(endBlock),
    // Patch windows so every entry has an explicit endBlock
    REWARD_MINTER_WINDOWS: patchWindowsEndBlock(
      process.env.REWARD_MINTER_WINDOWS,
      endBlock
    ),
    REWARD_LP_STAKING_WINDOWS: patchWindowsEndBlock(
      process.env.REWARD_LP_STAKING_WINDOWS,
      endBlock
    ),
    // Disable features that need local services or are non-deterministic
    HAIVELO_LP_STAKING_ENABLED: 'false',
    // Disable ALL debug/write flags to ensure zero file writes
    DEBUG_HAIAERO: 'false',
    DEBUG_REWARDS: 'false',
    DEBUG: 'false',
    // Disable all on-chain and external service features (safety guard)
    FEATURE_UPDATE_MERKLE_ROOTS: 'false',
    FEATURE_PAUSE_DISTRIBUTOR: 'false',
    FEATURE_UPLOAD_CLOUDFLARE: 'false',
  };
}

function runWorkerOnce(envOverrides: Record<string, string>): string {
  const env = {
    ...process.env,
    GOLDEN_ENV_OVERRIDES: JSON.stringify(envOverrides),
  };

  return execSync(`npx ts-node "${WORKER_PATH}"`, {
    env,
    cwd: path.join(__dirname, '..', '..'),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024, // 50MB
    timeout: 10 * 60 * 1000, // 10 minutes
    stdio: ['pipe', 'pipe', 'inherit'], // stderr goes to terminal
  });
}

function runWorker(envOverrides: Record<string, string>): Record<string, { address: string; earned: number }[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  Spawning worker process (attempt ${attempt}/${MAX_RETRIES})...`);
      const output = runWorkerOnce(envOverrides);

      // Extract result from stdout using markers
      const startMarker = '__GOLDEN_RESULT_START__';
      const endMarker = '__GOLDEN_RESULT_END__';
      const startIdx = output.indexOf(startMarker);
      const endIdx = output.indexOf(endMarker);

      if (startIdx === -1 || endIdx === -1) {
        throw new Error('Could not find result markers in worker output');
      }

      const jsonStr = output.slice(startIdx + startMarker.length, endIdx).trim();
      return JSON.parse(jsonStr);
    } catch (err: any) {
      lastError = err;
      const isTransient = err.message && (
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('missing response') ||
        err.message.includes('socket hang up')
      );

      if (isTransient && attempt < MAX_RETRIES) {
        console.log(`  Transient error, retrying in 5s...`);
        execSync('sleep 5');
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Worker failed after retries');
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

type Mismatch = {
  token: string;
  address: string;
  expected: number;
  actual: number;
  diff: number;
};

function compareResults(
  actual: Record<string, { address: string; earned: number }[]>,
  expected: Record<string, { address: string; earned: number }[]>,
  tolerance = 1e-10
): { pass: boolean; mismatches: Mismatch[]; extraTokens: string[]; missingTokens: string[] } {
  const mismatches: Mismatch[] = [];
  const actualTokens = Object.keys(actual);
  const expectedTokens = Object.keys(expected);
  const allTokens = Array.from(new Set(actualTokens.concat(expectedTokens)));
  const extraTokens: string[] = [];
  const missingTokens: string[] = [];

  allTokens.forEach((token) => {
    if (!expected[token]) {
      extraTokens.push(token);
      return;
    }
    if (!actual[token]) {
      missingTokens.push(token);
      return;
    }

    const actualMap: Record<string, number> = {};
    actual[token].forEach(r => { actualMap[r.address] = r.earned; });
    const expectedMap: Record<string, number> = {};
    expected[token].forEach(r => { expectedMap[r.address] = r.earned; });

    const allAddresses = Array.from(
      new Set(Object.keys(actualMap).concat(Object.keys(expectedMap)))
    );

    allAddresses.forEach((addr) => {
      const a = actualMap[addr] ?? 0;
      const e = expectedMap[addr] ?? 0;
      const denom = Math.max(Math.abs(e), 1e-18);
      const relativeDiff = Math.abs(a - e) / denom;

      if (relativeDiff > tolerance) {
        mismatches.push({ token, address: addr, expected: e, actual: a, diff: relativeDiff });
      }
    });
  });

  return {
    pass: mismatches.length === 0 && extraTokens.length === 0 && missingTokens.length === 0,
    mismatches,
    extraTokens,
    missingTokens,
  };
}

// ---------------------------------------------------------------------------
// Record mode
// ---------------------------------------------------------------------------

async function record() {
  console.log('=== GOLDEN MASTER: RECORD MODE ===\n');

  // Fetch current block
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL not set in .env');
  const provider = new providers.StaticJsonRpcProvider(rpcUrl);
  const currentBlock = await provider.getBlockNumber();
  const endBlock = currentBlock - 8000; // ~4.4 hours ago (safe from reorgs)
  console.log(`Current block: ${currentBlock}`);
  console.log(`Using endBlock: ${endBlock}\n`);

  const envOverrides = buildEnvOverrides(endBlock);
  const result = runWorker(envOverrides);

  const tokenSummary = Object.entries(result)
    .map(([t, r]) => `${t}: ${r.length} addresses`)
    .join(', ');
  console.log(`  Result: ${tokenSummary}`);

  const snapshot: Snapshot = {
    recordedAt: new Date().toISOString(),
    envOverrides,
    result,
  };

  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`  Saved to ${SNAPSHOT_FILE}\n`);

  console.log('=== RECORD COMPLETE ===');
}

// ---------------------------------------------------------------------------
// Verify mode
// ---------------------------------------------------------------------------

async function verify() {
  console.log('=== GOLDEN MASTER: VERIFY MODE ===\n');

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error(`Snapshot not found: ${SNAPSHOT_FILE}`);
    console.error('Run "yarn golden:record" first.');
    process.exit(1);
  }

  const snapshot: Snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
  console.log(`Recorded: ${snapshot.recordedAt}`);
  console.log(`End block: ${snapshot.envOverrides.END_BLOCK}\n`);

  const actual = runWorker(snapshot.envOverrides);
  const { pass, mismatches, extraTokens, missingTokens } = compareResults(actual, snapshot.result);

  if (pass) {
    console.log('\n=== PASS ===');
    process.exit(0);
  }

  console.log('\n=== FAIL ===\n');

  if (missingTokens.length > 0) {
    console.log(`Missing tokens: ${missingTokens.join(', ')}`);
  }
  if (extraTokens.length > 0) {
    console.log(`Extra tokens: ${extraTokens.join(', ')}`);
  }
  if (mismatches.length > 0) {
    console.log(`Mismatches (${mismatches.length}):`);
    mismatches.slice(0, 20).forEach((m) => {
      console.log(
        `  ${m.token} | ${m.address} | expected=${m.expected} actual=${m.actual} diff=${m.diff.toExponential(2)}`
      );
    });
    if (mismatches.length > 20) {
      console.log(`  ... and ${mismatches.length - 20} more`);
    }
  }

  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const mode = process.argv.includes('--record') ? 'record' : 'verify';

if (mode === 'record') {
  record().catch((err) => {
    console.error('Record failed:', err);
    process.exit(1);
  });
} else {
  verify().catch((err) => {
    console.error('Verify failed:', err);
    process.exit(1);
  });
}