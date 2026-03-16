import { config, Config } from "../../config";
import { RewardConfig } from "../../config/types";
import {
  IConfigLoader,
  SubgraphUrls,
  RpcUrls,
  BlockRanges,
  TokenAddresses,
  ContractAddresses,
  DistributorConfig,
  DepositConfig,
  FeatureToggles,
  StorageConfig,
  CollateralConfig,
} from "../../core/interfaces/IConfigLoader";

export class EnvConfigLoader implements IConfigLoader {
  private cachedConfig: Config | null = null;

  private getConfig(): Config {
    if (!this.cachedConfig) {
      this.cachedConfig = config();
    }
    return this.cachedConfig;
  }

  subgraphUrls(): SubgraphUrls {
    const cfg = this.getConfig();
    return {
      geb: cfg.GEB_SUBGRAPH_URL,
      lpGeb: cfg.LP_GEB_SUBGRAPH_URL,
      minterGeb: cfg.MINTER_GEB_SUBGRAPH_URL,
      uniswap: cfg.UNISWAP_SUBGRAPH_URL,
      stkite: cfg.STKITE_SUBGRAPH_URL,
      haivelo: cfg.HAIVELO_SUBGRAPH_URL,
      lpStaking: cfg.LP_STAKING_SUBGRAPH_URL,
      haiveloVeloLpIndexer: cfg.HAIVELO_VELO_LP_INDEXER,
      haiaero: cfg.HAIAERO_SUBGRAPH_URL,
      distributor: cfg.DISTRIBUTOR_SUBGRAPH_URL,
    };
  }

  rpcUrls(): RpcUrls {
    const cfg = this.getConfig();
    return {
      default: cfg.RPC_URL,
      lp: cfg.LP_RPC_URL,
      minter: cfg.MINTER_RPC_URL,
      haivelo: cfg.HAIVELO_RPC_URL,
      lpStaking: cfg.LP_STAKING_RPC_URL,
      distributor: cfg.DISTRIBUTOR_RPC_URL,
    };
  }

  blockRanges(): BlockRanges {
    const cfg = this.getConfig();
    return {
      start: cfg.START_BLOCK,
      end: cfg.END_BLOCK,
      lpHistoricStart: cfg.LP_HISTORIC_START_BLOCK,
      lpStart: cfg.LP_START_BLOCK,
      lpEnd: cfg.LP_END_BLOCK,
      minterStart: cfg.MINTER_START_BLOCK,
      minterEnd: cfg.MINTER_END_BLOCK,
      haiveloHistoricStart: cfg.HAIVELO_HISTORIC_START_BLOCK,
      haiveloStart: cfg.HAIVELO_START_BLOCK,
      haiveloEnd: cfg.HAIVELO_END_BLOCK,
      haiaeroStart: cfg.HAIAERO_START_BLOCK,
      haiaeroEnd: cfg.HAIAERO_END_BLOCK,
      lpStakingStart: cfg.LP_STAKING_START_BLOCK,
      lpStakingEnd: cfg.LP_STAKING_END_BLOCK,
    };
  }

  tokenAddresses(): TokenAddresses {
    const cfg = this.getConfig();
    return {
      kite: cfg.KITE_ADDRESS,
      op: cfg.OP_ADDRESS,
      dinero: cfg.DINERO_ADDRESS,
      hai: cfg.HAI_ADDRESS,
    };
  }

  contractAddresses(): ContractAddresses {
    const cfg = this.getConfig();
    return {
      uniswapPool: cfg.UNISWAP_POOL_ADDRESS,
      standardBridge: cfg.STANDARD_BRIDGE_ADDRESS,
      lzExecutor: cfg.LZ_EXECUTOR_ADDRESS,
      crossDomainMessenger: cfg.CROSS_DOMAIN_MESSENGER_ADDRESS,
      apxEth: cfg.APX_ETH_ADDRESS,
      reth: cfg.RETH_CONTRACT_ADDRESS,
      wsteth: cfg.WSTETH_CONTRACT_ADDRESS,
      hopProtocolRethWrapper: cfg.HOP_PROTOCOL_RETH_WRAPPER,
    };
  }

  distributorConfig(): DistributorConfig {
    const cfg = this.getConfig();
    return {
      address: cfg.REWARD_DISTRIBUTOR_ADDRESS,
      rpcUrl: cfg.DISTRIBUTOR_RPC_URL,
      setterPrivateKey: cfg.REWARD_SETTER_PRIVATE_KEY,
      setterAddress: cfg.REWARD_SETTER_ADDRESS,
    };
  }

  depositConfig(): DepositConfig {
    const cfg = this.getConfig();
    return {
      alchemyApiKey: cfg.ALCHEMY_API_KEY,
      contractAddress: cfg.DEPOSIT_CONTRACT_ADDRESS,
      senderAddress: cfg.DEPOSIT_SENDER_ADDRESS,
      tokenAddress: cfg.DEPOSIT_TOKEN_ADDRESS,
      haiaeroSenderAddress: cfg.HAIAERO_DEPOSIT_SENDER_ADDRESS,
      haiaeroTokenAddress: cfg.HAIAERO_DEPOSIT_TOKEN_ADDRESS,
    };
  }

  featureToggles(): FeatureToggles {
    const cfg = this.getConfig();
    return {
      haiveloCollateralEnabled: cfg.HAIVELO_COLLATERAL_ENABLED,
      haiveloLpStakingEnabled: cfg.HAIVELO_LP_STAKING_ENABLED,
      haiaeroRewardsEnabled: cfg.HAIAERO_REWARDS_ENABLED,
      debugRewards: cfg.DEBUG_REWARDS,
      debugHaiaero: cfg.DEBUG_HAIAERO,
      ignoreBridge: cfg.IGNORE_BRIDGE,
    };
  }

  storageConfig(): StorageConfig {
    const cfg = this.getConfig();
    return {
      cloudflareAccountId: cfg.CLOUDFLARE_ACCOUNT_ID,
      cloudflareNamespaceId: cfg.CLOUDFLARE_NAMESPACE_ID,
      cloudflareApiToken: cfg.CLOUDFLARE_API_TOKEN,
      telegramBotToken: cfg.TELEGRAM_BOT_TOKEN,
      telegramChatStorageFile: cfg.TELEGRAM_CHAT_STORAGE_FILE,
    };
  }

  collateralConfig(): CollateralConfig {
    const cfg = this.getConfig();
    return {
      collateralTypes: cfg.COLLATERAL_TYPES,
      placeholderCollateralTypes: cfg.PLACEHOLDER_COLLATERAL_TYPES,
      lpCollateralTypes: cfg.LP_COLLATERAL_TYPES,
      haiveloCollateralTypeIds: cfg.HAIVELO_COLLATERAL_TYPE_IDS,
      haiaeroCollateralTypeIds: cfg.HAIAERO_COLLATERAL_TYPE_IDS,
    };
  }

  rewards(): RewardConfig {
    return this.getConfig().rewards;
  }

  debugOutputDir(): string {
    return this.getConfig().DEBUG_OUTPUT_DIR;
  }

  exclusionListFile(): string {
    return this.getConfig().EXCLUSION_LIST_FILE;
  }

  chainId(): string {
    return this.getConfig().CHAIN_ID;
  }
}
