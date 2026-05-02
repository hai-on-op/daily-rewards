import fs from "fs/promises";
import { ethers } from "ethers";
import { config } from "../../config";
import { subgraphQueryPaginated } from "../subgraph/utils";

export interface RewardAmount {
  address: string;
  earned: string;
}

export interface ClaimAdjustment {
  token: string;
  user: string;
  amount: string;
  sourceClaimTx?: string;
  returnTx: string;
  reason?: string;
}

export interface ClaimAccountingOptions {
  distributorSubgraphUrl?: string;
  claimAdjustmentsFile?: string;
  tokenAddressMap?: Record<string, string>;
  queryPaginated?: (
    query: string,
    paginatedField: string,
    url: string
  ) => Promise<any[]>;
}

interface TokenClaimRow {
  user: { id: string };
  totalAmount: string;
}

export const DEFAULT_DUST_THRESHOLD = ethers.BigNumber.from(10).pow(16);

function getDistributorSubgraphUrl(options: ClaimAccountingOptions): string {
  const url = options.distributorSubgraphUrl ?? config().DISTRIBUTOR_SUBGRAPH_URL;
  if (!url) {
    throw new Error("DISTRIBUTOR_SUBGRAPH_URL is required for claim accounting");
  }
  return url;
}

function normalizeUsers(users: string[]): string[] {
  return Array.from(
    new Set(users.filter(Boolean).map((user) => user.toLowerCase()))
  );
}

function assertValidTxHash(txHash: string, field: string, index: number): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(`Claim adjustment ${index} has invalid ${field}`);
  }
}

