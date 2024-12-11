import { combineResults } from "./result-combiner";
import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

import { uploadMerkleTree } from "./upload-merkle-tree";
import { config } from "../config";
import { subgraphQuery } from "../services/subgraph/utils";

import { REWARD_DISTRIBUTOR_ABI } from "../abis/REWARD_DISTRIBUTOR_ABI";

async function getClaimedAmounts(
  token: string,
  users: string[]
): Promise<Map<string, string>> {
  const query = `
    {
      tokenClaims(where: {
        token: "${token.toLowerCase()}"
        user_in: ${JSON.stringify(users.map((u) => u.toLowerCase()))}
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

async function updateMerkleRoots(merkleTries: { [token: string]: any }) {
  const cfg = config();

  // Setup provider and signer
  const provider = new ethers.providers.JsonRpcProvider(
    cfg.DISTRIBUTOR_RPC_URL
  );
  const signer = new ethers.Wallet(cfg.REWARD_SETTER_PRIVATE_KEY, provider);

  // Get contract instance
  const rewardDistributor = new ethers.Contract(
    cfg.REWARD_DISTRIBUTOR_ADDRESS,
    REWARD_DISTRIBUTOR_ABI,
    signer
  );

  // Prepare arrays for updateMerkleRoots
  const tokenAddresses = [];
  const roots = [];

  // Map token names to addresses
  const tokenAddressMap = {
    KITE: cfg.KITE_ADDRESS,
    OP: cfg.OP_ADDRESS,
  };

  // Build arrays for the contract call
  for (const [token, tree] of Object.entries(merkleTries)) {
    const tokenAddress = tokenAddressMap[token as keyof typeof tokenAddressMap];
    if (!tokenAddress) {
      console.warn(`No address found for token: ${token}`);
      continue;
    }

    tokenAddresses.push(tokenAddress);
    roots.push(tree.root);
    console.log(`Merkle root for ${token} (${tokenAddress}):`, tree.root);
  }

  try {
    console.log("Updating merkle roots...");
    const tx = await rewardDistributor.updateMerkleRoots(tokenAddresses, roots);
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt?.blockNumber);
  } catch (error) {
    console.error("Error updating merkle roots:", error);
    throw error;
  }
}

export const main = async () => {
  const results = await combineResults();

  // Convert earned values to BigNumber with 18 decimals
  const adjustedResults = Object.entries(results)
    .map(([token, userRewards]) => ({
      [token]: userRewards.map((reward) => ({
        address: reward.address,
        earned: ethers.utils.parseEther(reward.earned.toString()).toString(),
      })),
    }))
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});

  // Subtract claimed amounts
  const finalResults: typeof adjustedResults = {};

  for (const [token, rewards] of Object.entries(adjustedResults)) {
    console.log(`Processing claims for token: ${token}`);

    // Get all claimed amounts for this token

    const tokenAddressMap = {
      KITE: config().KITE_ADDRESS,
      OP: config().OP_ADDRESS,
    };

    const claimedAmounts = await getClaimedAmounts(
      tokenAddressMap[token.toUpperCase() as keyof typeof tokenAddressMap],
      rewards.map((r) => r.address)
    );

    console.log("claimed amounts", claimedAmounts);

    // Subtract claimed amounts from earned amounts
    finalResults[token] = rewards
      .map((reward) => {
        const claimed = claimedAmounts.get(reward.address.toLowerCase()) || "0";
        const remaining = ethers.BigNumber.from(reward.earned).sub(
          ethers.BigNumber.from(claimed)
        );
        return {
          address: reward.address,
          earned: remaining.toString(),
        };
      })
      .filter((reward) => reward.earned !== "0");

    console.log(`Found ${claimedAmounts.size} previous claims for ${token}`);
  }

  // Generating merkle tree
  const merkleTries = Object.entries(finalResults)
    .map(([token, rewards]) => {
      const tree = StandardMerkleTree.of(
        rewards.map(({ address, earned }) => [address, earned]),
        ["address", "uint256"]
      );
      return { [token]: tree };
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

  // Generate merkle trees and update them on-chain
  await updateMerkleRoots(merkleTries);
};

//main().catch(console.error);
