import fs from "fs/promises";
import { IExclusionList } from "../../core/interfaces/IExclusionList";

export class FileExclusionList implements IExclusionList {
  private excludedAddresses: Set<string> = new Set();

  async load(fileName: string): Promise<string[]> {
    const fileContent = await fs.readFile(fileName, "utf-8");
    const addresses = fileContent
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x !== "");

    this.excludedAddresses = new Set(addresses);
    return addresses;
  }

  isExcluded(address: string): boolean {
    return this.excludedAddresses.has(address);
  }
}
