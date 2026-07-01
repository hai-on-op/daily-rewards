import {
  buildBoostAuditBundle,
  evaluateScenario,
  getBoostScenarios,
  kiteShareBoost,
  minterCurrentBoost,
} from "./boostAudit";

describe("boost audit helpers", () => {
  it("calculates the documented KITE-share boost with a 2x cap", () => {
    expect(kiteShareBoost(0, 0.5)).toBe(1);
    expect(kiteShareBoost(0.5, 0.5)).toBe(2);
    expect(kiteShareBoost(0.5, 0.1)).toBe(2);
    expect(kiteShareBoost(0.05, 0.5)).toBeCloseTo(1.1, 10);
    expect(kiteShareBoost(1, 0)).toBe(1);
  });

  it("documents current minter boost as debt-share based", () => {
    expect(minterCurrentBoost(300, 400)).toBeCloseTo(1.75, 10);
    expect(minterCurrentBoost(100, 400)).toBeCloseTo(1.25, 10);
    expect(minterCurrentBoost(0, 400)).toBe(1);
  });

  it("surfaces the minter difference versus the docs KITE-share formula", () => {
    const scenario = getBoostScenarios().find(
      (item) => item.id === "minter-kite-mismatch"
    );
    expect(scenario).toBeDefined();

    const result = evaluateScenario("minter", scenario!);
    const alice = result.users.find((user) => user.address === "0xalice")!;
    const bob = result.users.find((user) => user.address === "0xbob")!;

    expect(alice.implementedBoost).toBeCloseTo(1.75, 10);
    expect(alice.docsFormulaBoost).toBe(1);
    expect(bob.implementedBoost).toBeCloseTo(1.25, 10);
    expect(bob.docsFormulaBoost).toBe(2);
  });

  it("surfaces the LP denominator difference versus the docs KITE-share formula", () => {
    const scenario = getBoostScenarios().find(
      (item) => item.id === "lp-denominator-mismatch"
    );
    expect(scenario).toBeDefined();

    const result = evaluateScenario("lp", scenario!);
    const alice = result.users.find((user) => user.address === "0xalice")!;

    expect(alice.implementedBoost).toBeCloseTo(1.55, 10);
    expect(alice.docsFormulaBoost).toBeCloseTo(1.1, 10);
  });

  it("builds an audit bundle with findings and scenario results", () => {
    const bundle = buildBoostAuditBundle(new Date("2026-05-02T00:00:00.000Z"));

    expect(bundle.policyMatrix).toHaveLength(5);
    expect(bundle.findings.map((finding) => finding.title)).toContain(
      "Minter boost ignores stKITE"
    );
    expect(bundle.scenarioResults.length).toBeGreaterThan(5);
  });
});
