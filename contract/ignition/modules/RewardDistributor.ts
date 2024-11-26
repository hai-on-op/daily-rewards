import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const INITIAL_MINT_AMOUNT = ethers.parseEther("1000000"); // 1M tokens

const RewardDistributorTestModule = buildModule(
  "RewardDistributorTestModule",
  (m) => {
    // Deploy RewardDistributor
    const rewardDistributor = m.contract("RewardDistributor");
    const mockKITE = m.contract("MockERC20", ["Kite Token", "KITE"]);
    const mockOP = m.contract("MockERC20", ["Optimism", "OP"], {id: 'MockOP'});

    // Set reward setter
    m.call(rewardDistributor, "setRewardSetter", [
      process.env.REWARD_SETTER_ADDRESS || m.getAccount(0),
    ]);

    // Mint tokens to RewardDistributor
    m.call(mockKITE, "mint", [rewardDistributor, INITIAL_MINT_AMOUNT]);
    m.call(mockOP, "mint", [rewardDistributor, INITIAL_MINT_AMOUNT]);

    return {
      rewardDistributor,
      mockKITE,
      mockOP,
    };
  }
);

export default RewardDistributorTestModule;
