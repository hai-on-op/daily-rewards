module.exports = {
  apps: [
    {
      name: "entry-task",
      script: "./src/modules/entry.ts",
      interpreter: "node_modules/.bin/ts-node",
      cron_restart: "55 * * * *", // Run at 55 minutes of every hour
      watch: false,
      autorestart: false,
      instances: 1,
    },
    {
      name: "unpause-task",
      script: "./src/modules/unpause.ts",
      interpreter: "node_modules/.bin/ts-node",
      cron_restart: "0 * * * *", // Run at the top of every hour (00 minutes)
      watch: false,
      autorestart: false,
      instances: 1,
    },
  ],
};
