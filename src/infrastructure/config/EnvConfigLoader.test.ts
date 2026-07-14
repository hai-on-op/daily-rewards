const MOCK_CONFIG = {
  GEB_SUBGRAPH_URL: "http://geb-subgraph",
  LP_GEB_SUBGRAPH_URL: "http://lp-geb-subgraph",
  MINTER_GEB_SUBGRAPH_URL: "http://minter-geb-subgraph",
  UNISWAP_SUBGRAPH_URL: "http://uniswap-subgraph",
  UNISWAP_POSITIONS_SUBGRAPH_URL: "http://uniswap-positions-subgraph",
  UNISWAP_SWAPS_SUBGRAPH_URL: "http://uniswap-swaps-subgraph",
  STKITE_SUBGRAPH_URL: "http://stkite-subgraph",
  HAIVELO_SUBGRAPH_URL: "http://haivelo-subgraph",
  LP_STAKING_SUBGRAPH_URL: "http://lpstaking-subgraph",
  HAIVELO_VELO_LP_INDEXER: "http://haivelo-lp-indexer",
  HAIAERO_SUBGRAPH_URL: "http://haiaero-subgraph",
  DISTRIBUTOR_SUBGRAPH_URL: "http://distributor-subgraph",

  RPC_URL: "http://rpc-default",
  LP_RPC_URL: "http://rpc-lp",
  MINTER_RPC_URL: "http://rpc-minter",
  HAIVELO_RPC_URL: "http://rpc-haivelo",
  LP_STAKING_RPC_URL: "http://rpc-lpstaking",
  DISTRIBUTOR_RPC_URL: "http://rpc-distributor",

  START_BLOCK: 1000,
  END_BLOCK: 2000,
  LP_HISTORIC_START_BLOCK: 500,
  LP_START_BLOCK: 1100,
  LP_END_BLOCK: 2100,
  MINTER_START_BLOCK: 1200,
  MINTER_END_BLOCK: undefined,
  HAIVELO_HISTORIC_START_BLOCK: 600,
  HAIVELO_START_BLOCK: 1300,
  HAIVELO_END_BLOCK: 2300,
  HAIAERO_START_BLOCK: 1400,
  HAIAERO_END_BLOCK: 2400,
  LP_STAKING_START_BLOCK: 1500,
  LP_STAKING_END_BLOCK: undefined,

  UNISWAP_POOL_ADDRESS: "0xpool",
  STANDARD_BRIDGE_ADDRESS: "0xbridge",
  LZ_EXECUTOR_ADDRESS: "0xlz",
  CROSS_DOMAIN_MESSENGER_ADDRESS: "0xmessenger",
  APX_ETH_ADDRESS: "0xapx",
  RETH_CONTRACT_ADDRESS: "0xreth",
  WSTETH_CONTRACT_ADDRESS: "0xwsteth",
  HOP_PROTOCOL_RETH_WRAPPER: "0xhop",

  KITE_ADDRESS: "0xkite",
  OP_ADDRESS: "0xop",
  DINERO_ADDRESS: "0xdinero",
  HAI_ADDRESS: "0xhai",

  REWARD_DISTRIBUTOR_ADDRESS: "0xdistributor",
  REWARD_SETTER_ADDRESS: "0xsetter",
  REWARD_SETTER_PRIVATE_KEY: "0xprivkey",

  ALCHEMY_API_KEY: "test-alchemy-key",
  DEPOSIT_CONTRACT_ADDRESS: "0xdeposit",
  DEPOSIT_SENDER_ADDRESS: "0xdepositsender",
  DEPOSIT_TOKEN_ADDRESS: "0xdeposittoken",
  HAIAERO_DEPOSIT_SENDER_ADDRESS: "0xhaiaero_sender",
  HAIAERO_DEPOSIT_TOKEN_ADDRESS: "0xhaiaero_token",

  HAIVELO_COLLATERAL_ENABLED: true,
  HAIVELO_LP_STAKING_ENABLED: true,
  HAIAERO_REWARDS_ENABLED: true,
  DEBUG_REWARDS: false,
  DEBUG_HAIAERO: false,
  IGNORE_BRIDGE: true,

  CLOUDFLARE_ACCOUNT_ID: "cf-account",
  CLOUDFLARE_NAMESPACE_ID: "cf-namespace",
  CLOUDFLARE_API_TOKEN: "cf-token",
  TELEGRAM_BOT_TOKEN: "tg-token",
  TELEGRAM_CHAT_STORAGE_FILE: "/tmp/tg-users.json",

  COLLATERAL_TYPES: ["RETH"],
  PLACEHOLDER_COLLATERAL_TYPES: ["HAIVELO"],
  LP_COLLATERAL_TYPES: ["OP", "WETH", "WSTETH"],
  HAIVELO_COLLATERAL_TYPE_IDS: ["HAIVELO", "HAIVELOV2"],
  HAIAERO_COLLATERAL_TYPE_IDS: ["HAIAERO"],

  rewards: {
    minter: {
      config: { KITE: { RETH: 10 } },
      collateralTypes: ["RETH"],
      windows: [{ startBlock: 1200, config: { KITE: { RETH: 10 } } }],
    },
    lp: {
      config: { KITE: 5 },
      historicConfig: { KITE: 1 },
      collateralTypes: ["OP"],
    },
    haiVelo: {
      historicConfig: { KITE: 2 },
      config: {},
    },
    haiAero: {
      config: {},
    },
    lpStaking: {
      config: {},
      stakingTypes: ["HAI_BOLD_CURVE", "HAI_VELO_VELO"],
      windows: [],
    },
  },

  DEBUG_OUTPUT_DIR: "/tmp/debug-data",
  EXCLUSION_LIST_FILE: "/tmp/exclusion-list.csv",
  CHAIN_ID: "optimism-mainnet",
  COVALENT_API_KEY: "covalent-key",
  REWARD_AMOUNT: 0,
  REWARD_TOKEN: "",
};

