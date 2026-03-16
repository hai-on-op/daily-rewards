import { FileExclusionList } from "./FileExclusionList";
import fs from "fs/promises";

jest.mock("fs/promises");

describe("FileExclusionList", () => {
  let exclusionList: FileExclusionList;

  beforeEach(() => {
    jest.clearAllMocks();
    exclusionList = new FileExclusionList();
  });

  describe("load", () => {
    it("should read file and return trimmed addresses", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(
        "0xAddress1\n0xAddress2\n0xAddress3\n"
      );

      const result = await exclusionList.load("exclusion-list.csv");

      expect(fs.readFile).toHaveBeenCalledWith("exclusion-list.csv", "utf-8");
      expect(result).toEqual(["0xAddress1", "0xAddress2", "0xAddress3"]);
    });

    it("should handle whitespace and empty lines", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(
        " 0xAddress1 \n\n0xAddress2\n  \n0xAddress3\n"
      );

      const result = await exclusionList.load("exclusion-list.csv");

      expect(result).toEqual(["0xAddress1", "0xAddress2", "0xAddress3"]);
    });

    it("should return empty array for empty file", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue("");

      const result = await exclusionList.load("empty.csv");

      expect(result).toEqual([]);
    });

    it("should propagate file read errors", async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(
        new Error("File not found")
      );

      await expect(exclusionList.load("missing.csv")).rejects.toThrow(
        "File not found"
      );
    });
  });

  describe("isExcluded", () => {
    it("should return true for excluded addresses after load", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(
        "0xAddress1\n0xAddress2\n"
      );

      await exclusionList.load("list.csv");

      expect(exclusionList.isExcluded("0xAddress1")).toBe(true);
      expect(exclusionList.isExcluded("0xAddress2")).toBe(true);
    });

    it("should return false for non-excluded addresses", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(
        "0xAddress1\n0xAddress2\n"
      );

      await exclusionList.load("list.csv");

      expect(exclusionList.isExcluded("0xAddress3")).toBe(false);
    });

    it("should return false before load is called", () => {
      expect(exclusionList.isExcluded("0xAddress1")).toBe(false);
    });
  });
});
