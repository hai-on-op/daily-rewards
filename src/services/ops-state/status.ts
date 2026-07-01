import { execFile } from "child_process";
import { ethers } from "ethers";
import { config as loadConfig } from "../../config";
import { REWARD_DISTRIBUTOR_ABI } from "../../abis/REWARD_DISTRIBUTOR_ABI";
import {
  readLatestRootUpdateManifest,
  readLatestUnpauseManifest,
} from "./manifestStore";

interface TimerStatus {
  active: boolean;
  enabled: boolean;
  lastTriggerAt: string | null;
  nextRunAt: string | null;
  raw?: Record<string, string>;
  error?: string;
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseSystemctlShow(output: string): Record<string, string> {
  const ret: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    ret[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return ret;
}

function parseSystemdTime(value: string | undefined): string | null {
  if (!value || value === "n/a" || value === "0") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

async function getTimerStatus(unit: string): Promise<TimerStatus> {
  try {
    const output = await execFileAsync("systemctl", [
      "show",
      unit,
      "--property=ActiveState",
      "--property=UnitFileState",
      "--property=LastTriggerUSec",
      "--property=NextElapseUSecRealtime",
    ]);
    const raw = parseSystemctlShow(output);
    return {
      active: raw.ActiveState === "active",
      enabled: raw.UnitFileState === "enabled",
      lastTriggerAt: parseSystemdTime(raw.LastTriggerUSec),
      nextRunAt: parseSystemdTime(raw.NextElapseUSecRealtime),
      raw,
    };
  } catch (error) {
    return {
      active: false,
      enabled: false,
      lastTriggerAt: null,
      nextRunAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getContractStatus(): Promise<any> {
  const cfg = loadConfig();
  const provider = new ethers.providers.JsonRpcProvider(cfg.DISTRIBUTOR_RPC_URL);
  const contract = new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    provider
  );

  const [paused, epochCounter, epochDuration, bufferDuration, rootSetter, opRoot, haiRoot, kiteRoot] =
    await Promise.all([
      contract.paused(),
      contract.epochCounter(),
      contract.epochDuration(),
      contract.bufferDuration(),
      contract.rootSetter(),
      contract.merkleRoots(cfg.OP_ADDRESS),
      contract.merkleRoots(cfg.HAI_ADDRESS),
      contract.merkleRoots(cfg.KITE_ADDRESS),
    ]);

  return {
    address: cfg.REWARD_DISTRIBUTOR_ADDRESS,
    paused,
    epochCounter: String(epochCounter),
    epochDuration: String(epochDuration),
    bufferDuration: String(bufferDuration),
    rootSetter,
    roots: {
      OP: opRoot,
      HAI: haiRoot,
      KITE: kiteRoot,
    },
  };
}

export async function buildOpsStatus(): Promise<any> {
  const errors: string[] = [];
  const [entryTask, unpauseTask] = await Promise.all([
    getTimerStatus("entry-task.timer"),
    getTimerStatus("unpause-task.timer"),
  ]);

  if (entryTask.error) errors.push(`entry-task.timer: ${entryTask.error}`);
  if (unpauseTask.error) errors.push(`unpause-task.timer: ${unpauseTask.error}`);

  let contract: any = null;
  try {
    contract = await getContractStatus();
  } catch (error) {
    errors.push(`contract: ${error instanceof Error ? error.message : String(error)}`);
  }

  const lastRootUpdate = readLatestRootUpdateManifest();
  const lastUnpause = readLatestUnpauseManifest();
  const rootUpdateTokenEntries = Object.entries(lastRootUpdate?.tokens || {});
  if (
    lastRootUpdate?.status === "failed" ||
    lastRootUpdate?.status === "needs_upload_repair"
  ) {
    errors.push(`lastRootUpdate: ${lastRootUpdate.status}`);
  }

  const rootsMatch =
    !!lastRootUpdate &&
    !!contract &&
    rootUpdateTokenEntries.length > 0 &&
    rootUpdateTokenEntries.every(([token, tokenData]) => {
      const contractRoot = contract.roots?.[token];
      return (
        typeof contractRoot === "string" &&
        typeof tokenData.root === "string" &&
        contractRoot.toLowerCase() === tokenData.root.toLowerCase()
      );
    });
  const safeToUnpause =
    !!lastRootUpdate &&
    !!contract &&
    contract.paused === true &&
    String(contract.epochCounter) === String(lastRootUpdate.entryCounterAfter) &&
    rootsMatch &&
    lastRootUpdate.status === "verified" &&
    rootUpdateTokenEntries.length > 0 &&
    rootUpdateTokenEntries.every(
      ([, token]) => token.backupVerified === true && token.cloudflareUploaded === true
    );

  return {
    status: errors.length > 0 ? "degraded" : "ok",
    generatedAt: new Date().toISOString(),
    scheduler: {
      entryTask,
      unpauseTask,
    },
    contract,
    lastRootUpdate: lastRootUpdate
      ? {
          ...lastRootUpdate,
          safeToUnpause,
        }
      : null,
    lastUnpause: lastUnpause || null,
    errors,
  };
}
