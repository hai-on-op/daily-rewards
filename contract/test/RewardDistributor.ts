import { expect } from "chai";
import { ethers } from "hardhat";
import { RewardDistributor, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

interface Claim {
  user: string;
  amount: bigint;
}

function generateMerkleTree(claims: Claim[]) {
  const entries = claims.map((claim) => [claim.user, claim.amount.toString()]);

  return StandardMerkleTree.of(entries, ["address", "uint256"]);
}

function generateMockClaims(users: string[], amount: bigint): Claim[] {
  return users.map((user) => ({
    user,
    amount,
  }));
}

describe("RewardDistributor", function () {
  let rewardDistributor: RewardDistributor;
  let mockERC20: MockERC20;
  let mock2ERC20: MockERC20;
  let owner: SignerWithAddress;
  let rewardSetter: SignerWithAddress;
  let otherAccount: SignerWithAddress;
  let users: SignerWithAddress[];

  const INITIAL_MINT_AMOUNT = ethers.parseEther("10000");
  const DISTRIBUTOR_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, rewardSetter, otherAccount, ...users] = await ethers.getSigners();

    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Mock Token", "MTK");
    mock2ERC20 = await MockERC20.deploy("Mock Token", "MTK");
    await mockERC20.mint(owner.address, INITIAL_MINT_AMOUNT);
    await mock2ERC20.mint(owner.address, INITIAL_MINT_AMOUNT);

    // Deploy RewardDistributor
    const RewardDistributor = await ethers.getContractFactory(
      "RewardDistributor"
    );
    rewardDistributor = await RewardDistributor.deploy();

    // Setup
    await rewardDistributor.setRewardSetter(rewardSetter.address);
    await mockERC20.transfer(
      await rewardDistributor.getAddress(),
      DISTRIBUTOR_AMOUNT
    );
    await mock2ERC20.transfer(
      await rewardDistributor.getAddress(),
      DISTRIBUTOR_AMOUNT
    );
  });

  describe("setRewardSetter", function () {
    it("should allow owner to set reward setter", async function () {
      await rewardDistributor.setRewardSetter(ethers.ZeroAddress);

      await expect(rewardDistributor.setRewardSetter(rewardSetter.address))
        .to.emit(rewardDistributor, "RewardSetterUpdated")
        .withArgs(ethers.ZeroAddress, rewardSetter.address);

      expect(await rewardDistributor.rewardSetter()).to.equal(
        rewardSetter.address
      );
    });

    it("should emit RewardSetterUpdated with correct old and new addresses", async function () {
      // First update
      await rewardDistributor.setRewardSetter(rewardSetter.address);

      // Second update
      await expect(rewardDistributor.setRewardSetter(otherAccount.address))
        .to.emit(rewardDistributor, "RewardSetterUpdated")
        .withArgs(rewardSetter.address, otherAccount.address);
    });

    it("should revert when called by non-owner", async function () {
      await expect(
        rewardDistributor
          .connect(otherAccount)
          .setRewardSetter(rewardSetter.address)
      )
        .to.be.revertedWithCustomError(
          rewardDistributor,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(otherAccount.address);
    });

    it("should allow setting reward setter to zero address", async function () {
      await rewardDistributor.setRewardSetter(rewardSetter.address);

      await expect(rewardDistributor.setRewardSetter(ethers.ZeroAddress))
        .to.emit(rewardDistributor, "RewardSetterUpdated")
        .withArgs(rewardSetter.address, ethers.ZeroAddress);

      expect(await rewardDistributor.rewardSetter()).to.equal(
        ethers.ZeroAddress
      );
    });
  });

  describe("updateMerkleRoots", function () {
    let mockClaims1: Claim[];
    let mockClaims2: Claim[];
    let tree1: StandardMerkleTree<string[]>;
    let tree2: StandardMerkleTree<string[]>;

    beforeEach(async function () {
      // Generate mock claims for two tokens
      mockClaims1 = generateMockClaims(
        users.slice(0, 3).map((u) => u.address),
        ethers.parseEther("100")
      );
      mockClaims2 = generateMockClaims(
        users.slice(0, 3).map((u) => u.address),
        ethers.parseEther("200")
      );

      tree1 = generateMerkleTree(mockClaims1);
      tree2 = generateMerkleTree(mockClaims2);
    });

    it("should allow reward setter to update merkle roots", async function () {
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const roots = [tree1.root, tree2.root];

      await expect(
        rewardDistributor.connect(rewardSetter).updateMerkleRoots(tokens, roots)
      )
        .to.emit(rewardDistributor, "MerkleRootsUpdated")
        .withArgs(tokens, roots);

      expect(
        await rewardDistributor.merkleRoots(await mockERC20.getAddress())
      ).to.equal(tree1.root);
    });

    it("should revert when called by non-reward-setter", async function () {
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const roots = [tree1.root, tree2.root];

      await expect(
        rewardDistributor.connect(otherAccount).updateMerkleRoots(tokens, roots)
      ).to.be.revertedWith("Not reward setter");
    });

    it("should revert when arrays have different lengths", async function () {
      const tokens = [await mockERC20.getAddress()];
      const roots = [tree1.root, tree2.root];

      await expect(
        rewardDistributor.connect(rewardSetter).updateMerkleRoots(tokens, roots)
      ).to.be.revertedWith("Array lengths must match");
    });

    it("should allow updating single token root", async function () {
      const tokens = [await mockERC20.getAddress()];
      const roots = [tree1.root];

      await expect(
        rewardDistributor.connect(rewardSetter).updateMerkleRoots(tokens, roots)
      )
        .to.emit(rewardDistributor, "MerkleRootsUpdated")
        .withArgs(tokens, roots);

      expect(
        await rewardDistributor.merkleRoots(await mockERC20.getAddress())
      ).to.equal(tree1.root);
    });

    it("should allow updating existing root with new value", async function () {
      // First update
      await rewardDistributor
        .connect(rewardSetter)
        .updateMerkleRoots([await mockERC20.getAddress()], [tree1.root]);

      // Generate new claims and tree
      const newClaims = generateMockClaims(
        users.slice(3, 6).map((u) => u.address),
        ethers.parseEther("300")
      );
      const newTree = generateMerkleTree(newClaims);

      // Update with new root
      await expect(
        rewardDistributor
          .connect(rewardSetter)
          .updateMerkleRoots([await mockERC20.getAddress()], [newTree.root])
      ).to.emit(rewardDistributor, "MerkleRootsUpdated");

      expect(
        await rewardDistributor.merkleRoots(await mockERC20.getAddress())
      ).to.equal(newTree.root);
    });

    it("should revert when trying to update with zero address token", async function () {
      await expect(
        rewardDistributor
          .connect(rewardSetter)
          .updateMerkleRoots([ethers.ZeroAddress], [tree1.root])
      ).to.be.revertedWith("Invalid token address");
    });
  });

  describe("claim", function () {
    let tree: StandardMerkleTree<string[]>;
    let claims: Claim[];
    const CLAIM_AMOUNT = ethers.parseEther("100");

    beforeEach(async function () {
      // Generate claims for multiple users
      claims = generateMockClaims(
        users.slice(0, 3).map((u) => u.address),
        CLAIM_AMOUNT
      );

      // Create the merkle tree
      tree = generateMerkleTree(claims);

      // Update merkle root
      await rewardDistributor
        .connect(rewardSetter)
        .updateMerkleRoots([await mockERC20.getAddress()], [tree.root]);
    });

    it("should allow user to claim tokens", async function () {
      const claimer = users[0];
      const claimData = [claimer.address, CLAIM_AMOUNT.toString()];

      // Get proof for the specific claim
      const proof = tree.getProof(claimData);

      const balanceBefore = await mockERC20.balanceOf(claimer.address);

      // Make the claim
      await expect(
        rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, proof)
      )
        .to.emit(rewardDistributor, "RewardsClaimed")
        .withArgs(claimer.address, await mockERC20.getAddress(), CLAIM_AMOUNT);

      const balanceAfter = await mockERC20.balanceOf(claimer.address);
      expect(balanceAfter - balanceBefore).to.equal(CLAIM_AMOUNT);
    });

    it("should allow multiple users to claim their tokens", async function () {
      for (let i = 0; i < 3; i++) {
        const claimer = users[i];
        const proof = tree.getProof([claimer.address, CLAIM_AMOUNT.toString()]);
        const balanceBefore = await mockERC20.balanceOf(claimer.address);

        await rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, proof);

        const balanceAfter = await mockERC20.balanceOf(claimer.address);
        expect(balanceAfter - balanceBefore).to.equal(CLAIM_AMOUNT);
      }
    });

    it("should revert when claiming with invalid proof", async function () {
      const claimer = users[0];
      const invalidProof = tree.getProof([
        users[1].address,
        CLAIM_AMOUNT.toString(),
      ]);

      await expect(
        rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, invalidProof)
      ).to.be.revertedWith("Invalid merkle proof");
    });

    it("should revert when claiming with invalid amount", async function () {
      const claimer = users[0];
      const invalidAmount = CLAIM_AMOUNT + 1n;
      const proof = tree.getProof([claimer.address, CLAIM_AMOUNT.toString()]);

      await expect(
        rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), invalidAmount, proof)
      ).to.be.revertedWith("Invalid merkle proof");
    });

    it("should revert when claiming twice", async function () {
      const claimer = users[0];
      const proof = tree.getProof([claimer.address, CLAIM_AMOUNT.toString()]);

      // First claim
      await rewardDistributor
        .connect(claimer)
        .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, proof);

      // Second claim
      await expect(
        rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, proof)
      ).to.be.revertedWith("Already claimed");
    });

    it("should revert when contract has insufficient balance", async function () {
      // Drain contract balance
      await rewardDistributor
        .connect(owner)
        .recoverERC20(await mockERC20.getAddress(), DISTRIBUTOR_AMOUNT);

      const claimer = users[0];
      const proof = tree.getProof([claimer.address, CLAIM_AMOUNT.toString()]);

      await expect(
        rewardDistributor
          .connect(claimer)
          .claim(await mockERC20.getAddress(), CLAIM_AMOUNT, proof)
      ).to.be.reverted;
    });
  });

  describe("multiClaim", function () {
    let tree1: StandardMerkleTree<string[]>;
    let tree2: StandardMerkleTree<string[]>;
    let claims1: Claim[];
    let claims2: Claim[];
    const CLAIM_AMOUNT_1 = ethers.parseEther("100");
    const CLAIM_AMOUNT_2 = ethers.parseEther("200");

    beforeEach(async function () {
      // Generate claims for both tokens
      claims1 = generateMockClaims(
        users.slice(0, 3).map((u) => u.address),
        CLAIM_AMOUNT_1
      );
      claims2 = generateMockClaims(
        users.slice(0, 3).map((u) => u.address),
        CLAIM_AMOUNT_2
      );

      // Create merkle trees
      tree1 = generateMerkleTree(claims1);
      tree2 = generateMerkleTree(claims2);

      // Update merkle roots
      await rewardDistributor
        .connect(rewardSetter)
        .updateMerkleRoots(
          [await mockERC20.getAddress(), await mock2ERC20.getAddress()],
          [tree1.root, tree2.root]
        );
    });

    it("should allow user to claim multiple tokens at once", async function () {
      const claimer = users[0];
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const amounts = [CLAIM_AMOUNT_1, CLAIM_AMOUNT_2];
      const proofs = [
        tree1.getProof([claimer.address, CLAIM_AMOUNT_1.toString()]),
        tree2.getProof([claimer.address, CLAIM_AMOUNT_2.toString()]),
      ];

      const balanceBefore = await mockERC20.balanceOf(claimer.address);
      const balance2Before = await mock2ERC20.balanceOf(claimer.address);

      await expect(
        rewardDistributor.connect(claimer).multiClaim(tokens, amounts, proofs)
      )
        .to.emit(rewardDistributor, "RewardsClaimed")
        .withArgs(claimer.address, tokens[0], amounts[0])
        .to.emit(rewardDistributor, "RewardsClaimed")
        .withArgs(claimer.address, tokens[1], amounts[1]);

      const balanceAfter = await mockERC20.balanceOf(claimer.address);
      const balance2After = await mock2ERC20.balanceOf(claimer.address);

      expect(balanceAfter - balanceBefore).to.equal(CLAIM_AMOUNT_1);
      expect(balance2After - balance2Before).to.equal(CLAIM_AMOUNT_2);
    });

    it("should revert if arrays have different lengths", async function () {
      const claimer = users[0];
      const tokens = [await mockERC20.getAddress()];
      const amounts = [CLAIM_AMOUNT_1, CLAIM_AMOUNT_2];
      const proofs = [
        tree1.getProof([claimer.address, CLAIM_AMOUNT_1.toString()]),
      ];

      await expect(
        rewardDistributor.connect(claimer).multiClaim(tokens, amounts, proofs)
      ).to.be.revertedWith("Array lengths must match");
    });

    it("should revert if any single claim would fail", async function () {
      const claimer = users[0];
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const amounts = [CLAIM_AMOUNT_1, CLAIM_AMOUNT_2];
      const proofs = [
        tree1.getProof([claimer.address, CLAIM_AMOUNT_1.toString()]),
        tree2.getProof([users[1].address, CLAIM_AMOUNT_2.toString()]), // Invalid proof
      ];

      await expect(
        rewardDistributor.connect(claimer).multiClaim(tokens, amounts, proofs)
      ).to.be.revertedWith("Invalid merkle proof");
    });

    it("should revert if trying to claim already claimed tokens", async function () {
      const claimer = users[0];
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const amounts = [CLAIM_AMOUNT_1, CLAIM_AMOUNT_2];
      const proofs = [
        tree1.getProof([claimer.address, CLAIM_AMOUNT_1.toString()]),
        tree2.getProof([claimer.address, CLAIM_AMOUNT_2.toString()]),
      ];

      // First claim
      await rewardDistributor
        .connect(claimer)
        .multiClaim(tokens, amounts, proofs);

      // Second claim
      await expect(
        rewardDistributor.connect(claimer).multiClaim(tokens, amounts, proofs)
      ).to.be.revertedWith("Already claimed");
    });

    it("should revert if contract has insufficient balance for any token", async function () {
      // Drain first token balance
      await rewardDistributor
        .connect(owner)
        .recoverERC20(await mockERC20.getAddress(), DISTRIBUTOR_AMOUNT);

      const claimer = users[0];
      const tokens = [
        await mockERC20.getAddress(),
        await mock2ERC20.getAddress(),
      ];
      const amounts = [CLAIM_AMOUNT_1, CLAIM_AMOUNT_2];
      const proofs = [
        tree1.getProof([claimer.address, CLAIM_AMOUNT_1.toString()]),
        tree2.getProof([claimer.address, CLAIM_AMOUNT_2.toString()]),
      ];

      await expect(
        rewardDistributor.connect(claimer).multiClaim(tokens, amounts, proofs)
      ).to.be.reverted;
    });

    it("should handle empty arrays", async function () {
      await expect(rewardDistributor.connect(users[0]).multiClaim([], [], []))
        .to.not.be.reverted;
    });
  });
});
