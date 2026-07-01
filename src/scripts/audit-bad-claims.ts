/**
 * Matches suspicious merkle backup leaves to actual RewardsClaimed events.
 *
 * Usage:
 *   yarn audit:bad-claims
 *   BAD_CLAIMS_OUTPUT_FILE=/tmp/bad-claims.json yarn audit:bad-claims
 */

import { config as dotenv } from "dotenv";
dotenv();

import fs from "fs";
import { ethers } from "ethers";
import { subgraphQueryPaginated } from "../services/subgraph/utils";
import {
  auditSnapshots,
  defaultBackupsDir,
  loadSnapshots,
  SuspectedOverpayment,
} from "./audit-claim-overpayments";

const DEFAULT_DISTRIBUTOR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh0kaidl00khw2p29dmebtp5/subgraphs/hai-mainnet-v2/v1.0.10/gn";

const DEFAULT_TOKEN_ADDRESSES: Record<string, string> = {
  KITE: "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404",
  OP: "0x4200000000000000000000000000000000000042",
  DINERO: "0x09d9420332bff75522a45fcff4855f82a0a3ff50",
  HAI: "0x10398AbC267496E49106B07dd6BE13364D10dC71",
};

interface ClaimRow {
  user: { id: string };
  amount: string;
  claimedAtBlock: string;
  claimedAt: string;
  claimedAtTransaction: string;
}

interface BadClaim {
  token: string;
  tokenAddress: string;
  user: string;
  claimTx: string;
  claimedAtBlock: string;
  claimedAt: string;
  claimedAmount: string;
  rootExpectedAmount: string;
  rootEstimatedOverpayment: string;
  expectedAmount: string;
  estimatedOverpayment: string;
  inferredPriorClaimed: string;
  merkleEntry: number;
  merkleDate: string;
  merkleRoot: string;
  merkleGrossAmount: string;
  merkleBackupFile: string;
}

function tokenAddressFor(token: string): string | undefined {
  const envValue = process.env[`${token.toUpperCase()}_ADDRESS`];
  const value = envValue || DEFAULT_TOKEN_ADDRESSES[token.toUpperCase()];
  return value && ethers.utils.isAddress(value) ? value.toLowerCase() : undefined;
}

function formatUnits(amount: string): string {
  return ethers.utils.formatUnits(amount, 18);
}

function earliestEntry(suspects: SuspectedOverpayment[]): number {
  return Math.min(...suspects.map((suspect) => suspect.entry));
}

function latestEntry(suspects: SuspectedOverpayment[]): number {
  return Math.max(...suspects.map((suspect) => suspect.entry));
}

function chooseSuspect(
  claim: ClaimRow,
  suspects: SuspectedOverpayment[]
): SuspectedOverpayment {
  const claimTimestamp = Number(claim.claimedAt);
  const beforeClaim = suspects.filter((suspect) => {
    const suspectTimestamp = Date.parse(suspect.date) / 1000;
    return Number.isFinite(suspectTimestamp) && suspectTimestamp <= claimTimestamp;
  });

  const candidates = beforeClaim.length > 0 ? beforeClaim : suspects;
  return candidates.sort((a, b) => {
    const aTime = Date.parse(a.date);
    const bTime = Date.parse(b.date);
    if (aTime !== bTime) return bTime - aTime;
    return b.entry - a.entry;
  })[0];
}

async function fetchClaimsForToken(
  tokenAddress: string,
  users: string[],
  distributorSubgraphUrl: string
): Promise<ClaimRow[]> {
  const userList = `[${users.map((user) => `"${user}"`).join(",")}]`;
  const query = `
    {
      claims(first: 1000, skip: [[skip]], orderBy: claimedAtBlock, orderDirection: desc, where: {
        token: "${tokenAddress.toLowerCase()}"
        user_in: ${userList}
      }) {
        user { id }
        amount
        claimedAtBlock
        claimedAt
        claimedAtTransaction
      }
    }
  `;

  return (await subgraphQueryPaginated(
    query,
    "claims",
    distributorSubgraphUrl
  )) as ClaimRow[];
}

async function findBadClaims(
  suspects: SuspectedOverpayment[],
  distributorSubgraphUrl: string
): Promise<BadClaim[]> {
  const suspectsByToken = new Map<string, SuspectedOverpayment[]>();
  for (const suspect of suspects) {
    const key = suspect.token.toUpperCase();
    const existing = suspectsByToken.get(key) ?? [];
    existing.push(suspect);
    suspectsByToken.set(key, existing);
  }

  const badClaims: BadClaim[] = [];

  for (const [token, tokenSuspects] of suspectsByToken) {
    const tokenAddress = tokenAddressFor(token);
    if (!tokenAddress) {
      throw new Error(`Missing token address for ${token}; set ${token}_ADDRESS`);
    }

    const users = Array.from(new Set(tokenSuspects.map((suspect) => suspect.user)));
    const claims = await fetchClaimsForToken(tokenAddress, users, distributorSubgraphUrl);
    const suspectsByUserAndAmount = new Map<string, SuspectedOverpayment[]>();

    for (const suspect of tokenSuspects) {
      const key = `${suspect.user}:${suspect.leafAmount}`;
      const existing = suspectsByUserAndAmount.get(key) ?? [];
      existing.push(suspect);
      suspectsByUserAndAmount.set(key, existing);
    }

    for (const claim of claims) {
      const user = claim.user.id.toLowerCase();
      const matchingSuspects = suspectsByUserAndAmount.get(`${user}:${claim.amount}`);
      if (!matchingSuspects || matchingSuspects.length === 0) continue;

      const suspect = chooseSuspect(claim, matchingSuspects);
      badClaims.push({
        token,
        tokenAddress,
        user,
        claimTx: claim.claimedAtTransaction,
        claimedAtBlock: claim.claimedAtBlock,
        claimedAt: claim.claimedAt,
        claimedAmount: claim.amount,
        rootExpectedAmount: suspect.expectedLeafAmount,
        rootEstimatedOverpayment: suspect.estimatedOverpayment,
        expectedAmount: suspect.expectedLeafAmount,
        estimatedOverpayment: suspect.estimatedOverpayment,
        inferredPriorClaimed: suspect.inferredPriorClaimed,
        merkleEntry: suspect.entry,
        merkleDate: suspect.date,
        merkleRoot: suspect.root,
        merkleGrossAmount: suspect.grossAmount,
        merkleBackupFile: suspect.file,
      });
    }
  }

  return badClaims.sort((a, b) => Number(a.claimedAtBlock) - Number(b.claimedAtBlock));
}

