import { config } from "../config";
import { ethers } from "ethers";
import { REWARD_DISTRIBUTOR_ABI } from "../abis/REWARD_DISTRIBUTOR_ABI";

config();

const unpause = async () => {
  const cfg = config();

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

  console.log("Unpausing Reward Distributor...");
  const tx = await rewardDistributor.unpause();
  console.log("Reward Distributor Unpause transaction sent!");
  
  await tx.wait();
  console.log("Reward Distributor Successfully Unpaused!");
};

unpause()
  .then(() => {
    console.log("Unpause operation completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error unpausing reward distributor:", err);
    process.exit(1);
  }); 