import { NullNotifier } from "./NullNotifier";

describe("NullNotifier", () => {
  const notifier = new NullNotifier();

  it("should resolve notifyTransaction without throwing", async () => {
    await expect(
      notifier.notifyTransaction({
        type: "success",
        operation: "Test",
      })
    ).resolves.toBeUndefined();
  });

  it("should resolve notifyMerkleUpdate without throwing", async () => {
    await expect(
      notifier.notifyMerkleUpdate(["KITE"], ["0xroot"])
    ).resolves.toBeUndefined();
  });
});
