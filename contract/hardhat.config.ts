import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    // Local development
    hardhat: {},
    localhost: {
      url: "http://0.0.0.0:8545",
    },

    // Optimism Goerli (testnet)
    /*"optimism-goerli": {
      url: process.env.OPTIMISM_GOERLI_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!].filter(Boolean),
    },
    
    // Optimism Mainnet
    optimism: {
      url: process.env.OPTIMISM_MAINNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!].filter(Boolean),
    },*/
  },
  etherscan: {
    apiKey: {
      optimisticEthereum: process.env.OPTIMISM_ETHERSCAN_API_KEY!,
      optimisticGoerli: process.env.OPTIMISM_ETHERSCAN_API_KEY!,
    },
  },
};

export default config;
