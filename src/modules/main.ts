import { combineResults } from "./result-combiner";
import { processAllRewards } from "../services/reward-processor";
import { generateMerkleTrees } from "../services/merkle-tree-generator";
import { uploadMerkleTreesToCloudFlare } from "../services/cloudflare-uploader";
import { updateMerkleRootsWithNotifications } from "../services/merkle-root-updater";
import { initializeContracts } from "../services/contract-initialization";
import { saveMerkleTreesAsFiles } from "../services/merkle-tree-storage";



export const main = async (entryCounter: number = 0) => {
  console.log("executing main");

  // Step 1: Combine results from all data sources
  const results = await combineResults();

  // Step 2: Process all rewards (convert to BigNumber and filter claimed amounts)
  const finalResults = await processAllRewards(results);

  console.log("doing merkle tries!!!", finalResults);

  // Step 3: Generate merkle trees from processed rewards
  const merkleTries = generateMerkleTrees(finalResults);

  // Step 4: Initialize contracts for merkle root update
  const { rewardDistributor } = await initializeContracts();

  // Step 5: Update merkle roots on-chain with notifications
  await updateMerkleRootsWithNotifications({
    merkleTries,
    rewardDistributor,
  });

  // Step 6: Save merkle trees as backup files
  await saveMerkleTreesAsFiles({
    merkleTries,
    entryCounter
  });

  // Step 7: Upload merkle trees to CloudFlare
  //await uploadMerkleTreesToCloudFlare(merkleTries);
};

// main().catch(console.error);
