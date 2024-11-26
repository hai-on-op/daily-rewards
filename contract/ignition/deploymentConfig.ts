export type DeploymentConfig = {
  rewardSetter: string;
  tokens: {
    [key: string]: string;
  };
};

const configs: { [network: string]: DeploymentConfig } = {
  // Local development
  localhost: {
    rewardSetter: "0x...", // Set during deployment
    tokens: {
      KITE: "", // Will be deployed
      OP: "",   // Will be deployed
    },
  },
  
  // Optimism Goerli (testnet)
  "optimism-goerli": {
    rewardSetter: process.env.REWARD_SETTER_ADDRESS!,
    tokens: {
      KITE: process.env.KITE_TOKEN_ADDRESS!,
      OP: process.env.OP_TOKEN_ADDRESS!,
    },
  },
  
  // Optimism Mainnet
  optimism: {
    rewardSetter: process.env.REWARD_SETTER_ADDRESS!,
    tokens: {
      KITE: process.env.KITE_TOKEN_ADDRESS!,
      OP: process.env.OP_TOKEN_ADDRESS!,
    },
  },
};

export const getConfig = (network: string): DeploymentConfig => {
  const config = configs[network];
  if (!config) {
    throw new Error(`No configuration found for network: ${network}`);
  }
  return config;
}; 