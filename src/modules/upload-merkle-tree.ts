// upload-merkle-tree.ts

// Types for the merkle tree data

interface CloudflareConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}

interface UploadParams {
  config: CloudflareConfig;
  treeId: string; // Identifier for the merkle tree
  merkleTree: string;
}

/**
 * Uploads a merkle tree to Cloudflare KV storage
 * @param params Upload parameters including Cloudflare config and merkle tree data
 * @returns Promise with the upload result
 */
export const uploadMerkleTree = async ({
  config,
  treeId,
  merkleTree,
}: UploadParams): Promise<{ success: boolean; error?: string }> => {
  const { accountId, namespaceId, apiToken } = config;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${treeId}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: merkleTree,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to upload: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      error: result.errors?.[0]?.message,
    };
  } catch (error) {
    console.error("Error uploading merkle tree:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

// Example usage with environment variables
const config: CloudflareConfig = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  namespaceId: process.env.CLOUDFLARE_NAMESPACE_ID!,
  apiToken: process.env.CLOUDFLARE_API_TOKEN!,
};

// Example function to upload a new merkle tree
export async function uploadNewMerkleTree(
  merkleTree: string,
  treeId: string
) {
  try {
    const result = await uploadMerkleTree({
      config,
      treeId,
      merkleTree,
    });

    if (result.success) {
      console.log(`Successfully uploaded merkle tree with ID: ${treeId}`);
    } else {
      console.error(`Failed to upload merkle tree: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error("Failed to upload merkle tree:", error);
    throw error;
  }
}

// Batch upload example if needed
export async function uploadBatchMerkleTrees(
  trees: Array<{ treeId: string; tree: string }>
) {
  const uploadPromises = trees.map(({ treeId, tree }) =>
    uploadMerkleTree({
      config,
      treeId,
      merkleTree: tree,
    })
  );

  return Promise.all(uploadPromises);
}
