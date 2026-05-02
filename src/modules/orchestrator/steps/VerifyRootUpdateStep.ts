import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import {
  RewardDistributorReader,
  updateManifestStatus,
  verifyRootUpdateForUnpause,
} from "../../../services/ops-state";

/**
 * Step: Verify on-chain roots, backups, and Cloudflare upload metadata.
 */
export class VerifyRootUpdateStep implements ProcessingStep {
  readonly name = "VerifyRootUpdate";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.updateOnChain;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Verifying root update manifest...`);

    if (!context.runManifest) {
      console.log(`[${this.name}] No run manifest present, skipping verification`);
      return context;
    }

    const result = await verifyRootUpdateForUnpause(
      context.runManifest,
      context.rewardDistributor as unknown as RewardDistributorReader,
      { requireCloudflare: true, requireVerifiedStatus: false }
    );

    if (result.ok) {
      console.log(`[${this.name}] Root update verified`);
      updateManifestStatus(context.runManifest, "verified");
      return context;
    }

    const criticalErrors = result.errors.filter(
      (error) => !error.startsWith("cloudflare:")
    );

    if (criticalErrors.length > 0) {
      updateManifestStatus(context.runManifest, "failed");
      const error = new Error(
        `[${this.name}] Critical verification failed: ${criticalErrors.join("; ")}`
      );
      context.errors.push(error);
      throw error;
    }

    updateManifestStatus(context.runManifest, "needs_upload_repair");
    const warning = new Error(
      `[${this.name}] Cloudflare upload repair needed: ${result.errors.join("; ")}`
    );
    context.errors.push(warning);
    console.warn(warning.message);

    return context;
  }
}
