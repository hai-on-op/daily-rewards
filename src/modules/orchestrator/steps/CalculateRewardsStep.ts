import { ethers } from "ethers";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { combineResults } from "../../result-combiner";
import { config } from "../../../config";
import { getTokenAddressMap } from "../contractHelpers";
import {
  getEffectiveClaimedAmounts,
  subtractClaimedRewards,
} from "../../../services/claim-accounting";

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
    const cfg = config();

    for (const [token, rewards] of Object.entries(adjustedResults)) {
      console.log(`[${this.name}] Processing claims for token: ${token}`);

      const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap];
      if (!tokenAddress) {
        console.warn(`[${this.name}] No address found for token: ${token}`);
        continue;
      }

      const claimedAmounts = await getEffectiveClaimedAmounts(
        tokenAddress,
        rewards.map((r) => r.address),
        {
          distributorSubgraphUrl: cfg.DISTRIBUTOR_SUBGRAPH_URL,
          claimAdjustmentsFile: cfg.CLAIM_ADJUSTMENTS_FILE,
          tokenAddressMap,
        }
      );

      // Subtract claimed amounts from earned amounts
      finalResults[token] = subtractClaimedRewards(rewards, claimedAmounts);

      console.log(`[${this.name}] Found ${claimedAmounts.size} effective previous claims for ${token}`);
    }

    context.finalRewards = finalResults;
    console.log(`[${this.name}] Final rewards calculated`);

    return context;
  }
}
