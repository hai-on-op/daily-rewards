import fs from "fs";
import path from "path";

export type BoostStrategyId =
  | "haiAERO"
  | "haiVELO"
  | "lpStaking"
  | "lp"
  | "minter";

export interface BoostPolicyRow {
  strategy: BoostStrategyId;
  implementationPath: string;
  positionMetric: string;
  implementedFormula: string;
  usesKiteStake: boolean;
  denominator: string;
  timestampPolicy: string;
  auditQuestion: string;
}

export interface BoostScenarioUser {
  address: string;
  positionWeight: number;
  kiteShare: number;
  allLpLiquidity?: number;
}

export interface BoostScenario {
  id: string;
  title: string;
  description: string;
  strategies: BoostStrategyId[];
  users: BoostScenarioUser[];
}

export interface BoostScenarioUserResult {
  address: string;
  positionWeight: number;
  kiteShare: number;
  implementedBoost: number;
  docsFormulaBoost: number;
  implementedRewardShare: number;
  docsFormulaRewardShare: number;
  implementedEffectiveWeight: number;
  docsFormulaEffectiveWeight: number;
}

export interface BoostScenarioResult {
  scenarioId: string;
  strategy: BoostStrategyId;
  totalImplementedEffectiveWeight: number;
  totalDocsFormulaEffectiveWeight: number;
  users: BoostScenarioUserResult[];
}

export interface BoostFinding {
  severity: "high" | "medium" | "low";
  title: string;
  evidence: string;
  recommendation: string;
}

export interface BoostAuditBundle {
  generatedAt: string;
  policyMatrix: BoostPolicyRow[];
  scenarios: BoostScenario[];
  scenarioResults: BoostScenarioResult[];
  findings: BoostFinding[];
}

const BOOST_CAP = 2;

export function kiteShareBoost(kiteShare: number, positionShare: number): number {
  if (positionShare <= 0) return 1;
  return Math.min(kiteShare / positionShare + 1, BOOST_CAP);
}

export function minterCurrentBoost(userDebt: number, totalDebt: number): number {
  if (userDebt <= 0 || totalDebt <= 0) return 1;
  return Math.min(userDebt / totalDebt + 1, BOOST_CAP);
}

function rewardShare(effectiveWeight: number, totalEffectiveWeight: number): number {
  return totalEffectiveWeight > 0 ? effectiveWeight / totalEffectiveWeight : 0;
}

export function getBoostPolicyMatrix(): BoostPolicyRow[] {
  return [
    {
      strategy: "haiAERO",
      implementationPath: "src/core/rewards/strategies/HaiAeroStrategy.ts",
      positionMetric: "haiAERO collateral",
      implementedFormula: "min(kiteShare / collateralShare + 1, 2)",
      usesKiteStake: true,
      denominator: "sum of active haiAERO collateral",
      timestampPolicy: "Recomputed when TimeWeightedDistributor asks calculateBoosts().",
      auditQuestion: "Confirm haiAERO boost should be based on collateral share and stKITE share.",
    },
    {
      strategy: "haiVELO",
      implementationPath: "src/core/rewards/strategies/HaiVeloStrategy.ts",
      positionMetric: "haiVELO collateral + staked LP converted to haiVELO-equivalent",
      implementedFormula: "min(kiteShare / haiVeloWeightShare + 1, 2)",
      usesKiteStake: true,
      denominator: "sum of active haiVELO-equivalent weight",
      timestampPolicy: "Recomputed when TimeWeightedDistributor asks calculateBoosts().",
      auditQuestion: "Confirm LP-to-haiVELO conversion and stKITE share should be combined this way.",
    },
    {
      strategy: "lpStaking",
      implementationPath: "src/core/rewards/strategies/LpStakingStrategy.ts",
      positionMetric: "staked LP token amount",
      implementedFormula: "min(kiteShare / lpStakeShare + 1, 2)",
      usesKiteStake: true,
      denominator: "sum of active LP staking balance for that staking type",
      timestampPolicy: "Recomputed when TimeWeightedDistributor asks calculateBoosts().",
      auditQuestion: "Confirm each LP staking pool should have an independent boost denominator.",
    },
    {
      strategy: "lp",
      implementationPath: "src/core/rewards/strategies/LpStrategy.ts",
      positionMetric: "full-range Uniswap V3 LP liquidity",
      implementedFormula: "min(kiteShare / (fullRangeLiquidity / allLiquidity) + 1, 2)",
      usesKiteStake: true,
      denominator: "all LP position liquidity, including non-full-range positions",
      timestampPolicy: "Recomputed when TimeWeightedDistributor asks calculateBoosts().",
      auditQuestion: "Confirm the boost denominator should include non-full-range liquidity even though rewards use only full-range liquidity.",
    },
    {
      strategy: "minter",
      implementationPath: "src/core/rewards/strategies/MinterStrategy.ts",
      positionMetric: "SAFE debt",
      implementedFormula: "min(debtShare + 1, 2)",
      usesKiteStake: false,
      denominator: "sum of active debt for the collateral type",
      timestampPolicy: "Cached by timestamp and recalculated on strategy events.",
      auditQuestion: "Confirm whether minter boost should ignore stKITE. This differs from the repo docs' general KITE boost formula.",
    },
  ];
}

