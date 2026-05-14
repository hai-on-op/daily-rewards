/**
 * Generates a static audit bundle for current boost behavior.
 *
 * Usage:
 *   yarn audit:boosts
 *   BOOST_AUDIT_OUTPUT_DIR=/tmp/boost-audit yarn audit:boosts
 */

import path from "path";
import {
  buildBoostAuditBundle,
  writeBoostAuditBundle,
} from "../services/boost-audit/boostAudit";

function main(): void {
  const outputRoot = process.env.BOOST_AUDIT_OUTPUT_DIR
    ? path.resolve(process.env.BOOST_AUDIT_OUTPUT_DIR)
    : path.resolve(process.cwd(), "audit-output");

  const bundle = buildBoostAuditBundle();
  const outputDir = writeBoostAuditBundle(outputRoot, bundle);

  console.log(`Wrote boost audit bundle to ${outputDir}`);
  console.log(`Findings: ${bundle.findings.length}`);
  for (const finding of bundle.findings) {
    console.log(`- ${finding.severity}: ${finding.title}`);
  }
}

if (require.main === module) {
  main();
}
