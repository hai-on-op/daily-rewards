// PM2 Configuration for non-critical long-running services.
//
// Reward root updates and unpause automation are handled directly by systemd
// timers in systemd-timers/. Do not schedule entry-task or unpause-task in PM2.

module.exports = {
  apps: [
    {
      name: "report-api",
      script: "dist/scripts/report-api.js",
      interpreter: "node",
      watch: false,
      autorestart: true,
      instances: 1,
      env: {
        REPORT_API_HOST: "127.0.0.1",
        PORT: "3100",
      },
    },
  ],
};
