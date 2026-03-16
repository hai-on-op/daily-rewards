import { TelegramNotifier } from "./TelegramNotifier";
import { TransactionNotification } from "../../core/interfaces/INotifier";

const mockSendMessage = jest.fn().mockResolvedValue(undefined);
const mockOnText = jest.fn();
const mockStopPolling = jest.fn();

jest.mock("node-telegram-bot-api", () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    onText: mockOnText,
    stopPolling: mockStopPolling,
  }));
});

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(
    JSON.stringify([
      { chatId: 111, username: "user1", joinedAt: "2024-01-01" },
      { chatId: 222, username: "user2", joinedAt: "2024-01-02" },
    ])
  ),
  writeFileSync: jest.fn(),
}));

describe("TelegramNotifier", () => {
  let notifier: TelegramNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-mock fs so readFileSync returns users again after clearAllMocks
    const fs = require("fs");
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(
      JSON.stringify([
        { chatId: 111, username: "user1", joinedAt: "2024-01-01" },
        { chatId: 222, username: "user2", joinedAt: "2024-01-02" },
      ])
    );

    notifier = new TelegramNotifier("test-token", "/tmp/users.json", false);
  });

  describe("notifyTransaction", () => {
    it("should format and send initiate notification", async () => {
      const notification: TransactionNotification = {
        type: "initiate",
        operation: "Pause Contract",
      };

      await notifier.notifyTransaction(notification);

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain("Transaction Initiated");
      expect(message).toContain("Pause Contract");
      expect(message).toContain("Pending confirmation");
    });

    it("should format and send success notification with tx details", async () => {
      const notification: TransactionNotification = {
        type: "success",
        operation: "Update Merkle Roots",
        txHash: "0xabc123",
        blockNumber: 12345,
      };

      await notifier.notifyTransaction(notification);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain("Transaction Confirmed");
      expect(message).toContain("0xabc123");
      expect(message).toContain("12345");
      expect(message).toContain("Successfully confirmed");
    });

    it("should format and send failure notification with error", async () => {
      const notification: TransactionNotification = {
        type: "failure",
        operation: "Pause Contract",
        error: "Insufficient gas",
      };

      await notifier.notifyTransaction(notification);

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain("Transaction Failed");
      expect(message).toContain("Insufficient gas");
    });

    it("should send to all registered users", async () => {
      await notifier.notifyTransaction({
        type: "initiate",
        operation: "Test",
      });

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage.mock.calls[0][0]).toBe(111);
      expect(mockSendMessage.mock.calls[1][0]).toBe(222);
    });

    it("should handle zero users gracefully", async () => {
      const fs = require("fs");
      fs.existsSync.mockReturnValue(false);

      const emptyNotifier = new TelegramNotifier(
        "test-token",
        "/tmp/empty.json",
        false
      );

      await emptyNotifier.notifyTransaction({
        type: "initiate",
        operation: "Test",
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should include details when provided", async () => {
      await notifier.notifyTransaction({
        type: "success",
        operation: "Test",
        details: { tokens: ["KITE", "OP"] },
      });

      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain("Details:");
      expect(message).toContain("KITE");
    });
  });

  describe("notifyMerkleUpdate", () => {
    it("should format and send merkle update", async () => {
      await notifier.notifyMerkleUpdate(
        ["KITE", "OP"],
        ["0xroot1", "0xroot2"]
      );

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      const message = mockSendMessage.mock.calls[0][1];
      expect(message).toContain("Merkle Roots Updated");
      expect(message).toContain("KITE");
      expect(message).toContain("0xroot1");
      expect(message).toContain("OP");
      expect(message).toContain("0xroot2");
    });
  });

  describe("error handling", () => {
    it("should remove user when chat not found", async () => {
      const fs = require("fs");
      mockSendMessage
        .mockRejectedValueOnce(new Error("chat not found"))
        .mockResolvedValueOnce(undefined);

      await notifier.notifyTransaction({
        type: "initiate",
        operation: "Test",
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
