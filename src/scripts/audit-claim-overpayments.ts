/**
 * Scans merkle backup files for roots where a user's leaf amount appears to
 * ignore a previously inferred claim total.
 *
 * Usage:
 *   yarn audit:claim-overpayments
 *   MERKLE_BACKUPS_DIR=/path/to/merkle-backups yarn audit:claim-overpayments
 */

import { config as dotenv } from "dotenv";
dotenv();

import fs from "fs";
import path from "path";
import { ethers } from "ethers";

export interface BackupReward {
  address: string;
  earned: string;
}

export interface BackupTreeValue {
  value: [string, string];
  treeIndex: number;
}

export interface MerkleBackup {
  token?: string;
  entryCounter?: number;
  date?: string;
  root?: string;
  tree?: {
    values?: BackupTreeValue[];
  };
  grossRewards?: BackupReward[];
}

export interface BackupSnapshot {
  file: string;
  token: string;
  entry: number;
  date: string;
  root: string;
  leafAmounts: Map<string, ethers.BigNumber>;
  grossAmounts: Map<string, ethers.BigNumber>;
}

export interface SuspectedOverpayment {
  token: string;
  entry: number;
  date: string;
  root: string;
  file: string;
  user: string;
  grossAmount: string;
  leafAmount: string;
  expectedLeafAmount: string;
  inferredPriorClaimed: string;
  estimatedOverpayment: string;
}

const DUST_THRESHOLD = ethers.BigNumber.from(10).pow(16);

export function defaultBackupsDir(): string {
  return path.resolve(__dirname, "..", "..", "..", "incident-audit", "merkle-backups");
}

function parseEntryFromFile(file: string): number {
  const match = file.match(/entry(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseTokenFromFile(file: string): string {
  const match = file.match(/merkle-tree-([^-]+)-entry/);
  return match ? match[1] : "UNKNOWN";
}

export function readSnapshot(filePath: string): BackupSnapshot | null {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MerkleBackup;
  const file = path.basename(filePath);
  const token = raw.token ?? parseTokenFromFile(file);
  const entry = raw.entryCounter ?? parseEntryFromFile(file);
  const date = raw.date ?? "";
  const root = raw.root ?? "";

  const leafAmounts = new Map<string, ethers.BigNumber>();
  for (const leaf of raw.tree?.values ?? []) {
    leafAmounts.set(leaf.value[0].toLowerCase(), ethers.BigNumber.from(leaf.value[1]));
  }

  const grossAmounts = new Map<string, ethers.BigNumber>();
  for (const reward of raw.grossRewards ?? []) {
    grossAmounts.set(reward.address.toLowerCase(), ethers.BigNumber.from(reward.earned));
  }

  if (grossAmounts.size === 0 && leafAmounts.size === 0) {
    return null;
  }

  return { file, token, entry, date, root, leafAmounts, grossAmounts };
}

export function loadSnapshots(backupsDir: string): BackupSnapshot[] {
  return fs
    .readdirSync(backupsDir)
    .filter((file) => file.startsWith("merkle-tree-") && file.endsWith(".json"))
    .map((file) => readSnapshot(path.join(backupsDir, file)))
    .filter((snapshot): snapshot is BackupSnapshot => snapshot !== null)
    .sort((a, b) => {
      if (a.token !== b.token) return a.token.localeCompare(b.token);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.entry - b.entry;
    });
}

export function auditSnapshots(snapshots: BackupSnapshot[]): SuspectedOverpayment[] {
  const lastInferredClaimed = new Map<string, ethers.BigNumber>();
  const suspects: SuspectedOverpayment[] = [];

  for (const snapshot of snapshots) {
    for (const [user, grossAmount] of snapshot.grossAmounts) {
      const leafAmount = snapshot.leafAmounts.get(user) ?? ethers.BigNumber.from(0);
      const inferredClaimed = grossAmount.gt(leafAmount)
        ? grossAmount.sub(leafAmount)
        : ethers.BigNumber.from(0);
      const key = `${snapshot.token}:${user}`;
      const previousClaimed = lastInferredClaimed.get(key) ?? ethers.BigNumber.from(0);

      if (inferredClaimed.gt(DUST_THRESHOLD)) {
        lastInferredClaimed.set(key, inferredClaimed);
        continue;
      }

      if (previousClaimed.lte(DUST_THRESHOLD) || leafAmount.lte(DUST_THRESHOLD)) {
        continue;
      }

      const expectedLeafAmount = grossAmount.gt(previousClaimed)
        ? grossAmount.sub(previousClaimed)
        : ethers.BigNumber.from(0);

      if (leafAmount.lte(expectedLeafAmount.add(DUST_THRESHOLD))) {
        continue;
      }

      suspects.push({
        token: snapshot.token,
        entry: snapshot.entry,
        date: snapshot.date,
        root: snapshot.root,
        file: snapshot.file,
        user,
        grossAmount: grossAmount.toString(),
        leafAmount: leafAmount.toString(),
        expectedLeafAmount: expectedLeafAmount.toString(),
        inferredPriorClaimed: previousClaimed.toString(),
        estimatedOverpayment: leafAmount.sub(expectedLeafAmount).toString(),
      });
    }
  }

  return suspects;
}

export function main(): void {
  const backupsDir = process.env.MERKLE_BACKUPS_DIR || process.argv[2] || defaultBackupsDir();
  const snapshots = loadSnapshots(backupsDir);
  const suspects = auditSnapshots(snapshots);
  const report = {
    generatedAt: new Date().toISOString(),
    backupsDir,
    snapshotCount: snapshots.length,
    suspectCount: suspects.length,
    suspects,
  };

  const output = JSON.stringify(report, null, 2);
  if (process.env.AUDIT_CLAIM_OUTPUT_FILE) {
    fs.writeFileSync(process.env.AUDIT_CLAIM_OUTPUT_FILE, output);
    console.log(`Wrote claim overpayment audit to ${process.env.AUDIT_CLAIM_OUTPUT_FILE}`);
  } else {
    console.log(output);
  }
}

if (require.main === module) {
  main();
}
