import { notifyTransaction } from "../telegram-bot";
import { ProcessingStep, FeatureFlags } from "./types";
import { RewardDistributionOrchestrator } from "./RewardDistributionOrchestrator";

jest.mock("./steps", () => ({}));

jest.mock("./contractHelpers", () => ({
  createContractConnection: jest.fn(() => ({
    provider: {},
    signer: {},
    rewardDistributor: {},
  })),
  getEpochCounter: jest.fn().mockResolvedValue(387),
}));

jest.mock("./featureFlags", () => ({
  logFeatureFlags: jest.fn(),
}));

jest.mock("../../config", () => ({
  config: jest.fn(() => ({})),
}));

jest.mock("../telegram-bot", () => ({
  notifyTransaction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/ops-state", () => ({
  createRootUpdateManifest: jest.fn(),
  recordManifestError: jest.fn(),
  saveRootUpdateManifest: jest.fn(),
}));

const flags: FeatureFlags = {
  initTelegram: false,
  pauseContract: false,
  handleInitialEpoch: false,
  prepareConfig: false,
  calculateRewards: false,
  generateMerkleTrees: false,
  updateOnChain: false,
  saveBackups: false,
  uploadToCloudflare: false,
  sendNotifications: true,
};

describe("RewardDistributionOrchestrator", () => {
  it("reports the step that threw instead of the last completed step", async () => {
    const completedStep: ProcessingStep = {
      name: "CompletedStep",
      isEnabled: () => true,
      execute: async (context) => context,
    };
    const failingStep: ProcessingStep = {
      name: "FailingStep",
      isEnabled: () => true,
      execute: async () => {
        throw new Error("upstream unavailable");
      },
    };
    const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const orchestrator = new RewardDistributionOrchestrator(flags, [
        completedStep,
        failingStep,
      ]);

      await expect(orchestrator.run()).rejects.toThrow("upstream unavailable");

      expect(notifyTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "failure",
          details: expect.objectContaining({
            executedSteps: ["CompletedStep"],
            failedAt: "FailingStep",
          }),
        })
      );
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });
});
