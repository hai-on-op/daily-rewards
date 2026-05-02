import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";
import { uploadMerkleTree } from "../../upload-merkle-tree";
import { config } from "../../../config";
import {
  saveRootUpdateManifest,
  upsertManifestToken,
} from "../../../services/ops-state";

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
          const result = await uploadMerkleTree({
            config: {
              accountId: cfg.CLOUDFLARE_ACCOUNT_ID,
              namespaceId: cfg.CLOUDFLARE_NAMESPACE_ID,
              apiToken: cfg.CLOUDFLARE_API_TOKEN,
            },
            treeId: token,
            merkleTree: JSON.stringify(tree.dump()),
          });
          if (!result.success) {
            const message = result.error || "Cloudflare upload returned success=false";
            console.error(`[${this.name}] Error uploading merkle tree for ${token}: ${message}`);
            context.errors.push(new Error(`[${this.name}] ${token}: ${message}`));
            if (context.runManifest) {
              upsertManifestToken(context.runManifest, token, {
                cloudflareUploaded: false,
                cloudflareError: message,
              });
            }
            return;
          }

          console.log(`[${this.name}] Merkle tree for ${token} uploaded successfully`);
          if (context.runManifest) {
            upsertManifestToken(context.runManifest, token, {
              cloudflareUploaded: true,
              cloudflareError: undefined,
            });
          }
        } catch (err) {
          console.error(`[${this.name}] Error uploading merkle tree for ${token}:`, err);
          context.errors.push(err instanceof Error ? err : new Error(String(err)));
          if (context.runManifest) {
            upsertManifestToken(context.runManifest, token, {
              cloudflareUploaded: false,
              cloudflareError: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    );

    await Promise.all(uploadPromises);
    if (context.runManifest) {
      saveRootUpdateManifest(context.runManifest);
    }
    console.log(`[${this.name}] All uploads completed`);

    return context;
  }
}
