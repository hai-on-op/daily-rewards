/**
 * Simple HTTP API that serves the latest daily reward report.
 *
 * Endpoints:
 *   GET /              → latest full report JSON
 *   GET /health        → { status: "ok", lastReport: <ISO timestamp> }
 *   GET /user/:address → filtered report for a single address
 *
 * Usage:
 *   yarn report-api                  # default port 3100
 *   PORT=8080 yarn report-api        # custom port
 */

import http from "http";
import fs from "fs";
import path from "path";
import { config as dotenv } from "dotenv";
import { buildOpsStatus } from "../services/ops-state";

dotenv();

const HOST = process.env.REPORT_API_HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "3100", 10);
const REPORT_PATH = path.join(process.cwd(), "reports", "latest-report.json");

function readReport(): { data: any; error?: string } {
  if (!fs.existsSync(REPORT_PATH)) {
    return { data: null, error: "No report found. Run `yarn daily-report` first." };
  }
  const raw = fs.readFileSync(REPORT_PATH, "utf-8");
  return { data: JSON.parse(raw) };
}

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health") {
    const { data, error } = readReport();
    if (error) {
      return jsonResponse(res, 503, { status: "no_report", error });
    }
    return jsonResponse(res, 200, {
      status: "ok",
      generatedAt: data.generatedAt,
      periodDays: data.periodDays,
      totalDaysWithData: data.totalDaysWithData,
      totalUsers: data.users?.length ?? 0,
    });
  }

  // Operational automation status
  if (pathname === "/ops/status") {
    try {
      const status = await buildOpsStatus();
      return jsonResponse(res, 200, status);
    } catch (error) {
      return jsonResponse(res, 500, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Full report
  if (pathname === "/") {
    const { data, error } = readReport();
    if (error) {
      return jsonResponse(res, 404, { error });
    }
    return jsonResponse(res, 200, data);
  }

  // Single user report
  const userMatch = pathname.match(/^\/user\/(0x[a-fA-F0-9]{40})$/);
  if (userMatch) {
    const address = userMatch[1].toLowerCase();
    const { data, error } = readReport();
    if (error) {
      return jsonResponse(res, 404, { error });
    }

    // Filter daily reports to only include this user
    const userDailyReports = data.dailyReports.map((day: any) => ({
      ...day,
      users: day.users[address] ? { [address]: day.users[address] } : {},
    }));

    const userAverage = data.users.find(
      (u: any) => u.address.toLowerCase() === address
    );

    return jsonResponse(res, 200, {
      generatedAt: data.generatedAt,
      periodDays: data.periodDays,
      totalDaysWithData: data.totalDaysWithData,
      globalAverages: data.globalAverages,
      dailyReports: userDailyReports,
      user: userAverage || null,
    });
  }

  jsonResponse(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Report API listening on http://${HOST}:${PORT}`);
  console.log(`  GET /              → full latest report`);
  console.log(`  GET /health        → status & metadata`);
  console.log(`  GET /ops/status    → automation & contract status`);
  console.log(`  GET /user/0x...    → single user report`);
});
