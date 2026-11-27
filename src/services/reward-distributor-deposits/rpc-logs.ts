import { providers, utils } from "ethers";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";
import { randomUUID } from "crypto";

const blockRange = 10_000;
const parallelRanges = 4;
const cacheDir = path.join(homedir(), ".cache", "hai-daily-rewards", "transfer-logs");
type Checkpoint = { number: number; hash: string; logs: providers.Log[] };

async function readCheckpoint(file: string): Promise<Checkpoint | undefined> {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    if (Number.isSafeInteger(data.number) && data.number >= 0 &&
        utils.isHexString(data.hash, 32) && Array.isArray(data.logs)) return data;
    throw new Error("Invalid reward deposit checkpoint");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function writeCheckpoint(file: string, data: Checkpoint): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + randomUUID();
  try {
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

async function readRanges(provider: providers.JsonRpcProvider, filter: providers.Filter,
    from: number, to: number): Promise<providers.Log[]> {
  const logs: providers.Log[] = [];
  for (let first = from; first <= to; first += blockRange * parallelRanges) {
    const requests: Promise<providers.Log[]>[] = [];
    for (let start = first; start <= to && requests.length < parallelRanges; start += blockRange) {
      requests.push(provider.getLogs({ ...filter, fromBlock: start, toBlock: Math.min(start + blockRange - 1, to) }));
    }
    for (const page of await Promise.all(requests)) logs.push(...page);
  }
  return logs;
}

/** Cache only finalized deposits. Re-read all newer blocks for every rewards calculation. */
export async function getRewardTransferLogs(provider: providers.JsonRpcProvider, token: string,
    sender: string, recipient: string, dir = cacheDir): Promise<providers.Log[]> {
  const { chainId } = await provider.getNetwork();
  if (chainId !== 10) throw new Error("Reward deposit RPC must serve Optimism mainnet");
  const addresses = [token, sender, recipient].map(address => utils.getAddress(address).toLowerCase());
  const [address, from, to] = addresses;
  const file = path.join(dir, [chainId, ...addresses].join("-") + ".json");
  const filter = { address, topics: [utils.id("Transfer(address,address,uint256)"),
    utils.hexZeroPad(from, 32), utils.hexZeroPad(to, 32)] };
  const finalized = await provider.getBlock("finalized");
  const head = await provider.getBlock("latest");
  if (!finalized || !head || finalized.number > head.number) throw new Error("Invalid Optimism finality");
  const saved = await readCheckpoint(file);
  let logs: providers.Log[] = [];
  let start = 0;
  if (saved && (await provider.getBlock(saved.number))?.hash === saved.hash) {
    if (saved.number > finalized.number) {
      // Nodes can report an older finalized tag while agreeing on the chain.
      logs = saved.logs.filter(log => log.blockNumber <= finalized.number);
      start = finalized.number + 1;
    } else {
      logs = saved.logs;
      start = saved.number + 1;
    }
  }
  if (start <= finalized.number) {
    logs = logs.concat(await readRanges(provider, filter, start, finalized.number));
    if ((await provider.getBlock(finalized.number))?.hash !== finalized.hash) {
      throw new Error("Optimism finalized block changed during reward deposit scan");
    }
    await writeCheckpoint(file, { number: finalized.number, hash: finalized.hash, logs });
  }
  const tail = await readRanges(provider, filter, finalized.number + 1, head.number);
  if ((await provider.getBlock(head.number))?.hash !== head.hash) {
    throw new Error("Optimism head changed during reward deposit scan");
  }
  return logs.concat(tail);
}
