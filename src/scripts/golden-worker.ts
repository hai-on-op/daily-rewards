/**
 * Golden Master Worker
 *
 * This script runs as a child process. It:
 * 1. Loads .env
 * 2. Applies env overrides passed via GOLDEN_ENV_OVERRIDES
 * 3. Dynamically imports combineResults (after env is fully set)
 * 4. Runs combineResults() and writes the normalized result to stdout
 *
 * Must run as a separate process because config/index.ts calls dotenv() at
 * import time, and several modules capture config values at module scope.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Step 1: Load .env
dotenvConfig({ path: path.join(__dirname, '..', '..', '.env') });

// Step 2: Apply overrides from parent process
const overrides = JSON.parse(process.env.GOLDEN_ENV_OVERRIDES || '{}');
for (const [key, value] of Object.entries(overrides)) {
  process.env[key] = value as string;
}

// Step 3: Now import the app module (env is fully configured)
async function run() {
  const { combineResults } = require('../modules/result-combiner');

  // Step 4: Run calculation
  const result = await combineResults();

  // Normalize: sort tokens, sort addresses within each token
  const normalized: Record<string, { address: string; earned: number }[]> = {};
  for (const token of Object.keys(result).sort()) {
    normalized[token] = result[token]
      .map((r: any) => ({ address: r.address.toLowerCase(), earned: r.earned }))
      .sort((a: any, b: any) => a.address.localeCompare(b.address));
  }

  // Write result as JSON to stdout (use a marker so parent can extract it)
  const output = JSON.stringify(normalized);
  process.stdout.write(`\n__GOLDEN_RESULT_START__\n${output}\n__GOLDEN_RESULT_END__\n`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Golden worker failed:', err);
    process.exit(1);
  });
