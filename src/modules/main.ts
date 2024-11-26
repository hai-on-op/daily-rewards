import { combineResults } from "./result-combiner";
import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

import { uploadMerkleTree } from "./upload-merkle-tree";
import { config } from "../config";

const REWARD_DISTRIBUTOR_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "tokens",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "bytes32[]",
        name: "roots",
        type: "bytes32[]",
      },
    ],
    name: "MerkleRootsUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldSetter",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newSetter",
        type: "address",
      },
    ],
    name: "RewardSetterUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "RewardsClaimed",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "bytes32[]",
        name: "merkleProof",
        type: "bytes32[]",
      },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "isClaimed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "merkleRoots",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "tokens",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
      {
        internalType: "bytes32[][]",
        name: "merkleProofs",
        type: "bytes32[][]",
      },
    ],
    name: "multiClaim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "recoverERC20",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "rewardSetter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newRewardSetter",
        type: "address",
      },
    ],
    name: "setRewardSetter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "tokens",
        type: "address[]",
      },
      {
        internalType: "bytes32[]",
        name: "roots",
        type: "bytes32[]",
      },
    ],
    name: "updateMerkleRoots",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

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
  )

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

  // Generate merkle trees and update them on-chain
  await updateMerkleRoots(merkleTries);
};

main().catch(console.error);
