import { ethers } from "ethers";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { combineResults } from "../../result-combiner";
import { subgraphQuery } from "../../../services/subgraph/utils";
import { config } from "../../../config";
import { getTokenAddressMap } from "../contractHelpers";

/**
 * Get claimed amounts for users from the subgraph
 */
async function getClaimedAmounts(
  token: string,
  users: string[]
): Promise<Map<string, string>> {
  const query = `
    {
      tokenClaims(where: {
        token: "${token.toLowerCase()}"
        user_in: ${JSON.stringify(users.map((u) => u?.toLowerCase()))}
      }) {
        user {
          id
        }
        totalAmount
      }
    }
  `;

  try {
    const response = await subgraphQuery(
      query,
      config().DISTRIBUTOR_SUBGRAPH_URL
    );

    return new Map(
      response.tokenClaims.map((claim: any) => [
        claim.user.id.toLowerCase(),
        claim.totalAmount,
      ])
    );
  } catch (error) {
    console.error(`Error fetching claimed amounts for token ${token}:`, error);
    return new Map();
  }
}

/**
 * Step: Calculate rewards from all sources
 */
export class CalculateRewardsStep implements ProcessingStep {
  readonly name = "CalculateRewards";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.calculateRewards;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Calculating rewards...`);

    // Skip if no effective counter (initial epoch case)
    if (context.effectiveEntryCounter <= 0) {
      console.log(`[${this.name}] Skipping - no rewards to process`);
      return context;
    }

    // Combine results from all reward sources
    const results = await combineResults();
    context.rewards = results;

    console.log(`[${this.name}] Combined results for tokens:`, Object.keys(results));

    // Convert earned values to BigNumber with 18 decimals
    const adjustedResults = Object.entries(results)
      .map(([token, userRewards]) => {
        return {
          [token]: userRewards.map((reward) => {
            return {
              address: reward.address,
              earned: ethers.utils
                .parseEther(reward.earned.toFixed(18))
                .toString(),
            };
          }),
        };
      })
      .reduce((acc, curr) => ({ ...acc, ...curr }), {});

    context.adjustedRewards = adjustedResults;

    // Subtract claimed amounts
    const finalResults: typeof adjustedResults = {};
    const tokenAddressMap = getTokenAddressMap();

    for (const [token, rewards] of Object.entries(adjustedResults)) {
      console.log(`[${this.name}] Processing claims for token: ${token}`);

      const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap];
      if (!tokenAddress) {
        console.warn(`[${this.name}] No address found for token: ${token}`);
        continue;
      }

      const claimedAmounts = await getClaimedAmounts(
        tokenAddress,
        rewards.map((r) => r.address)
      );

      // Subtract claimed amounts from earned amounts
      finalResults[token] = rewards
        .map((reward) => {
          const claimed = claimedAmounts.get(reward.address.toLowerCase()) || "0";
          const remaining = ethers.BigNumber.from(reward.earned).sub(
            ethers.BigNumber.from(claimed)
          );
          const isDusty = remaining.lte(
            ethers.BigNumber.from(ethers.BigNumber.from(10).pow(16))
          );
          return {
            address: reward.address,
            earned: isDusty ? "0" : remaining.toString(),
          };
        })
        .filter((reward) => reward.earned !== "0");

      console.log(`[${this.name}] Found ${claimedAmounts.size} previous claims for ${token}`);
    }

    context.finalRewards = finalResults;
    console.log(`[${this.name}] Final rewards calculated`);

    return context;
  }
}

