// getExclusionList.ts

import fs from "fs/promises";

/**
 * Reads an exclusion list from a file and returns an array of addresses.
 *
 * @param {string} fileName - The name of the exclusion list file.
 * @returns {Promise<string[]>} A promise that resolves to an array of addresses.
 */
export const getExclusionList = async (fileName: string): Promise<string[]> => {
  const fileContent = await fs.readFile(fileName, "utf-8");
  return fileContent
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x !== "");
};
