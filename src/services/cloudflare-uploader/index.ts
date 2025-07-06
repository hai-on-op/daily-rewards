/**
 * Service for uploading merkle trees to CloudFlare
 */

import { config } from '../../config';
import { uploadMerkleTree } from '../../modules/upload-merkle-tree';
import { MerkleTreesData } from '../merkle-tree-generator';

export interface CloudFlareConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}

export interface UploadResult {
  token: string;
  success: boolean;
  error?: string;
}

/**
 * Gets CloudFlare configuration from environment
 * @returns CloudFlare configuration object
 */
export function getCloudFlareConfig(): CloudFlareConfig {
  const cfg = config();
  return {
    accountId: cfg.CLOUDFLARE_ACCOUNT_ID,
    namespaceId: cfg.CLOUDFLARE_NAMESPACE_ID,
    apiToken: cfg.CLOUDFLARE_API_TOKEN,
  };
}

/**
 * Uploads a single merkle tree to CloudFlare
 * @param token - Token name
 * @param tree - Merkle tree object
 * @param cloudflareConfig - CloudFlare configuration
 * @returns Upload result
 */
export async function uploadSingleMerkleTree(
  token: string,
  tree: any,
  cloudflareConfig: CloudFlareConfig
): Promise<UploadResult> {
  try {
    await uploadMerkleTree({
      config: cloudflareConfig,
      treeId: token,
      merkleTree: JSON.stringify(tree.dump()),
    });
    console.log(`Merkle tree for ${token} uploaded successfully`);
    return { token, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error uploading merkle tree for ${token}:`, error);
    return { token, success: false, error: errorMessage };
  }
}

/**
 * Uploads all merkle trees to CloudFlare
 * @param merkleTries - Object containing merkle trees for each token
 * @returns Array of upload results
 */
export async function uploadMerkleTreesToCloudFlare(
  merkleTries: MerkleTreesData
): Promise<UploadResult[]> {
  console.log('Uploading merkle trees to CloudFlare...');

  const cloudflareConfig = getCloudFlareConfig();

  const uploadPromises = Object.entries(merkleTries).map(([token, tree]) =>
    uploadSingleMerkleTree(token, tree, cloudflareConfig)
  );

  const results = await Promise.all(uploadPromises);

  const successfulUploads = results.filter(result => result.success);
  const failedUploads = results.filter(result => !result.success);

  console.log(`Successfully uploaded ${successfulUploads.length} merkle trees to CloudFlare`);
  if (failedUploads.length > 0) {
    console.warn(`Failed to upload ${failedUploads.length} merkle trees to CloudFlare`);
    failedUploads.forEach(result => {
      console.warn(`  - ${result.token}: ${result.error}`);
    });
  }

  return results;
}