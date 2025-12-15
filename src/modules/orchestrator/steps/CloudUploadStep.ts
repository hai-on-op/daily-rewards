import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { uploadMerkleTree } from "../../upload-merkle-tree";
import { config } from "../../../config";

/**
 * Step: Upload merkle trees to Cloudflare KV
 */
export class CloudUploadStep implements ProcessingStep {
  readonly name = "CloudUpload";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.uploadToCloudflare;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Uploading merkle trees to Cloudflare...`);

    if (!context.merkleTrees || Object.keys(context.merkleTrees).length === 0) {
      console.log(`[${this.name}] No merkle trees to upload`);
      return context;
    }

    const cfg = config();
    const uploadPromises = Object.entries(context.merkleTrees).map(
      async ([token, tree]) => {
        try {
          await uploadMerkleTree({
            config: {
              accountId: cfg.CLOUDFLARE_ACCOUNT_ID,
              namespaceId: cfg.CLOUDFLARE_NAMESPACE_ID,
              apiToken: cfg.CLOUDFLARE_API_TOKEN,
            },
            treeId: token,
            merkleTree: JSON.stringify(tree.dump()),
          });
          console.log(`[${this.name}] Merkle tree for ${token} uploaded successfully`);
        } catch (err) {
          console.error(`[${this.name}] Error uploading merkle tree for ${token}:`, err);
          context.errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    await Promise.all(uploadPromises);
    console.log(`[${this.name}] All uploads completed`);

    return context;
  }
}

