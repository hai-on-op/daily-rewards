// PM2 Configuration for Daily Rewards
// 
// NOTE: Scheduling is handled by systemd timers, NOT by PM2's cron_restart.
// Use this file only if you want to run tasks manually via PM2:
//   pm2 start ecosystem.config.js --only entry-task
//
// For automated daily scheduling, use the systemd timers in systemd-timers/

module.exports = {
  apps: [
    {
      name: "entry-task",
      script: "./src/modules/entry.ts",
      interpreter: "node_modules/.bin/ts-node",
      watch: false,
      autorestart: false,
      instances: 1,
      // No cron_restart - scheduling handled by systemd timers
    },
    {
      name: "unpause-task",
      script: "./src/modules/unpause.ts",
      interpreter: "node_modules/.bin/ts-node",
      watch: false,
      autorestart: false,
      instances: 1,
      // No cron_restart - scheduling handled by systemd timers
    },
  ],
};
