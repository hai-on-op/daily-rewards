const { getEffectiveClaimedAmounts } = require(process.cwd()+"/dist/services/claim-accounting");
  const { config } = require(process.cwd()+"/dist/config");
  const { getTokenAddressMap } = require(process.cwd()+"/dist/modules/orchestrator/contractHelpers");
  const { ethers } = require("ethers");

  const users = [
    "0xf23f999ece302ea646509b51e6c4c19055471ab0",
    "0xf4527a233f669a55922f707c61054fa78bea7402",
  ];

  (async () => {
    const cfg = config();
    const map = getTokenAddressMap(cfg);

    const claims = await getEffectiveClaimedAmounts(map.KITE, users, {
      distributorSubgraphUrl: cfg.DISTRIBUTOR_SUBGRAPH_URL,
      claimAdjustmentsFile: cfg.CLAIM_ADJUSTMENTS_FILE,
      tokenAddressMap: map,
    });

    for (const user of users) {
      console.log(user, ethers.utils.formatEther(claims.get(user) || "0"));
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
