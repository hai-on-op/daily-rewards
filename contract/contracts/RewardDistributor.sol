// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IRewardDistributor.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract RewardDistributor is IRewardDistributor, Ownable {
    uint256 public merkleRootCounter;

    // Duration in seconds
    uint256 public duration;

    uint256 public lastSettedMerkleRoot;

    address public rewardSetter;
    mapping(address => bytes32) public merkleRoots;

    // merkleRoot => UserAddress => IsClaimed
    mapping(bytes32 => mapping(address => bool)) public isClaimed;

    constructor(uint256 targetDuration) Ownable(msg.sender) {
        setDuration(targetDuration);
        merkleRootCounter = 0;
    }

    function setDuration(uint256 newDuration) public onlyOwner {
        duration = newDuration;
        emit RewardDurationUpdated(newDuration);
    }

    function setRewardSetter(address newRewardSetter) external onlyOwner {
        address oldSetter = rewardSetter;
        rewardSetter = newRewardSetter;
        emit RewardSetterUpdated(oldSetter, newRewardSetter);
    }

    function updateMerkleRoots(
        address[] calldata tokens,
        bytes32[] calldata roots
    ) external {
        require(block.timestamp - lastSettedMerkleRoot > duration, "Too soon");
        require(msg.sender == rewardSetter, "Not reward setter");
        require(tokens.length == roots.length, "Array lengths must match");

        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Invalid token address");
            merkleRoots[tokens[i]] = roots[i];
        }

        lastSettedMerkleRoot = block.timestamp;
        merkleRootCounter++;
        emit MerkleRootsUpdated(tokens, roots, merkleRootCounter);
    }

    function claim(
        address token,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        _claim(token, amount, merkleProof);
    }

    function multiClaim(
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[][] calldata merkleProofs
    ) external {
        require(
            tokens.length == amounts.length &&
                amounts.length == merkleProofs.length,
            "Array lengths must match"
        );

        for (uint256 i = 0; i < tokens.length; i++) {
            _claim(tokens[i], amounts[i], merkleProofs[i]);
        }
    }

    function _claim(
        address token,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) internal {
        require(!isClaimed[merkleRoots[token]][msg.sender], "Already claimed");

        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(address(msg.sender), amount)))
        );
        // (3)
        require(
            MerkleProof.verify(merkleProof, merkleRoots[token], leaf),
            "Invalid merkle proof"
        );
        // Mark as claimed
        isClaimed[merkleRoots[token]][msg.sender] = true;
        //// Transfer tokens
        IERC20(token).transfer(msg.sender, amount);
        //
        emit RewardsClaimed(msg.sender, token, amount);
    }

    function recoverERC20(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Invalid amount");

        IERC20(token).transfer(owner(), amount);
    }
}