export function getBoostScenarios(): BoostScenario[] {
  return [
    {
      id: "equal-position-no-kite",
      title: "Equal positions with no KITE",
      description: "All users have position weight but no staked KITE. KITE-share strategies should fall back to 1x.",
      strategies: ["haiAERO", "haiVELO", "lpStaking", "lp"],
      users: [
        { address: "0xalice", positionWeight: 100, kiteShare: 0 },
        { address: "0xbob", positionWeight: 100, kiteShare: 0 },
      ],
    },
    {
      id: "overstaked-small-position",
      title: "Small position with large KITE share",
      description: "A user with a small position and large KITE share should hit the 2x cap.",
      strategies: ["haiAERO", "haiVELO", "lpStaking"],
      users: [
        { address: "0xalice", positionWeight: 10, kiteShare: 0.5 },
        { address: "0xbob", positionWeight: 90, kiteShare: 0.5 },
      ],
    },
    {
      id: "kite-with-zero-position",
      title: "KITE staked but no reward position",
      description: "A user with staked KITE but no position receives no reward because effective weight remains zero.",
      strategies: ["haiAERO", "haiVELO", "lpStaking"],
      users: [
        { address: "0xalice", positionWeight: 100, kiteShare: 0.2 },
        { address: "0xbob", positionWeight: 100, kiteShare: 0.6 },
        { address: "0xcarol", positionWeight: 0, kiteShare: 0.2 },
      ],
    },
    {
      id: "minter-kite-mismatch",
      title: "Minter current formula versus KITE-share formula",
      description: "Current minter boost follows debt share, so KITE allocation does not change minter boosts.",
      strategies: ["minter"],
      users: [
        { address: "0xalice", positionWeight: 300, kiteShare: 0 },
        { address: "0xbob", positionWeight: 100, kiteShare: 1 },
      ],
    },
    {
      id: "lp-denominator-mismatch",
      title: "LP full-range rewards with non-full-range liquidity in denominator",
      description: "Current LP boost divides full-range reward weight by all LP liquidity, including non-full-range liquidity.",
      strategies: ["lp"],
      users: [
        { address: "0xalice", positionWeight: 100, allLpLiquidity: 100, kiteShare: 0.05 },
        { address: "0xbob", positionWeight: 100, allLpLiquidity: 1000, kiteShare: 0.95 },
      ],
    },
  ];
}

function docsFormulaBoostForUser(
  user: BoostScenarioUser,
  totalPositionWeight: number
): number {
  return kiteShareBoost(
    user.kiteShare,
    totalPositionWeight > 0 ? user.positionWeight / totalPositionWeight : 0
  );
}

