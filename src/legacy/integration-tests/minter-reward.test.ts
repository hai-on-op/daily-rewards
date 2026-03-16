import { calculateMinterRewards } from "../modules/minter-rewards";
// @ts-ignore
import targetResult from "./minter-rewards-target-result.json";

describe("Minter Rewards Integration Test", () => {
  jest.setTimeout(4 * 60 * 1000); // 2 minutes timeout

  it("should match target result format and values for KITE/APXETH rewards", async () => {
    const rewards = await calculateMinterRewards(125316512, 126283342);

    // Transform rewards into target format
    const formattedRewards = Object.entries(rewards["KITE"]["APXETH"])
      .map(([address, value]) => ({
        address,
        earned: value.earned,
      }))
      .filter(({ earned }) => earned > 0)
      .sort((a, b) => b.earned - a.earned);

    // Compare with target result
    expect(formattedRewards.length).toBe(targetResult.length);

    formattedRewards.forEach((reward, index) => {
      const targetReward = targetResult[index];

      // Compare addresses (case-insensitive)
      expect(reward.address.toLowerCase()).toBe(
        targetReward.address.toLowerCase()
      );

      // Compare earned values with tolerance for floating point
      const earnedDiff = Math.abs(reward.earned - targetReward.earned);
      expect(earnedDiff).toBeLessThan(0.0001);
    });

    // Debug logging
    console.log("Actual results:", JSON.stringify(formattedRewards, null, 2));
    console.log("Target results:", JSON.stringify(targetResult, null, 2));
  });
});
