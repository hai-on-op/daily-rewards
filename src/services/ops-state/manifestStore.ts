import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
  RootUpdateManifest,
  RootUpdateStatus,
  TokenRootMetadata,
  UnpauseManifest,
} from "./types";

const LATEST_ROOT_UPDATE_FILE = "latest-root-update.json";
const LATEST_UNPAUSE_FILE = "latest-unpause.json";

function resolveFromCwd(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

export function getOpsStateDir(): string {
  return process.env.OPS_STATE_DIR
    ? resolveFromCwd(process.env.OPS_STATE_DIR)
    : path.join(process.cwd(), "ops-state");
}

export function getOpsRunsDir(): string {
  return path.join(getOpsStateDir(), "runs");
}

export function getLatestRootUpdatePath(): string {
  return path.join(getOpsStateDir(), LATEST_ROOT_UPDATE_FILE);
}

export function getLatestUnpausePath(): string {
  return path.join(getOpsStateDir(), LATEST_UNPAUSE_FILE);
}

function ensureOpsDirs(): void {
  fs.mkdirSync(getOpsRunsDir(), { recursive: true });
}

function writeJsonAtomic(filepath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const tmp = `${filepath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, filepath);
}

export function sha256File(filepath: string | undefined): string | undefined {
  if (!filepath || !fs.existsSync(filepath)) return undefined;
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filepath));
  return hash.digest("hex");
}

export function getGitCommit(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function createRunId(now: Date): string {
  return `${now.toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
}

export function createRootUpdateManifest(): RootUpdateManifest {
  const now = new Date();
  const adjustmentFilePath = process.env.CLAIM_ADJUSTMENTS_FILE
    ? resolveFromCwd(process.env.CLAIM_ADJUSTMENTS_FILE)
    : undefined;

  return {
    version: 1,
    runId: createRunId(now),
    status: "running",
    startedAt: now.toISOString(),
    gitCommit: getGitCommit(),
    featureMode: process.env.FEATURE_MODE || "production",
    adjustmentFilePath,
    adjustmentFileHash: sha256File(adjustmentFilePath),
    errors: [],
    tokens: {},
  };
}

export function saveRootUpdateManifest(manifest: RootUpdateManifest): void {
  ensureOpsDirs();
  writeJsonAtomic(path.join(getOpsRunsDir(), `${manifest.runId}.json`), manifest);
  writeJsonAtomic(getLatestRootUpdatePath(), manifest);
}

export function readLatestRootUpdateManifest(): RootUpdateManifest | undefined {
  const latestPath = getLatestRootUpdatePath();
  if (!fs.existsSync(latestPath)) return undefined;
  return JSON.parse(fs.readFileSync(latestPath, "utf8")) as RootUpdateManifest;
}

export function saveUnpauseManifest(manifest: UnpauseManifest): void {
  ensureOpsDirs();
  writeJsonAtomic(getLatestUnpausePath(), manifest);
}

export function readLatestUnpauseManifest(): UnpauseManifest | undefined {
  const latestPath = getLatestUnpausePath();
  if (!fs.existsSync(latestPath)) return undefined;
  return JSON.parse(fs.readFileSync(latestPath, "utf8")) as UnpauseManifest;
}

export function updateManifestStatus(
  manifest: RootUpdateManifest,
  status: RootUpdateStatus
): void {
  manifest.status = status;
  if (status === "verified" || status === "needs_upload_repair" || status === "failed") {
    manifest.completedAt = new Date().toISOString();
  }
  saveRootUpdateManifest(manifest);
}

export function recordManifestError(
  manifest: RootUpdateManifest,
  error: unknown
): void {
  const message = error instanceof Error ? error.message : String(error);
  manifest.errors.push(message);
  manifest.status = "failed";
  manifest.completedAt = new Date().toISOString();
  saveRootUpdateManifest(manifest);
}

export function upsertManifestToken(
  manifest: RootUpdateManifest,
  token: string,
  metadata: TokenRootMetadata
): void {
  manifest.tokens[token] = {
    ...(manifest.tokens[token] || {}),
    ...metadata,
  };
  saveRootUpdateManifest(manifest);
}

export function resolveManifestFile(filepath: string): string {
  return resolveFromCwd(filepath);
}
