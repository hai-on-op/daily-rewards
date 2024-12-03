// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRewardDistributor {
    /// @notice Emitted when a new reward setter is set
    event RewardSetterUpdated(
        address indexed oldSetter,
        address indexed newSetter
    );

    /// @notice Emitted when merkle roots are updated
    event MerkleRootsUpdated(address[] tokens, bytes32[] roots);

    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    /// @notice Returns the address that can set merkle roots
    function rewardSetter() external view returns (address);

    /// @notice Returns the merkle root for a token
    function merkleRoots(address token) external view returns (bytes32);

    /// @notice Returns whether a reward has been claimed
    function isClaimed(
        bytes32 root,
        address user
    ) external view returns (bool);

    /// @notice Sets the address that can update merkle roots
    /// @param newRewardSetter The new address that can set merkle roots
    function setRewardSetter(address newRewardSetter) external;

    /// @notice Updates merkle roots for multiple tokens in a single transaction
    /// @param tokens Array of token addresses
    /// @param roots Array of merkle roots corresponding to each token
    function updateMerkleRoots(
        address[] calldata tokens,
        bytes32[] calldata roots
    ) external;

    /// @notice Allows users to claim their rewards
    /// @param token The reward token address
    /// @param amount Amount of tokens to claim
    /// @param merkleProof Proof of inclusion in merkle tree
    function claim(
        address token,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external;

    /// @notice Allows users to claim rewards for multiple tokens in a single transaction
    /// @param tokens Array of token addresses
    /// @param amounts Array of amounts to claim
    /// @param merkleProofs Array of merkle proofs
    function multiClaim(
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[][] calldata merkleProofs
    ) external;

    /// @notice Allows owner to recover any ERC20 tokens sent to the contract by mistake
    /// @param token The token address to recover
    /// @param amount Amount to recover
    function recoverERC20(address token, uint256 amount) external;
}
