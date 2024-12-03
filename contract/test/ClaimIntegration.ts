import { expect } from "chai";
import { ethers } from "hardhat";
import { RewardDistributor, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import merkleKiteData from "./merkle-kite.json";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("Claim Integration Test", function () {
  let rewardDistributor: RewardDistributor;
  let kiteToken: MockERC20;
  let owner: SignerWithAddress;

  // Deployed contract addresses
  const REWARD_DISTRIBUTOR_ADDRESS =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const KITE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const CLAIMER_ADDRESS = "0xda27d2bdf91a8919b91bdf71f8fd1d2638f9421c";
  const CLAIM_AMOUNT = "1496077541494047000000";

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // Connect to existing contracts
    rewardDistributor = await ethers.getContractAt(
      "RewardDistributor",
      REWARD_DISTRIBUTOR_ADDRESS
    );
    kiteToken = await ethers.getContractAt("MockERC20", KITE_ADDRESS);
  });

  it("should allow claimer to claim their KITE tokens", async function () {
    console.log(
      await rewardDistributor.merkleRoots(
        "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
      )
    );

    // Find claimer's data in merkle tree
    const claimerData = merkleKiteData.values.find(
      (v) => v.value[0].toLowerCase() === CLAIMER_ADDRESS.toLowerCase()
    );
    expect(claimerData).to.not.be.undefined;

    // @ts-ignore
    const tree = StandardMerkleTree.load(merkleKiteData);

    const claimData = [CLAIMER_ADDRESS, CLAIM_AMOUNT.toString()];

    const proof = tree.getProof(claimData);

    console.log(proof);

    // Get proof for the claimer

    // Impersonate claimer
    await ethers.provider.send("hardhat_impersonateAccount", [CLAIMER_ADDRESS]);
    const claimer = await ethers.getSigner(CLAIMER_ADDRESS);

    // Fund claimer with ETH for gas
    await owner.sendTransaction({
      to: CLAIMER_ADDRESS,
      value: ethers.parseEther("1.0"),
    });

    // Check initial balance
    const balanceBefore = await kiteToken.balanceOf(CLAIMER_ADDRESS);
    console.log("Balance before:", balanceBefore.toString());

    // Claim tokens
    await rewardDistributor
      .connect(claimer)
      .claim(KITE_ADDRESS, CLAIM_AMOUNT, proof);

    // Verify balance after claim
    const balanceAfter = await kiteToken.balanceOf(CLAIMER_ADDRESS);
    console.log("Balance after:", balanceAfter.toString());
    expect(balanceAfter - balanceBefore).to.equal(CLAIM_AMOUNT);

    // Stop impersonating
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [
      CLAIMER_ADDRESS,
    ]);
  });
});
