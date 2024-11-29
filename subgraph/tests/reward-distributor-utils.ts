import { newMockEvent } from "matchstick-as"
import { ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts"
import {
  MerkleRootsUpdated,
  OwnershipTransferred,
  RewardSetterUpdated,
  RewardsClaimed
} from "../generated/REWARD_DISTRIBUTOR/REWARD_DISTRIBUTOR"

export function createMerkleRootsUpdatedEvent(
  tokens: Array<Address>,
  roots: Array<Bytes>
): MerkleRootsUpdated {
  let merkleRootsUpdatedEvent = changetype<MerkleRootsUpdated>(newMockEvent())

  merkleRootsUpdatedEvent.parameters = new Array()

  merkleRootsUpdatedEvent.parameters.push(
    new ethereum.EventParam("tokens", ethereum.Value.fromAddressArray(tokens))
  )
  merkleRootsUpdatedEvent.parameters.push(
    new ethereum.EventParam("roots", ethereum.Value.fromFixedBytesArray(roots))
  )

  return merkleRootsUpdatedEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent = changetype<OwnershipTransferred>(
    newMockEvent()
  )

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createRewardSetterUpdatedEvent(
  oldSetter: Address,
  newSetter: Address
): RewardSetterUpdated {
  let rewardSetterUpdatedEvent = changetype<RewardSetterUpdated>(newMockEvent())

  rewardSetterUpdatedEvent.parameters = new Array()

  rewardSetterUpdatedEvent.parameters.push(
    new ethereum.EventParam("oldSetter", ethereum.Value.fromAddress(oldSetter))
  )
  rewardSetterUpdatedEvent.parameters.push(
    new ethereum.EventParam("newSetter", ethereum.Value.fromAddress(newSetter))
  )

  return rewardSetterUpdatedEvent
}

export function createRewardsClaimedEvent(
  user: Address,
  token: Address,
  amount: BigInt
): RewardsClaimed {
  let rewardsClaimedEvent = changetype<RewardsClaimed>(newMockEvent())

  rewardsClaimedEvent.parameters = new Array()

  rewardsClaimedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  rewardsClaimedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  rewardsClaimedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return rewardsClaimedEvent
}
