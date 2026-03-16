import { FileExclusionList } from "../infrastructure/config/FileExclusionList";

const defaultList = new FileExclusionList();

/**
 * Reads an exclusion list from a file and returns an array of addresses.
 *
 * @param {string} fileName - The name of the exclusion list file.
 * @returns {Promise<string[]>} A promise that resolves to an array of addresses.
 */
export const getExclusionList = (fileName: string): Promise<string[]> =>
  defaultList.load(fileName);
