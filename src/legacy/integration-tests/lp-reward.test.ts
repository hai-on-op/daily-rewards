import { calculateLpRewards } from "../modules/lp-rewards";
// @ts-ignore
import targetResult from "./lp-rewards-target-result.json";

console.log(targetResult);

describe("LP Rewards Integration Test", () => {
  beforeAll(() => {
    process.env.API_KEY = "test-key";
  });

  jest.setTimeout(2 * 60 * 1000); // Set timeout for all tests in this block

  it("should match target result format and values", async () => {
    const rewards = await calculateLpRewards(6600);

    // Transform rewards into target format
    const formattedRewards = Object.entries(rewards)
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
