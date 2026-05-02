import fs from "fs/promises";
import os from "os";
import path from "path";
import { ethers } from "ethers";
import {
  getEffectiveClaimedAmounts,
  loadClaimAdjustments,
  subtractClaimedRewards,
} from "./claimAccounting";

const KITE = "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404";
const USER_A = "0x0000000000000000000000000000000000000001";
const USER_B = "0xF4527A233F669a55922f707C61054fa78beA7402";
const RETURN_TX = `0x${"1".repeat(64)}`;
const SOURCE_TX = `0x${"2".repeat(64)}`;

async function writeTempAdjustments(entries: unknown[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "claim-adjustments-"));
  const file = path.join(dir, "adjustments.json");
  await fs.writeFile(file, JSON.stringify(entries), "utf8");
  return file;
}

describe("claim accounting", () => {
  it("fetches token claims through the paginated subgraph helper", async () => {
    const users = Array.from({ length: 120 }, (_, index) =>
      `0x${(index + 1).toString(16).padStart(40, "0")}`
    );
    users.push(USER_B);

    const queryPaginated = jest.fn().mockResolvedValue([
      {
        user: { id: USER_B.toLowerCase() },
        totalAmount: "3000000000000000000000",
      },
    ]);

    const result = await getEffectiveClaimedAmounts(KITE, users, {
      distributorSubgraphUrl: "http://subgraph",
      queryPaginated,
    });

    expect(queryPaginated).toHaveBeenCalledWith(
      expect.stringContaining("tokenClaims(first: 1000, skip: [[skip]]"),
      "tokenClaims",
      "http://subgraph"
    );
    expect(queryPaginated.mock.calls[0][0]).toContain(USER_B.toLowerCase());
    expect(result.get(USER_B.toLowerCase())).toBe("3000000000000000000000");
  });

  it("fails closed when the subgraph claim lookup fails", async () => {
    const queryPaginated = jest.fn().mockRejectedValue(new Error("rate limited"));

    await expect(
      getEffectiveClaimedAmounts(KITE, [USER_A], {
        distributorSubgraphUrl: "http://subgraph",
        queryPaginated,
      })
    ).rejects.toThrow("Failed to fetch claimed amounts");
  });

  it("loads and validates returned-overpayment adjustments", async () => {
    const file = await writeTempAdjustments([
      {
        token: "KITE",
        user: USER_A,
        amount: "100",
        sourceClaimTx: SOURCE_TX,
        returnTx: RETURN_TX,
        reason: "returned overpayment",
      },
    ]);

    await expect(loadClaimAdjustments(file)).resolves.toEqual([
      {
        token: "KITE",
        user: USER_A.toLowerCase(),
        amount: "100",
        sourceClaimTx: SOURCE_TX,
        returnTx: RETURN_TX,
        reason: "returned overpayment",
      },
    ]);
  });

  it("subtracts approved returned overpayments from on-chain claimed totals", async () => {
    const file = await writeTempAdjustments([
      {
        token: "KITE",
        user: USER_A,
        amount: "100",
        returnTx: RETURN_TX,
      },
    ]);
    const queryPaginated = jest.fn().mockResolvedValue([
      {
        user: { id: USER_A.toLowerCase() },
        totalAmount: "500",
      },
    ]);

    const result = await getEffectiveClaimedAmounts(KITE, [USER_A], {
      distributorSubgraphUrl: "http://subgraph",
      claimAdjustmentsFile: file,
      tokenAddressMap: { KITE },
      queryPaginated,
    });

    expect(result.get(USER_A.toLowerCase())).toBe("400");
  });

  it("fails closed when an adjustment exceeds the on-chain claimed total", async () => {
    const file = await writeTempAdjustments([
      {
        token: "KITE",
        user: USER_A,
        amount: "600",
        returnTx: RETURN_TX,
      },
    ]);
    const queryPaginated = jest.fn().mockResolvedValue([
      {
        user: { id: USER_A.toLowerCase() },
        totalAmount: "500",
      },
    ]);

    await expect(
      getEffectiveClaimedAmounts(KITE, [USER_A], {
        distributorSubgraphUrl: "http://subgraph",
        claimAdjustmentsFile: file,
        tokenAddressMap: { KITE },
        queryPaginated,
      })
    ).rejects.toThrow("Claim adjustment exceeds on-chain claimed total");
  });

  it("requires returnTx before crediting an adjustment", async () => {
    const file = await writeTempAdjustments([
      {
        token: "KITE",
        user: USER_A,
        amount: "100",
      },
    ]);

    await expect(loadClaimAdjustments(file)).rejects.toThrow("missing returnTx");
  });

  it("zeros rewards when claimed amount exceeds earned amount by dust", () => {
    expect(
      subtractClaimedRewards(
        [{ address: USER_A, earned: "100" }],
        new Map([[USER_A.toLowerCase(), "105"]]),
        ethers.BigNumber.from(10)
      )
    ).toEqual([]);
  });

  it("zeros rewards and warns when claimed amount exceeds earned amount above dust", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      subtractClaimedRewards(
        [{ address: USER_A, earned: "100" }],
        new Map([[USER_A.toLowerCase(), "111"]]),
        ethers.BigNumber.from(10)
      )
    ).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Claimed amount exceeds earned amount")
    );

    warnSpy.mockRestore();
  });
});
