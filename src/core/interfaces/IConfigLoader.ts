import { RewardConfig } from "../../config/types";

export interface SubgraphUrls {
  geb: string;
  lpGeb: string;
  minterGeb: string;
  uniswap: string;
  uniswapPositions: string;
  uniswapSwaps: string;
  stkite: string;
  haivelo: string;
  lpStaking: string;
  haiveloVeloLpIndexer: string;
  haiaero: string;
  distributor: string;
}

export interface RpcUrls {
  default: string;
  lp: string;
  minter: string;
  haivelo: string;
  lpStaking: string;
  distributor: string;
}

export interface BlockRanges {
  start: number;
  end: number;
  lpHistoricStart: number;
  lpStart: number;
  lpEnd: number;
  minterStart: number;
  minterEnd: number | undefined;
  haiveloHistoricStart: number;
  haiveloStart: number;
  haiveloEnd: number;
  haiaeroStart: number;
  haiaeroEnd: number;
  lpStakingStart: number;
  lpStakingEnd: number | undefined;
}

export interface TokenAddresses {
  kite: string;
  op: string;
  dinero: string;
  hai: string;
}

export interface ContractAddresses {
  uniswapPool: string;
  standardBridge: string;
  lzExecutor: string;
  crossDomainMessenger: string;
  apxEth: string;
  reth: string;
  wsteth: string;
  hopProtocolRethWrapper: string;
}

export interface DistributorConfig {
  address: string;
  rpcUrl: string;
  setterPrivateKey: string;
  setterAddress: string;
}

export interface DepositConfig {
  alchemyApiKey: string;
  contractAddress: string;
  senderAddress: string;
  tokenAddress: string;
  haiaeroSenderAddress: string;
  haiaeroTokenAddress: string;
}

export interface FeatureToggles {
  haiveloCollateralEnabled: boolean;
  haiveloLpStakingEnabled: boolean;
  haiaeroRewardsEnabled: boolean;
  debugRewards: boolean;
  debugHaiaero: boolean;
  ignoreBridge: boolean;
}

export interface StorageConfig {
  cloudflareAccountId: string;
  cloudflareNamespaceId: string;
  cloudflareApiToken: string;
  telegramBotToken: string;
  telegramChatStorageFile: string;
}

export interface CollateralConfig {
  collateralTypes: string[];
  placeholderCollateralTypes: string[];
  lpCollateralTypes: string[];
  haiveloCollateralTypeIds: string[];
  haiaeroCollateralTypeIds: string[];
}

export interface IConfigLoader {
  subgraphUrls(): SubgraphUrls;
  rpcUrls(): RpcUrls;
  blockRanges(): BlockRanges;
  tokenAddresses(): TokenAddresses;
  contractAddresses(): ContractAddresses;
  distributorConfig(): DistributorConfig;
  depositConfig(): DepositConfig;
  featureToggles(): FeatureToggles;
  storageConfig(): StorageConfig;
  collateralConfig(): CollateralConfig;
  rewards(): RewardConfig;
  debugOutputDir(): string;
  exclusionListFile(): string;
  chainId(): string;
}
