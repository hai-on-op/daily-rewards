import { ethers } from "hardhat";

const INITIAL_MINT_AMOUNT = ethers.parseEther("1000000"); // 1M tokens
const ETHER_AMOUNT = ethers.parseEther("10"); // 10 ETH
const REWARD_SETTER_ADDRESS = "0x050c1853645f18AB50d5dF34475191493Eba9aa7";

async function main() {
  console.log("Starting test setup...");

  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy RewardDistributor
  const RewardDistributor = await ethers.getContractFactory(
    "RewardDistributor"
  );
  const rewardDistributor = await RewardDistributor.deploy(29.5 * 60);
  await rewardDistributor.waitForDeployment();
  console.log(
    "RewardDistributor deployed to:",
    await rewardDistributor.getAddress()
  );

  // Deploy Mock Tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockKITE = await MockERC20.deploy("Kite Token", "KITE");
  const mockOP = await MockERC20.deploy("Optimism", "OP");
  await mockKITE.waitForDeployment();
  await mockOP.waitForDeployment();
  console.log("MockKITE deployed to:", await mockKITE.getAddress());
  console.log("MockOP deployed to:", await mockOP.getAddress());

  // Set reward setter to the specified address
  const rewardSetterTx = await rewardDistributor.setRewardSetter(
    REWARD_SETTER_ADDRESS
  );
  await rewardSetterTx.wait();
  console.log("Reward setter set to:", REWARD_SETTER_ADDRESS);

  // Mint tokens to RewardDistributor
  const mintKiteTx = await mockKITE.mint(
    await rewardDistributor.getAddress(),
    INITIAL_MINT_AMOUNT
  );
  await mintKiteTx.wait();
  console.log(
    "Minted KITE tokens to RewardDistributor:",
    ethers.formatEther(INITIAL_MINT_AMOUNT)
  );

  const mintOpTx = await mockOP.mint(
    await rewardDistributor.getAddress(),
    INITIAL_MINT_AMOUNT
  );
  await mintOpTx.wait();
  console.log(
    "Minted OP tokens to RewardDistributor:",
    ethers.formatEther(INITIAL_MINT_AMOUNT)
  );

  // Send ETH to reward setter address
  const sendEthTx = await deployer.sendTransaction({
    to: REWARD_SETTER_ADDRESS,
    value: ETHER_AMOUNT,
  });
  await sendEthTx.wait();
  console.log("Sent ETH to reward setter:", ethers.formatEther(ETHER_AMOUNT));

  // Log final balances
  const kiteBalance = await mockKITE.balanceOf(
    await rewardDistributor.getAddress()
  );
  const opBalance = await mockOP.balanceOf(
    await rewardDistributor.getAddress()
  );
  const rewardSetterBalance = await ethers.provider.getBalance(
    REWARD_SETTER_ADDRESS
  );

  console.log("\nFinal Balances:");
  console.log(
    "RewardDistributor KITE Balance:",
    ethers.formatEther(kiteBalance)
  );
  console.log("RewardDistributor OP Balance:", ethers.formatEther(opBalance));
  console.log(
    "Reward Setter ETH Balance:",
    ethers.formatEther(rewardSetterBalance)
  );

  // Log all addresses for easy reference
  console.log("\nDeployed Addresses:");
  console.log({
    rewardDistributor: await rewardDistributor.getAddress(),
    mockKITE: await mockKITE.getAddress(),
    mockOP: await mockOP.getAddress(),
    rewardSetter: REWARD_SETTER_ADDRESS,
  });
}

async function deployRewardDistributor() {
  const RewardDistributor = await ethers.getContractFactory(
    "RewardDistributor"
  );
  const signer = await ethers.getSigners();
  const rewardDistributor = new ethers.Contract(
    "0x786594B1b10b7a8996dFD11096dB13B56bec4869",
    RewardDistributor.interface,
    signer[0]
  ); //await RewardDistributor.deploy();

  console.log(
    await rewardDistributor.merkleRoots(
      "0x47c6ae06686D35DD7656bE6AF3091Fcd626bbB2f"
    ),
    "Merkle Root"
  );

  //const rewardDistributor = await RewardDistributor.deploy(29.5 * 60);

  //console.log(await rewardDistributor.getAddress());
  //
  //const rewardSetterTx = await rewardDistributor.setRewardSetter(
  //  REWARD_SETTER_ADDRESS
  //);
  //await rewardSetterTx.wait();
  //console.log("Reward setter set to:", REWARD_SETTER_ADDRESS);

  /*const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockOP = await MockERC20.deploy("Mock OP", "OP");
  const mockDinero = await MockERC20.deploy("MOCK DINERO", "DINERO");
  await mockOP.waitForDeployment();
  await mockDinero.waitForDeployment();

  console.log("MockOP deployed to:", await mockOP.getAddress());
  console.log("MockDinero deployed to:", await mockDinero.getAddress());

  const mintDineroTx = await mockDinero.mint(
    "0x4A87a2A017Be7feA0F37f03F3379d43665486Ff8",
    INITIAL_MINT_AMOUNT
  );
  await mintDineroTx.wait();
  console.log(
    "Minted DINERO tokens to RewardDistributor:",
    ethers.formatEther(INITIAL_MINT_AMOUNT)
  );

  const mintOpTx = await mockOP.mint(
    "0x4A87a2A017Be7feA0F37f03F3379d43665486Ff8",
    INITIAL_MINT_AMOUNT
  );
  await mintOpTx.wait();
  console.log(
    "Minted OP tokens to RewardDistributor:",
    ethers.formatEther(INITIAL_MINT_AMOUNT)
  );*/
}

deployRewardDistributor()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
