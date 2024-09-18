// getExclusionList.test.ts

import { getExclusionList } from "./getExclusionList";
import fs from "fs/promises";

jest.mock("fs/promises");

describe("getExclusionList", () => {
  it("should read the exclusion list file and return an array of addresses", async () => {
    const mockFileContent = "0xAddress1\n0xAddress2\n0xAddress3\n";
    (fs.readFile as jest.Mock).mockResolvedValue(mockFileContent);

    const result = await getExclusionList("exclusion-list.csv");

    expect(fs.readFile).toHaveBeenCalledWith("exclusion-list.csv", "utf-8");
    expect(result).toEqual(["0xAddress1", "0xAddress2", "0xAddress3"]);
  });

  it("should handle empty lines and trim addresses", async () => {
    const mockFileContent = " 0xAddress1 \n\n0xAddress2\n  \n0xAddress3\n";
    (fs.readFile as jest.Mock).mockResolvedValue(mockFileContent);

    const result = await getExclusionList("exclusion-list.csv");

    expect(result).toEqual(["0xAddress1", "0xAddress2", "0xAddress3"]);
  });

  it("should return an empty array if the file is empty", async () => {
    const mockFileContent = "";
    (fs.readFile as jest.Mock).mockResolvedValue(mockFileContent);

    const result = await getExclusionList("empty.csv");

    expect(result).toEqual([]);
  });

  it("should throw an error if the file cannot be read", async () => {
    const mockError = new Error("File not found");
    (fs.readFile as jest.Mock).mockRejectedValue(mockError);

    await expect(getExclusionList("non-existent.csv")).rejects.toThrow(
      "File not found"
    );
  });
});
