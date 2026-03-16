export interface IExclusionList {
  load(source: string): Promise<string[]>;
  isExcluded(address: string): boolean;
}