jest.mock("../../config", () => ({
  config: jest.fn(() => ({ ...MOCK_CONFIG })),
}));

import { EnvConfigLoader } from "./EnvConfigLoader";

describe("EnvConfigLoader", () => {
  let loader: EnvConfigLoader;

  beforeEach(() => {
    loader = new EnvConfigLoader();
  });

  describe("subgraphUrls", () => {
    it("should return all subgraph URLs", () => {
      const urls = loader.subgraphUrls();

      expect(urls.geb).toBe("http://geb-subgraph");
      expect(urls.lpGeb).toBe("http://lp-geb-subgraph");
      expect(urls.uniswap).toBe("http://uniswap-subgraph");
      expect(urls.uniswapPositions).toBe("http://uniswap-positions-subgraph");
      expect(urls.uniswapSwaps).toBe("http://uniswap-swaps-subgraph");
      expect(urls.haivelo).toBe("http://haivelo-subgraph");
      expect(urls.distributor).toBe("http://distributor-subgraph");
    });
  });

  describe("rpcUrls", () => {
    it("should return all RPC URLs", () => {
      const urls = loader.rpcUrls();

      expect(urls.default).toBe("http://rpc-default");
      expect(urls.lp).toBe("http://rpc-lp");
      expect(urls.distributor).toBe("http://rpc-distributor");
    });
  });

  describe("blockRanges", () => {
    it("should return correct block numbers", () => {
      const blocks = loader.blockRanges();

      expect(blocks.start).toBe(1000);
      expect(blocks.lpStart).toBe(1100);
      expect(blocks.minterStart).toBe(1200);
      expect(blocks.haiveloStart).toBe(1300);
    });

    it("should return undefined for optional end blocks", () => {
      const blocks = loader.blockRanges();

      expect(blocks.minterEnd).toBeUndefined();
      expect(blocks.lpStakingEnd).toBeUndefined();
    });
  });

  describe("tokenAddresses", () => {
    it("should return all token addresses", () => {
      const tokens = loader.tokenAddresses();

      expect(tokens.kite).toBe("0xkite");
      expect(tokens.op).toBe("0xop");
      expect(tokens.dinero).toBe("0xdinero");
      expect(tokens.hai).toBe("0xhai");
    });
  });

  describe("distributorConfig", () => {
    it("should return distributor config", () => {
      const dist = loader.distributorConfig();

      expect(dist.address).toBe("0xdistributor");
      expect(dist.rpcUrl).toBe("http://rpc-distributor");
      expect(dist.setterPrivateKey).toBe("0xprivkey");
    });
  });

  describe("featureToggles", () => {
    it("should return feature flags", () => {
      const flags = loader.featureToggles();

      expect(flags.haiveloCollateralEnabled).toBe(true);
      expect(flags.haiveloLpStakingEnabled).toBe(true);
      expect(flags.haiaeroRewardsEnabled).toBe(true);
      expect(flags.debugRewards).toBe(false);
      expect(flags.ignoreBridge).toBe(true);
    });
  });

  describe("rewards", () => {
    it("should return parsed reward config", () => {
      const rewards = loader.rewards();

      expect(rewards.minter.config).toEqual({ KITE: { RETH: 10 } });
      expect(rewards.lp.config).toEqual({ KITE: 5 });
      expect(rewards.minter.collateralTypes).toEqual(["RETH"]);
    });
  });

  describe("depositConfig", () => {
    it("should return deposit config", () => {
      const deposit = loader.depositConfig();

      expect(deposit.alchemyApiKey).toBe("test-alchemy-key");
      expect(deposit.senderAddress).toBe("0xdepositsender");
      expect(deposit.haiaeroSenderAddress).toBe("0xhaiaero_sender");
    });
  });

  describe("collateralConfig", () => {
    it("should return collateral config", () => {
      const collateral = loader.collateralConfig();

      expect(collateral.collateralTypes).toEqual(["RETH"]);
      expect(collateral.haiveloCollateralTypeIds).toEqual(["HAIVELO", "HAIVELOV2"]);
      expect(collateral.haiaeroCollateralTypeIds).toEqual(["HAIAERO"]);
    });
  });

  describe("chainId", () => {
    it("should return chain ID", () => {
      expect(loader.chainId()).toBe("optimism-mainnet");
    });
  });

  describe("storageConfig", () => {
    it("should return storage config", () => {
      const storage = loader.storageConfig();

      expect(storage.cloudflareAccountId).toBe("cf-account");
      expect(storage.telegramBotToken).toBe("tg-token");
    });
  });

  describe("caching", () => {
    it("should return consistent results across multiple calls", () => {
      const first = loader.subgraphUrls();
      const second = loader.subgraphUrls();

      expect(first).toEqual(second);
    });
  });
});