function implementedBoostForUser(
  strategy: BoostStrategyId,
  user: BoostScenarioUser,
  users: BoostScenarioUser[]
): number {
  const totalPositionWeight = users.reduce((sum, item) => sum + item.positionWeight, 0);

  if (strategy === "minter") {
    return minterCurrentBoost(user.positionWeight, totalPositionWeight);
  }

  if (strategy === "lp") {
    const totalAllLpLiquidity = users.reduce(
      (sum, item) => sum + (item.allLpLiquidity ?? item.positionWeight),
      0
    );
    return kiteShareBoost(
      user.kiteShare,
      totalAllLpLiquidity > 0 ? user.positionWeight / totalAllLpLiquidity : 0
    );
  }

  return docsFormulaBoostForUser(user, totalPositionWeight);
}

export function evaluateScenario(
  strategy: BoostStrategyId,
  scenario: BoostScenario
): BoostScenarioResult {
  const totalPositionWeight = scenario.users.reduce(
    (sum, user) => sum + user.positionWeight,
    0
  );
  const users = scenario.users.map((user) => {
    const implementedBoost = implementedBoostForUser(strategy, user, scenario.users);
    const docsFormulaBoost = docsFormulaBoostForUser(user, totalPositionWeight);
    const implementedEffectiveWeight = user.positionWeight * implementedBoost;
    const docsFormulaEffectiveWeight = user.positionWeight * docsFormulaBoost;
    return {
      address: user.address,
      positionWeight: user.positionWeight,
      kiteShare: user.kiteShare,
      implementedBoost,
      docsFormulaBoost,
      implementedRewardShare: 0,
      docsFormulaRewardShare: 0,
      implementedEffectiveWeight,
      docsFormulaEffectiveWeight,
    };
  });

  const totalImplementedEffectiveWeight = users.reduce(
    (sum, user) => sum + user.implementedEffectiveWeight,
    0
  );
  const totalDocsFormulaEffectiveWeight = users.reduce(
    (sum, user) => sum + user.docsFormulaEffectiveWeight,
    0
  );

  return {
    scenarioId: scenario.id,
    strategy,
    totalImplementedEffectiveWeight,
    totalDocsFormulaEffectiveWeight,
    users: users.map((user) => ({
      ...user,
      implementedRewardShare: rewardShare(
        user.implementedEffectiveWeight,
        totalImplementedEffectiveWeight
      ),
      docsFormulaRewardShare: rewardShare(
        user.docsFormulaEffectiveWeight,
        totalDocsFormulaEffectiveWeight
      ),
    })),
  };
}

