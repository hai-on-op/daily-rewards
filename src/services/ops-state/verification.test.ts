import fs from "fs";
import os from "os";
import path from "path";
import { RootUpdateManifest } from "./types";
import {
  RewardDistributorReader,
  verifyRootUpdateForUnpause,
} from "./verification";

function createManifest(overrides: Partial<RootUpdateManifest> = {}): RootUpdateManifest {
  return {
    version: 1,
    runId: "run-1",
    status: "verified",
    startedAt: "2026-05-02T00:00:00.000Z",
    featureMode: "production",
    entryCounterBefore: 314,
    entryCounterAfter: 315,
    errors: [],
    tokens: {},
    ...overrides,
  };
}

function createReader(roots: Record<string, string>, paused = true): RewardDistributorReader {
  return {
    paused: jest.fn().mockResolvedValue(paused),
    epochCounter: jest.fn().mockResolvedValue("315"),
    merkleRoots: jest.fn(async (tokenAddress: string) => roots[tokenAddress]),
  };
}

describe("ops-state verification", () => {
  let tempDir: string;
  const previousOpsStateDir = process.env.OPS_STATE_DIR;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-rewards-verify-"));
    process.env.OPS_STATE_DIR = path.join(tempDir, "ops-state");
  });

  afterEach(() => {
    if (previousOpsStateDir === undefined) delete process.env.OPS_STATE_DIR;
    else process.env.OPS_STATE_DIR = previousOpsStateDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeBackup(root: string): string {
    const backupFile = path.join(tempDir, "backup.json");
    fs.writeFileSync(backupFile, JSON.stringify({ root }));
    return backupFile;
  }

  it("passes when manifest, contract, backup, and Cloudflare status all match", async () => {
    const backupFile = writeBackup("0xabc");
    const manifest = createManifest({
      tokens: {
        KITE: {
          tokenAddress: "0xKITE",
          root: "0xabc",
          backupFile,
          cloudflareUploaded: true,
        },
      },
    });

    const result = await verifyRootUpdateForUnpause(
      manifest,
      createReader({ "0xKITE": "0xabc" })
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(manifest.tokens.KITE.backupVerified).toBe(true);
    expect(manifest.tokens.KITE.onChainVerified).toBe(true);
  });

  it("fails when the on-chain root differs", async () => {
    const backupFile = writeBackup("0xabc");
    const manifest = createManifest({
      tokens: {
        KITE: {
          tokenAddress: "0xKITE",
          root: "0xabc",
          backupFile,
          cloudflareUploaded: true,
        },
      },
    });

    const result = await verifyRootUpdateForUnpause(
      manifest,
      createReader({ "0xKITE": "0xdef" })
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("on-chain root");
  });

  it("fails when Cloudflare upload did not succeed", async () => {
    const backupFile = writeBackup("0xabc");
    const manifest = createManifest({
      tokens: {
        KITE: {
          tokenAddress: "0xKITE",
          root: "0xabc",
          backupFile,
          cloudflareUploaded: false,
        },
      },
    });

    const result = await verifyRootUpdateForUnpause(
      manifest,
      createReader({ "0xKITE": "0xabc" })
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("cloudflare: KITE upload was not successful");
  });

  it("can verify an updated_on_chain manifest before marking it verified", async () => {
    const backupFile = writeBackup("0xabc");
    const manifest = createManifest({
      status: "updated_on_chain",
      tokens: {
        KITE: {
          tokenAddress: "0xKITE",
          root: "0xabc",
          backupFile,
          cloudflareUploaded: true,
        },
      },
    });

    const result = await verifyRootUpdateForUnpause(
      manifest,
      createReader({ "0xKITE": "0xabc" }),
      { requireVerifiedStatus: false }
    );

    expect(result.ok).toBe(true);
  });
});
