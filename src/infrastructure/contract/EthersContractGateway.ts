import { ethers } from "ethers";
import { REWARD_DISTRIBUTOR_ABI } from "../../abis/REWARD_DISTRIBUTOR_ABI";
import {
  IContractGateway,
  TransactionResult,
} from "../../core/interfaces/IContractGateway";

export class EthersContractGateway implements IContractGateway {
  private contract: ethers.Contract;

  constructor(rpcUrl: string, privateKey: string, contractAddress: string) {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(
      contractAddress,
      REWARD_DISTRIBUTOR_ABI,
      signer
    );
  }

  async isPaused(): Promise<boolean> {
    return await this.contract.paused();
  }

  async getEpochCounter(): Promise<number> {
    return Number(String(await this.contract.epochCounter()));
  }

  async pause(): Promise<TransactionResult> {
    const tx = await this.contract.pause();
    return this.waitForReceipt(tx);
  }

  async unpause(): Promise<TransactionResult> {
    const tx = await this.contract.unpause();
    return this.waitForReceipt(tx);
  }

  async startInitialEpoch(): Promise<TransactionResult> {
    const tx = await this.contract.startInitialEpoch();
    return this.waitForReceipt(tx);
  }

  async updateMerkleRoots(
    tokenAddresses: string[],
    roots: string[]
  ): Promise<TransactionResult> {
    const tx = await this.contract.updateMerkleRoots(tokenAddresses, roots);
    return this.waitForReceipt(tx);
  }

  private async waitForReceipt(
    tx: ethers.ContractTransaction
  ): Promise<TransactionResult> {
    const receipt = await tx.wait();
    return {
      hash: tx.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  }
}
