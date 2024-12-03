import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  MerkleRootsUpdated,
  OwnershipTransferred,
  RewardSetterUpdated,
  RewardsClaimed,
} from "../generated/REWARD_DISTRIBUTOR/REWARD_DISTRIBUTOR";
import {
  RewardDistributor,
  MerkleRoot,
  Claim,
  User,
  TokenClaim,
} from "../generated/schema";
import { log } from "@graphprotocol/graph-ts";

function getOrCreateRewardDistributor(address: Bytes): RewardDistributor {
  let distributor = RewardDistributor.load(address.toHexString());
  if (!distributor) {
    distributor = new RewardDistributor(address.toHexString());
    distributor.rewardSetter = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000"
    );
    distributor.save();
  }
  return distributor;
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

function getOrCreateUser(address: Bytes): User {
  let user = User.load(address.toHexString());
  if (!user) {
    user = new User(address.toHexString());
    user.save();
  }
  return user;
}

function getOrCreateTokenClaim(user: Bytes, token: Bytes): TokenClaim {
  const id = user.toHexString() + "-" + token.toHexString();
  let tokenClaim = TokenClaim.load(id);
  if (!tokenClaim) {
    tokenClaim = new TokenClaim(id);
    tokenClaim.user = user.toHexString();
    tokenClaim.token = token;
    tokenClaim.totalAmount = BigInt.fromI32(0);
    tokenClaim.claimCount = BigInt.fromI32(0);
    tokenClaim.save();
  }
  return tokenClaim;
}

export function handleMerkleRootsUpdated(event: MerkleRootsUpdated): void {
  const distributor = getOrCreateRewardDistributor(event.address);


  // Update merkle roots for each token
  for (let i = 0; i < event.params.tokens.length; i++) {
    const token = event.params.tokens[i];
    const root = event.params.roots[i];

    const merkleRoot = new MerkleRoot(token.toHexString());
    merkleRoot.distributor = distributor.id;
    merkleRoot.token = token;
    merkleRoot.root = root;
    merkleRoot.updatedAt = event.block.timestamp;
    merkleRoot.updatedAtBlock = event.block.number;
    merkleRoot.updatedAtTransaction = event.transaction.hash;
    merkleRoot.save();
  }
}

export function handleRewardSetterUpdated(event: RewardSetterUpdated): void {
  log.debug("Reward setter updated to {}", [event.params.newSetter.toHexString()]);

  const distributor = getOrCreateRewardDistributor(event.address);
  distributor.rewardSetter = event.params.newSetter;
  distributor.save();
}

export function handleRewardsClaimed(event: RewardsClaimed): void {
  const distributor = getOrCreateRewardDistributor(event.address);
  const user = getOrCreateUser(event.params.user);
  const tokenClaim = getOrCreateTokenClaim(
    event.params.user,
    event.params.token
  );

  // Create new claim
  const claimId =
    event.params.user.toHexString() +
    "-" +
    event.params.token.toHexString() +
    "-" +
    event.block.timestamp.toString();

  const claim = new Claim(claimId);
  claim.distributor = distributor.id;
  claim.user = user.id;
  claim.token = event.params.token;
  claim.amount = event.params.amount;
  claim.claimedAt = event.block.timestamp;
  claim.claimedAtBlock = event.block.number;
  claim.claimedAtTransaction = event.transaction.hash;
  claim.save();

  // Update token claim totals
  tokenClaim.totalAmount = tokenClaim.totalAmount.plus(event.params.amount);
  tokenClaim.claimCount = tokenClaim.claimCount.plus(BigInt.fromI32(1));
  tokenClaim.save();
}
