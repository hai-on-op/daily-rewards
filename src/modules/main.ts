import { combineResults } from "./result-combiner";
import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

import { uploadMerkleTree } from "./upload-merkle-tree";
import { config } from "../config";

const main = async () => {
  const results = await combineResults();

  // Adjusting results to 18 decimals to be useud in merkle tree
  const adjustedResults = Object.entries(results)
    .map(([token, userRewards]) => ({
      [token]: userRewards.map((reward) => ({
        address: reward.address,
        earned: ethers.utils.parseEther(reward.earned.toString()).toString(),
      })),
    }))
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});

  console.log(Object.keys(adjustedResults));

  // Generating merkle tree
  const merkleTries = Object.entries(adjustedResults)
    .map(([token, rewards]) => {
      const tree = StandardMerkleTree.of(
        rewards.map(({ address, earned }) => {
          return [address, earned];
        }),
        ["address", "uint256"]
      );
      return {
        [token]: tree,
      };
    })
    .reduce((pV, cV) => ({ ...pV, ...cV }), {});

  console.log(Object.keys(merkleTries));

  // Upload Merkle tree to CloudFlare

  Object.entries(merkleTries).forEach(async ([token, tree]) => {
    try {
      await uploadMerkleTree({
        config: {
          accountId: config().CLOUDFLARE_ACCOUNT_ID,
          namespaceId: config().CLOUDFLARE_NAMESPACE_ID,
          apiToken: config().CLOUDFLARE_API_TOKEN,
        },
        treeId: token,
        merkleTree: JSON.stringify(tree.dump()),
      });
      console.log(`Merkle tree for ${token} uploaded successfully`);
    } catch (err) {
      console.error(err);
    }
  });

  // Set Merkle Roots into the contract

  Object.entries(merkleTries).forEach(([token, tree]) => {
    console.log(`Merkle root for ${token}:`, tree.root);
  });
};

main().catch(console.error);
