import fs from "fs";
import { ethers } from "ethers";
import { Config, config as loadConfig } from "../../config";
import { REWARD_DISTRIBUTOR_ABI } from "../../abis/REWARD_DISTRIBUTOR_ABI";
import {
  readLatestRootUpdateManifest,
  resolveManifestFile,
  saveRootUpdateManifest,
} from "./manifestStore";
import {
  RootUpdateManifest,
  UnpauseVerificationResult,
} from "./types";

export interface RewardDistributorReader {
  paused(): Promise<boolean>;
  epochCounter(): Promise<ethers.BigNumberish>;
  merkleRoots(tokenAddress: string): Promise<string>;
}

function getTokenAddressMap(cfg: Config): Record<string, string> {
  return {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
    DINERO: cfg.DINERO_ADDRESS,
    HAI: cfg.HAI_ADDRESS,
  };
}

function normalizeHex(value: string | undefined): string {
  return (value || "").toLowerCase();
}

function verifyBackupFile(manifest: RootUpdateManifest, token: string): string | undefined {
  const tokenData = manifest.tokens[token];
  if (!tokenData.backupFile) return `backup: ${token} backup file missing from manifest`;

  const backupPath = resolveManifestFile(tokenData.backupFile);
  if (!fs.existsSync(backupPath)) return `backup: ${token} backup file not found: ${tokenData.backupFile}`;

  try {
    const data = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    if (normalizeHex(data.root) !== normalizeHex(tokenData.root)) {
      return `backup: ${token} backup root ${data.root} does not match manifest root ${tokenData.root}`;
    }
    tokenData.backupVerified = true;
    tokenData.backupError = undefined;
    return undefined;
  } catch (error) {
    return `backup: ${token} backup file is invalid JSON: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

export async function verifyRootUpdateForUnpause(
  manifest: RootUpdateManifest,
  reader: RewardDistributorReader,
  options: { requireCloudflare?: boolean; requireVerifiedStatus?: boolean } = {}
): Promise<UnpauseVerificationResult> {
  const errors: string[] = [];
  const requireCloudflare = options.requireCloudflare ?? true;
  const requireVerifiedStatus = options.requireVerifiedStatus ?? true;
  const paused = await reader.paused();
  const epochCounter = String(await reader.epochCounter());

  if (!paused) errors.push("contract: reward distributor is not paused");
  if (requireVerifiedStatus && manifest.status !== "verified") {
    errors.push(`manifest: latest root update status is ${manifest.status}, expected verified`);
  }
  if (manifest.entryCounterAfter === undefined) {
    errors.push("manifest: entryCounterAfter is missing");
  } else if (epochCounter !== String(manifest.entryCounterAfter)) {
    errors.push(
      `contract: epochCounter ${epochCounter} does not match manifest entryCounterAfter ${manifest.entryCounterAfter}`
    );
  }

  for (const [token, tokenData] of Object.entries(manifest.tokens)) {
    if (!tokenData.tokenAddress) {
      errors.push(`manifest: ${token} token address missing`);
      continue;
    }
    if (!tokenData.root) {
      errors.push(`manifest: ${token} root missing`);
      continue;
    }

    const onChainRoot = await reader.merkleRoots(tokenData.tokenAddress);
    tokenData.onChainRoot = onChainRoot;
    tokenData.onChainVerified = normalizeHex(onChainRoot) === normalizeHex(tokenData.root);
    if (!tokenData.onChainVerified) {
      errors.push(
        `contract: ${token} on-chain root ${onChainRoot} does not match manifest root ${tokenData.root}`
      );
    }

    const backupError = verifyBackupFile(manifest, token);
    if (backupError) {
      tokenData.backupVerified = false;
      tokenData.backupError = backupError;
      errors.push(backupError);
    }

    if (requireCloudflare && tokenData.cloudflareUploaded !== true) {
      errors.push(`cloudflare: ${token} upload was not successful`);
    }
  }

  manifest.verification = {
    checkedAt: new Date().toISOString(),
    ok: errors.length === 0,
    errors,
  };
  saveRootUpdateManifest(manifest);

  return {
    ok: errors.length === 0,
    errors,
    manifest,
    contractState: { paused, epochCounter },
  };
}

export function createRewardDistributorReader(cfg: Config = loadConfig()): RewardDistributorReader {
  const provider = new ethers.providers.JsonRpcProvider(cfg.DISTRIBUTOR_RPC_URL);
  return new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    provider
  ) as unknown as RewardDistributorReader;
}

export async function verifyLatestRootUpdateForUnpause(
  cfg: Config = loadConfig()
): Promise<UnpauseVerificationResult> {
  const manifest = readLatestRootUpdateManifest();
  if (!manifest) {
    return {
      ok: false,
      errors: ["manifest: ops-state/latest-root-update.json not found"],
    };
  }

  const tokenAddressMap = getTokenAddressMap(cfg);
  for (const [token, tokenData] of Object.entries(manifest.tokens)) {
    tokenData.tokenAddress = tokenData.tokenAddress || tokenAddressMap[token];
  }

  return verifyRootUpdateForUnpause(manifest, createRewardDistributorReader(cfg));
}