function parseClaimAdjustment(raw: any, index: number): ClaimAdjustment {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Claim adjustment ${index} must be an object`);
  }

  if (typeof raw.token !== "string" || raw.token.trim() === "") {
    throw new Error(`Claim adjustment ${index} is missing token`);
  }

  if (typeof raw.user !== "string" || !ethers.utils.isAddress(raw.user)) {
    throw new Error(`Claim adjustment ${index} has invalid user address`);
  }

  if (typeof raw.returnTx !== "string" || raw.returnTx.trim() === "") {
    throw new Error(
      `Claim adjustment ${index} is missing returnTx; only returned overpayments can be credited`
    );
  }
  assertValidTxHash(raw.returnTx, "returnTx", index);

  if (raw.sourceClaimTx !== undefined) {
    if (typeof raw.sourceClaimTx !== "string") {
      throw new Error(`Claim adjustment ${index} has invalid sourceClaimTx`);
    }
    assertValidTxHash(raw.sourceClaimTx, "sourceClaimTx", index);
  }

  let amount: ethers.BigNumber;
  try {
    amount = ethers.BigNumber.from(raw.amount);
  } catch {
    throw new Error(`Claim adjustment ${index} has invalid amount`);
  }

  if (amount.lte(0)) {
    throw new Error(`Claim adjustment ${index} amount must be greater than zero`);
  }

  return {
    token: raw.token.trim(),
    user: raw.user.toLowerCase(),
    amount: amount.toString(),
    sourceClaimTx: raw.sourceClaimTx,
    returnTx: raw.returnTx,
    reason: raw.reason,
  };
}

export async function loadClaimAdjustments(
  filePath?: string
): Promise<ClaimAdjustment[]> {
  if (!filePath) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error: any) {
    throw new Error(`Failed to read claim adjustments file ${filePath}: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Claim adjustments file ${filePath} must contain a JSON array`);
  }

  return parsed.map(parseClaimAdjustment);
}

function resolveAdjustmentTokenAddress(
  token: string,
  tokenAddressMap?: Record<string, string>
): string | undefined {
  if (ethers.utils.isAddress(token)) {
    return token.toLowerCase();
  }

  const mapped = tokenAddressMap?.[token.toUpperCase()];
  if (mapped && ethers.utils.isAddress(mapped)) {
    return mapped.toLowerCase();
  }

  return undefined;
}

async function getAdjustmentTotals(
  tokenAddress: string,
  users: string[],
  options: ClaimAccountingOptions
): Promise<Map<string, ethers.BigNumber>> {
  const adjustments = await loadClaimAdjustments(options.claimAdjustmentsFile);
  const totals = new Map<string, ethers.BigNumber>();
  if (adjustments.length === 0) return totals;

  const tokenLower = tokenAddress.toLowerCase();
  const userSet = new Set(users);

  for (let i = 0; i < adjustments.length; i++) {
    const adjustment = adjustments[i];
    const adjustmentTokenAddress = resolveAdjustmentTokenAddress(
      adjustment.token,
      options.tokenAddressMap
    );

    if (!adjustmentTokenAddress) {
      throw new Error(`Claim adjustment ${i} has unknown token ${adjustment.token}`);
    }

    if (adjustmentTokenAddress !== tokenLower || !userSet.has(adjustment.user)) {
      continue;
    }

    const existing = totals.get(adjustment.user) ?? ethers.BigNumber.from(0);
    totals.set(adjustment.user, existing.add(adjustment.amount));
  }

  return totals;
}

export async function getEffectiveClaimedAmounts(
  tokenAddress: string,
  users: string[],
  options: ClaimAccountingOptions = {}
): Promise<Map<string, string>> {
  const normalizedUsers = normalizeUsers(users);
  if (normalizedUsers.length === 0) return new Map();

  const query = `
    {
      tokenClaims(first: 1000, skip: [[skip]], where: {
        token: "${tokenAddress.toLowerCase()}"
        user_in: ${JSON.stringify(normalizedUsers)}
      }) {
        user { id }
        totalAmount
      }
    }
  `;

  const queryPaginated = options.queryPaginated ?? subgraphQueryPaginated;
  let tokenClaims: TokenClaimRow[];
  try {
    tokenClaims = (await queryPaginated(
      query,
      "tokenClaims",
      getDistributorSubgraphUrl(options)
    )) as TokenClaimRow[];
  } catch (error: any) {
    throw new Error(
      `Failed to fetch claimed amounts for token ${tokenAddress}: ${error.message ?? error}`
    );
  }

  const claimedAmounts = new Map(
    tokenClaims.map((claim) => [
      claim.user.id.toLowerCase(),
      ethers.BigNumber.from(claim.totalAmount).toString(),
    ])
  );

  const adjustmentTotals = await getAdjustmentTotals(
    tokenAddress,
    normalizedUsers,
    options
  );

  for (const [user, adjustmentAmount] of adjustmentTotals) {
    const onchainClaimed = ethers.BigNumber.from(claimedAmounts.get(user) ?? "0");
    if (adjustmentAmount.gt(onchainClaimed)) {
      throw new Error(
        `Claim adjustment exceeds on-chain claimed total for ${user} on ${tokenAddress}: adjustment=${adjustmentAmount.toString()} claimed=${onchainClaimed.toString()}`
      );
    }
    claimedAmounts.set(user, onchainClaimed.sub(adjustmentAmount).toString());
  }

  return claimedAmounts;
}

export function subtractClaimedRewards(
  rewards: RewardAmount[],
  claimedAmounts: Map<string, string>,
  dustThreshold: ethers.BigNumber = DEFAULT_DUST_THRESHOLD
): RewardAmount[] {
  return rewards
    .map((reward) => {
      const address = reward.address.toLowerCase();
      const earned = ethers.BigNumber.from(reward.earned);
      const claimed = ethers.BigNumber.from(claimedAmounts.get(address) ?? "0");

      if (claimed.gt(earned)) {
        const overClaimed = claimed.sub(earned);
        if (overClaimed.gt(dustThreshold)) {
          console.warn(
            `[claim-accounting] Claimed amount exceeds earned amount for ${address}; treating remaining reward as 0: earned=${earned.toString()} claimed=${claimed.toString()} overclaimed=${overClaimed.toString()}`
          );
        }

        return {
          address: reward.address,
          earned: "0",
        };
      }

      const remaining = earned.sub(claimed);
      const isDusty = remaining.lte(dustThreshold);
      return {
        address: reward.address,
        earned: isDusty ? "0" : remaining.toString(),
      };
    })
    .filter((reward) => reward.earned !== "0");
}
