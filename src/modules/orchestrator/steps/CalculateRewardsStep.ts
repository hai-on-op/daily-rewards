import { ethers } from "ethers";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { combineResultsForDistribution } from "../../result-combiner";
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

    // Aero amounts enter as exact base-unit strings; existing strategies retain their behavior.
    const calculation = await combineResultsForDistribution();
    const adjustedResults = calculation.cumulative;
    context.aeroLedger = calculation.aeroLedger;

    context.adjustedRewards = adjustedResults;

    // Subtract claimed amounts
    const finalResults: typeof adjustedResults = {};
    const tokenAddressMap = getTokenAddressMap();
    const cfg = config();

    for (const [symbol, binding] of Object.entries(calculation.tokenBindings || {})) {
      const configured = tokenAddressMap[symbol as keyof typeof tokenAddressMap];
      const chainId = (await context.provider.getNetwork()).chainId;
      if (!configured || configured.toLowerCase() !== binding.address.toLowerCase() || binding.chainId !== chainId ||
          calculation.collectorBindings?.[String(chainId)]?.toLowerCase() !== context.rewardDistributor.address.toLowerCase()) {
        throw new Error(`Aero payout token ${symbol} does not match this distributor chain/address/funding recipient`);
      }
    }

    for (const [token, rewards] of Object.entries(adjustedResults)) {
      console.log(`[${this.name}] Processing claims for token: ${token}`);

      const tokenAddress = tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap];
      if (!tokenAddress) {
        if (calculation.aeroLedger) throw new Error(`[${this.name}] No address found for token: ${token}`);
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
      finalResults[token] = subtractClaimedRewards(rewards, claimedAmounts, calculation.tokenBindings?.[token] ? ethers.BigNumber.from(0) : undefined);

      console.log(`[${this.name}] Found ${claimedAmounts.size} effective previous claims for ${token}`);
    }

    context.finalRewards = finalResults;
    console.log(`[${this.name}] Final rewards calculated`);

    return context;
  }
}