function applySequentialAccounting(badClaims: BadClaim[]): BadClaim[] {
  const grouped = new Map<string, BadClaim[]>();
  for (const claim of badClaims) {
    const key = `${claim.token}:${claim.user}`;
    const existing = grouped.get(key) ?? [];
    existing.push(claim);
    grouped.set(key, existing);
  }

  const adjusted: BadClaim[] = [];

  for (const [, claims] of grouped) {
    const orderedClaims = claims.sort(
      (a, b) => Number(a.claimedAtBlock) - Number(b.claimedAtBlock)
    );
    let correctedClaimed = ethers.BigNumber.from(orderedClaims[0].inferredPriorClaimed);

    for (const claim of orderedClaims) {
      const claimedAmount = ethers.BigNumber.from(claim.claimedAmount);
      const cumulativeGross = ethers.BigNumber.from(claim.merkleGrossAmount);
      const expectedAmount = cumulativeGross.gt(correctedClaimed)
        ? cumulativeGross.sub(correctedClaimed)
        : ethers.BigNumber.from(0);

      if (expectedAmount.gt(claimedAmount)) {
        throw new Error(
          `Sequential expected amount exceeds claimed amount for ${claim.claimTx}`
        );
      }

      adjusted.push({
        ...claim,
        expectedAmount: expectedAmount.toString(),
        estimatedOverpayment: claimedAmount.sub(expectedAmount).toString(),
      });

      correctedClaimed = correctedClaimed.add(expectedAmount);
    }
  }

  return adjusted.sort((a, b) => Number(a.claimedAtBlock) - Number(b.claimedAtBlock));
}

function buildSummary(badClaims: BadClaim[]) {
  const byRecipient: Record<string, Record<string, string>> = {};
  const totalsByToken: Record<string, string> = {};

  for (const claim of badClaims) {
    byRecipient[claim.user] ||= {};
    const existingUserToken = ethers.BigNumber.from(
      byRecipient[claim.user][claim.token] ?? "0"
    );
    byRecipient[claim.user][claim.token] = existingUserToken
      .add(claim.estimatedOverpayment)
      .toString();

    const existingToken = ethers.BigNumber.from(totalsByToken[claim.token] ?? "0");
    totalsByToken[claim.token] = existingToken
      .add(claim.estimatedOverpayment)
      .toString();
  }

  return {
    badClaimCount: badClaims.length,
    byRecipient,
    byRecipientFormatted: Object.fromEntries(
      Object.entries(byRecipient).map(([user, tokenAmounts]) => [
        user,
        Object.fromEntries(
          Object.entries(tokenAmounts).map(([token, amount]) => [
            token,
            formatUnits(amount),
          ])
        ),
      ])
    ),
    totalsByToken,
    totalsByTokenFormatted: Object.fromEntries(
      Object.entries(totalsByToken).map(([token, amount]) => [
        token,
        formatUnits(amount),
      ])
    ),
  };
}

async function main(): Promise<void> {
  const backupsDir = process.env.MERKLE_BACKUPS_DIR || process.argv[2] || defaultBackupsDir();
  const distributorSubgraphUrl =
    process.env.DISTRIBUTOR_SUBGRAPH_URL || DEFAULT_DISTRIBUTOR_SUBGRAPH_URL;
  const snapshots = loadSnapshots(backupsDir);
  const suspects = auditSnapshots(snapshots);
  const badClaims = applySequentialAccounting(
    await findBadClaims(suspects, distributorSubgraphUrl)
  );
  const uniqueSuspectUsers = new Set(suspects.map((suspect) => suspect.user));

  const report = {
    generatedAt: new Date().toISOString(),
    backupsDir,
    snapshotCount: snapshots.length,
    suspectRowCount: suspects.length,
    uniqueSuspectUserCount: uniqueSuspectUsers.size,
    suspectEntryRange: suspects.length
      ? { first: earliestEntry(suspects), last: latestEntry(suspects) }
      : null,
    ...buildSummary(badClaims),
    badClaims,
  };

  const output = JSON.stringify(report, null, 2);
  if (process.env.BAD_CLAIMS_OUTPUT_FILE) {
    fs.writeFileSync(process.env.BAD_CLAIMS_OUTPUT_FILE, output);
    console.log(`Wrote bad-claim audit to ${process.env.BAD_CLAIMS_OUTPUT_FILE}`);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
