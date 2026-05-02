import fs from "fs";
import os from "os";
import path from "path";
import {
  createRootUpdateManifest,
  getLatestRootUpdatePath,
  readLatestRootUpdateManifest,
  saveRootUpdateManifest,
  saveUnpauseManifest,
  sha256File,
  updateManifestStatus,
  upsertManifestToken,
  readLatestUnpauseManifest,
} from "./manifestStore";

describe("ops-state manifestStore", () => {
  let tempDir: string;
  const previousOpsStateDir = process.env.OPS_STATE_DIR;
  const previousClaimAdjustmentsFile = process.env.CLAIM_ADJUSTMENTS_FILE;
  const previousFeatureMode = process.env.FEATURE_MODE;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-rewards-ops-"));
    process.env.OPS_STATE_DIR = path.join(tempDir, "ops-state");
    process.env.FEATURE_MODE = "production";
    const adjustmentFile = path.join(tempDir, "adjustments.json");
    fs.writeFileSync(adjustmentFile, JSON.stringify([{ amount: "1" }]));
    process.env.CLAIM_ADJUSTMENTS_FILE = adjustmentFile;
  });

  afterEach(() => {
    if (previousOpsStateDir === undefined) delete process.env.OPS_STATE_DIR;
    else process.env.OPS_STATE_DIR = previousOpsStateDir;
    if (previousClaimAdjustmentsFile === undefined) delete process.env.CLAIM_ADJUSTMENTS_FILE;
    else process.env.CLAIM_ADJUSTMENTS_FILE = previousClaimAdjustmentsFile;
    if (previousFeatureMode === undefined) delete process.env.FEATURE_MODE;
    else process.env.FEATURE_MODE = previousFeatureMode;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates, saves, and reads the latest root update manifest", () => {
    const manifest = createRootUpdateManifest();
    upsertManifestToken(manifest, "KITE", {
      tokenAddress: "0xKITE",
      root: "0xroot",
    });
    updateManifestStatus(manifest, "verified");

    const latest = readLatestRootUpdateManifest();

    expect(fs.existsSync(getLatestRootUpdatePath())).toBe(true);
    expect(latest?.runId).toBe(manifest.runId);
    expect(latest?.status).toBe("verified");
    expect(latest?.tokens.KITE.root).toBe("0xroot");
    expect(latest?.adjustmentFileHash).toBe(sha256File(process.env.CLAIM_ADJUSTMENTS_FILE));
  });

  it("saves the latest unpause manifest", () => {
    saveUnpauseManifest({
      version: 1,
      rootUpdateRunId: "run-1",
      txHash: "0xtx",
      blockNumber: 123,
      completedAt: "2026-05-02T00:00:00.000Z",
      epochCounter: "315",
      paused: false,
    });

    expect(readLatestUnpauseManifest()).toMatchObject({
      rootUpdateRunId: "run-1",
      txHash: "0xtx",
      paused: false,
    });
  });

  it("persists direct manifest changes", () => {
    const manifest = createRootUpdateManifest();
    manifest.entryCounterBefore = 314;
    manifest.entryCounterAfter = 315;
    saveRootUpdateManifest(manifest);

    expect(readLatestRootUpdateManifest()).toMatchObject({
      entryCounterBefore: 314,
      entryCounterAfter: 315,
    });
  });
});