export function buildBoostAuditBundle(date: Date = new Date()): BoostAuditBundle {
  const scenarios = getBoostScenarios();
  return {
    generatedAt: date.toISOString(),
    policyMatrix: getBoostPolicyMatrix(),
    scenarios,
    scenarioResults: scenarios.flatMap((scenario) =>
      scenario.strategies.map((strategy) => evaluateScenario(strategy, scenario))
    ),
    findings: [
      {
        severity: "high",
        title: "Minter boost ignores stKITE",
        evidence:
          "MinterStrategy.calculateBoosts uses min(debtShare + 1, 2), while the architecture doc says the general boost formula uses user KITE share divided by user position share.",
        recommendation:
          "Confirm intended minter policy. If minter should use KITE staking, replace the debt-share boost and backtest historical minter KITE distributions.",
      },
      {
        severity: "medium",
        title: "LP boost denominator includes non-full-range liquidity",
        evidence:
          "LpStrategy rewards full-range liquidity, but its boost denominator sums all LP liquidity before dividing the full-range user weight.",
        recommendation:
          "Confirm whether non-full-range liquidity should dilute the LP boost denominator. If not, denominator should match reward-eligible full-range weight.",
      },
      {
        severity: "medium",
        title: "KITE stake changes are not strategy events",
        evidence:
          "TimeWeightedDistributor recalculates boosts at strategy event timestamps. stKITE stake and withdraw events are read by calculateBoosts, but they are not inserted into the strategy event stream.",
        recommendation:
          "Confirm whether boost changes should take effect immediately at stKITE event timestamps. If yes, add KITE staking events to the distribution timeline.",
      },
      {
        severity: "high",
        title: "Boost denominator and credit boost can come from different times",
        evidence:
          "TimeWeightedDistributor advances rewardPerWeight using the prior total boosted weight, then recalculates boosts at the event timestamp before crediting users for the elapsed interval.",
        recommendation:
          "Confirm intended timing. If boosts can change between strategy events, credit elapsed rewards with the same boost set used in the denominator, then recalculate boosts for the next interval.",
      },
      {
        severity: "medium",
        title: "Final interval uses the last strategy-event timestamp for boost lookup",
        evidence:
          "The final credit path calls calculateBoosts(users, timestamp), where timestamp is still the last processed strategy event timestamp.",
        recommendation:
          "Confirm whether the final interval should use endTimestamp for boost lookup, especially when KITE staking changes after the last strategy event.",
      },
    ],
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

export function renderPolicyMatrixMarkdown(bundle: BoostAuditBundle): string {
  const rows = bundle.policyMatrix
    .map((row) =>
      `| ${row.strategy} | ${row.positionMetric} | ${row.implementedFormula} | ${row.usesKiteStake ? "yes" : "no"} | ${row.denominator} | ${row.auditQuestion} |`
    )
    .join("\n");

  return `# Boost Policy Matrix

Generated at: ${bundle.generatedAt}

This matrix is extracted from the current implementation. It is not an approval of the policy.

| Strategy | Position metric | Implemented formula | Uses stKITE | Denominator | Audit question |
|---|---|---|---|---|---|
${rows}
`;
}

export function renderAuditReportMarkdown(bundle: BoostAuditBundle): string {
  const findings = bundle.findings
    .map(
      (finding) => `## ${finding.severity.toUpperCase()}: ${finding.title}

Evidence: ${finding.evidence}

Recommendation: ${finding.recommendation}
`
    )
    .join("\n");

  const scenarioSummaries = bundle.scenarioResults
    .map((result) => {
      const users = result.users
        .map(
          (user) =>
            `- ${user.address}: boost=${formatNumber(user.implementedBoost)}, docsFormulaBoost=${formatNumber(user.docsFormulaBoost)}, rewardShare=${formatPercent(user.implementedRewardShare)}, docsFormulaShare=${formatPercent(user.docsFormulaRewardShare)}`
        )
        .join("\n");
      return `## ${result.scenarioId} / ${result.strategy}

${users}
`;
    })
    .join("\n");

  return `# Boost Audit Report

Generated at: ${bundle.generatedAt}

This report documents current boost behavior and highlights places where the implementation needs policy confirmation.

# Findings

${findings}

# Deterministic Scenario Results

${scenarioSummaries}
`;
}

export function writeBoostAuditBundle(outputRoot: string, bundle: BoostAuditBundle): string {
  const runId = bundle.generatedAt.replace(/[:.]/g, "-");
  const outputDir = path.join(outputRoot, `boost-audit-${runId}`);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "boost-policy-matrix.md"),
    renderPolicyMatrixMarkdown(bundle)
  );
  fs.writeFileSync(
    path.join(outputDir, "boost-scenarios.json"),
    JSON.stringify(
      {
        generatedAt: bundle.generatedAt,
        scenarios: bundle.scenarios,
        scenarioResults: bundle.scenarioResults,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(outputDir, "boost-audit-report.md"),
    renderAuditReportMarkdown(bundle)
  );
  fs.writeFileSync(
    path.join(outputDir, "boost-audit-bundle.json"),
    JSON.stringify(bundle, null, 2)
  );

  return outputDir;
}
