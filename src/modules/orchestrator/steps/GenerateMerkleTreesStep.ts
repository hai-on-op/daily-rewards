import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ProcessingStep, ProcessingContext, FeatureFlags } from "../types";

/**
 * Step: Generate merkle trees from calculated rewards
 */
export class GenerateMerkleTreesStep implements ProcessingStep {
  readonly name = "GenerateMerkleTrees";

  isEnabled(flags: FeatureFlags): boolean {
    return flags.generateMerkleTrees;
  }

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    console.log(`[${this.name}] Generating merkle trees...`);

    if (!context.finalRewards || Object.keys(context.finalRewards).length === 0) {
      console.log(`[${this.name}] No rewards to process, skipping merkle tree generation`);
      return context;
    }

    // Generate merkle trees for each token
    const merkleTrees: { [token: string]: StandardMerkleTree<[string, string]> } = {};
    
    for (const [token, rewards] of Object.entries(context.finalRewards)) {
      console.log(`[${this.name}] Generating tree for ${token} with ${rewards.length} entries`);
      
      const treeData: [string, string][] = rewards.map(({ address, earned }) => [address, earned]);
      const tree = StandardMerkleTree.of(treeData, ["address", "uint256"]);
      
      console.log(`[${this.name}] ${token} merkle root: ${tree.root}`);
      merkleTrees[token] = tree;
    }

    context.merkleTrees = merkleTrees;
    console.log(`[${this.name}] Generated ${Object.keys(merkleTrees).length} merkle trees`);

    return context;
  }
}

