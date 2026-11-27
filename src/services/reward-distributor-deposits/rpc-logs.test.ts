import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { providers } from "ethers";
import { getRewardTransferLogs } from "./rpc-logs";

const token = "0x" + "11".repeat(20);
const sender = "0x" + "22".repeat(20);
const recipient = "0x" + "33".repeat(20);
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");

it("persists only finalized ranges and rereads a reorganized tail", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reward-deposit-test-"));
  let head = 20_014;
  let finalized = 20_010;
  let tail = "old tail";
  const getLogs = jest.fn(async ({ fromBlock, toBlock }) => {
    return fromBlock > finalized ? [tail] : [String(toBlock)];
  });
  const provider = {
    getNetwork: async () => ({ chainId: 10 }),
    getBlock: async (tag: number | string) => {
      const number = typeof tag === "number" ? tag : tag === "latest" ? head : finalized;
      return { number, hash: hash(number) };
    },
    getLogs,
  } as unknown as providers.JsonRpcProvider;
  try {
    const read = () => getRewardTransferLogs(provider, token, sender, recipient, dir);
    expect(await read()).toEqual(["9999", "19999", "20010", "old tail"]);
    expect(getLogs.mock.calls.map(([f]) => [f.fromBlock, f.toBlock]))
      .toEqual([[0, 9999], [10000, 19999], [20000, 20010], [20011, 20014]]);
    head++;
    finalized++;
    tail = "new tail";
    getLogs.mockClear();
    expect(await read()).toEqual(["9999", "19999", "20010", "20011", "new tail"]);
    expect(getLogs.mock.calls.map(([f]) => [f.fromBlock, f.toBlock]))
      .toEqual([[20011, 20011], [20012, 20015]]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
