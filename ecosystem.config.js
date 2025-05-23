module.exports = {
  apps: [
    {
      name: "my-hourly-task",
      script: "./path/to/your-script.ts",
      interpreter: "node_modules/.bin/ts-node",
      cron_restart: "0 0 * * *", // Midnight UTC
      watch: false,
      autorestart: false,
      instances: 1,
    },
  ],
};
