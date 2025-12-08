# Daily Rewards System Setup Guide

This guide provides comprehensive instructions for setting up and running the Daily Rewards distribution system. The system calculates and distributes rewards to users based on their LP positions, minting activity, and HAI-VELO participation.

## Table of Contents

1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Environment Variables Setup](#environment-variables-setup)
4. [Application Installation](#application-installation)
5. [PM2 Setup](#pm2-setup)
6. [Systemd Timer Setup](#systemd-timer-setup)
7. [Customizing Schedules](#customizing-schedules)
8. [Management and Monitoring](#management-and-monitoring)
9. [Troubleshooting](#troubleshooting)

---

## System Overview

The Daily Rewards system consists of two main scripts that run in sequence:

### 1. Entry Task (`src/modules/entry.ts`)
- Pauses the Reward Distributor contract
- Calculates rewards for LP providers, minters, and HAI-VELO participants
- Generates Merkle trees for each reward token
- Uploads Merkle roots to Cloudflare KV storage
- Updates the on-chain Merkle roots
- Sends Telegram notifications (if configured)

### 2. Unpause Task (`src/modules/unpause.ts`)
- Unpauses the Reward Distributor contract after the entry task completes
- Allows users to claim their rewards
- Sends Telegram notifications (if configured)

### Typical Workflow

```
[Entry Task starts at 6:00 PM daily]
    │
    ├── Pause Reward Distributor
    ├── Calculate all rewards
    ├── Generate Merkle trees
    ├── Upload to Cloudflare KV
    ├── Update on-chain Merkle roots
    │
[~2 hours processing time]
    │
[Unpause Task starts at 8:00 PM daily]
    │
    └── Unpause Reward Distributor
        └── Users can now claim rewards
```

---

## Prerequisites

Before setting up the system, ensure you have the following:

- **Operating System**: Systemd-based Linux distribution (Ubuntu 20.04+ recommended)
- **Node.js**: Version 18.x or higher
- **Yarn**: Package manager (or npm)
- **Git**: For cloning the repository
- **PM2** (optional): For manual task execution and debugging

### Install Node.js (if not installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install Yarn (optional, but recommended)

```bash
sudo npm install -g yarn
```

---

## Environment Variables Setup

Create a `.env` file in the application root directory with all required configuration. See `env.example` for a complete template.

### Required Environment Variables

#### Subgraph URLs

```bash
# Main GEB subgraph for querying protocol data
GEB_SUBGRAPH_URL=https://your-subgraph-url/api

# LP-specific subgraph (defaults to GEB_SUBGRAPH_URL if not set)
LP_GEB_SUBGRAPH_URL=https://your-lp-subgraph-url/api

# Minter-specific subgraph (defaults to GEB_SUBGRAPH_URL if not set)
MINTER_GEB_SUBGRAPH_URL=https://your-minter-subgraph-url/api

# Uniswap V3 subgraph for pool data
UNISWAP_SUBGRAPH_URL=https://gateway.thegraph.com/api/YOUR_API_KEY/subgraphs/id/...

# stKITE subgraph
STKITE_SUBGRAPH_URL=https://your-stkite-subgraph-url/api

# HAI-VELO subgraph
HAIVELO_SUBGRAPH_URL=https://your-haivelo-subgraph-url/api

# Reward Distributor subgraph
DISTRIBUTOR_SUBGRAPH_URL=https://your-distributor-subgraph-url/api
```

#### Contract Addresses

```bash
# Uniswap V3 pool address for HAI
UNISWAP_POOL_ADDRESS=0x...

# OP Standard Bridge
STANDARD_BRIDGE_ADDRESS=0x4200000000000000000000000000000000000010

# LayerZero executor
LZ_EXECUTOR_ADDRESS=0x...

# Cross-domain messenger
CROSS_DOMAIN_MESSENGER_ADDRESS=0x...

# Collateral token addresses
APX_ETH_ADDRESS=0x...
RETH_CONTRACT_ADDRESS=0x...
WSTETH_CONTRACT_ADDRESS=0x...
HOP_PROTOCOL_RETH_WRAPPER=0x...

# Reward token addresses
KITE_ADDRESS=0x...
OP_ADDRESS=0x4200000000000000000000000000000000000042
DINERO_ADDRESS=0x...
HAI_ADDRESS=0x...

# Reward Distributor contract
REWARD_DISTRIBUTOR_ADDRESS=0x...
```

#### Network Configuration

```bash
# Primary RPC URL (Optimism mainnet)
RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Specific RPC URLs (optional, defaults to RPC_URL)
LP_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
MINTER_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
HAIVELO_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
DISTRIBUTOR_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Chain ID
CHAIN_ID=optimism
```

#### Block Configuration

```bash
# Historic start block for LP rewards calculation
LP_HISTORIC_START_BLOCK=132012513

# Start block for daily LP rewards
LP_START_BLOCK=136779976

# Historic start block for HAI-VELO rewards
HAIVELO_HISTORIC_START_BLOCK=130991964

# Start block for daily HAI-VELO rewards
HAIVELO_START_BLOCK=136424800

# Minter rewards start block
MINTER_START_BLOCK=137678333
```

#### Reward Configuration

```bash
# Daily LP reward amounts per token (JSON format)
REWARD_LP_CONFIG={"KITE": 100}

# Historic LP reward amounts (distributed once)
REWARD_LP_HISTORIC_CONFIG={"OP": 8250}

# Collateral types for LP rewards
REWARD_LP_COLLATERAL_TYPES=["WETH"]

# Minter reward configuration (JSON format)
REWARD_MINTER_CONFIG={"KITE":{"HAIVELO": 50, "ALETH": 50}}

# Minter collateral types
REWARD_MINTER_COLLATERAL_TYPES=["HAIVELO","ALETH","MSETH"]

# Minter reward windows (multi-period support)
REWARD_MINTER_WINDOWS=[{"startBlock":137678333,"config":{"KITE":{"HAIVELO":50,"ALETH":50}}}]

# HAI-VELO daily rewards
REWARD_HAIVELO_CONFIG={"OP": 100}

# HAI-VELO historic rewards
REWARD_HAIVELO_HISTORIC_CONFIG={"HAI": 3578, "KITE": 278}

# HAI-VELO collateral type IDs
HAIVELO_COLLATERAL_TYPE_IDS=["HAIVELO","HAIVELOV2"]
```

#### Wallet Configuration (CRITICAL - Keep Secret!)

```bash
# Address authorized to set rewards
REWARD_SETTER_ADDRESS=0x...

# Private key for the reward setter (KEEP THIS SECRET!)
REWARD_SETTER_PRIVATE_KEY=your_private_key_here
```

#### Cloudflare KV Storage

```bash
# Cloudflare account ID
CLOUDFLARE_ACCOUNT_ID=your_account_id

# KV namespace ID for storing Merkle trees
CLOUDFLARE_NAMESPACE_ID=your_namespace_id

# API token with KV write permissions
CLOUDFLARE_API_TOKEN=your_api_token
```

#### API Keys

```bash
# Alchemy API key
ALCHEMY_API_KEY=your_alchemy_api_key

# Covalent API key (for transaction data)
COVALENT_API_KEY=your_covalent_api_key
```

#### Telegram Notifications (Optional)

```bash
# Telegram bot token from BotFather
TELEGRAM_BOT_TOKEN=your_bot_token

# Path to store user subscriptions
TELEGRAM_CHAT_STORAGE_FILE=./telegram-users.json
```

#### Debugging (Optional)

```bash
# Enable debug mode
DEBUG_REWARDS=false

# Custom debug output directory
DEBUG_OUTPUT_DIR=./debug-data
```

---

## Application Installation

### 1. Clone the repository

```bash
cd /var/www
git clone https://github.com/your-org/daily-rewards.git
cd daily-rewards
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Build the application

```bash
yarn build
```

### 4. Create environment file

```bash
cp env.example .env
nano .env  # Edit with your configuration
```

### 5. Set proper permissions

```bash
# Ensure the application directory is accessible
sudo chown -R $USER:$USER /var/www/daily-rewards

# Secure the .env file
chmod 600 /var/www/daily-rewards/.env
```

---

## PM2 Setup (Optional - for Manual Runs)

PM2 can be used to manually run tasks or for debugging. **Scheduling is handled by systemd timers, not PM2.**

### When to Use PM2

- **Manual execution**: Run tasks outside the scheduled time for testing
- **Debugging**: Monitor task output in real-time
- **One-off runs**: Execute tasks without waiting for the schedule

### Configure PM2

The `ecosystem.config.js` file defines task configurations (without scheduling):

```javascript
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
```

### Run Tasks Manually via PM2

```bash
cd /var/www/daily-rewards

# Run entry task manually
pm2 start ecosystem.config.js --only entry-task

# Run unpause task manually
pm2 start ecosystem.config.js --only unpause-task

# View logs
pm2 logs
```

> **Important**: Do not use PM2's `cron_restart` feature together with systemd timers, as this would cause duplicate task executions.

---

## Systemd Timer Setup

Systemd timers handle the daily scheduling of tasks. The timer and service files are located in the `systemd-timers/` directory.

### Service Files

#### Entry Task Service (`systemd-timers/entry-task.service`)

This service runs the entry task directly via ts-node:

```ini
[Unit]
Description=Daily Rewards Entry Task
After=network.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/var/www/daily-rewards
EnvironmentFile=/var/www/daily-rewards/.env
ExecStart=/usr/bin/node node_modules/.bin/ts-node ./src/modules/entry.ts
StandardOutput=append:/var/log/entry-task.log
StandardError=append:/var/log/entry-task.log
TimeoutStartSec=7200

# Retry configuration
Restart=on-failure
RestartSec=60
StartLimitBurst=3
StartLimitIntervalSec=600

[Install]
WantedBy=multi-user.target
```

#### Unpause Task Service (`systemd-timers/unpause-task.service`)

```ini
[Unit]
Description=Daily Rewards Unpause Task
After=network.target entry-task.service

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/var/www/daily-rewards
EnvironmentFile=/var/www/daily-rewards/.env
ExecStart=/usr/bin/node node_modules/.bin/ts-node ./src/modules/unpause.ts
StandardOutput=append:/var/log/unpause-task.log
StandardError=append:/var/log/unpause-task.log
TimeoutStartSec=300

# Retry configuration
Restart=on-failure
RestartSec=30
StartLimitBurst=5
StartLimitIntervalSec=600

[Install]
WantedBy=multi-user.target
```

### Timer Files

#### Entry Task Timer (`systemd-timers/entry-task.timer`)

```ini
[Unit]
Description=Daily Rewards Entry Task Timer

[Timer]
OnCalendar=*-*-* 18:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

#### Unpause Task Timer (`systemd-timers/unpause-task.timer`)

```ini
[Unit]
Description=Daily Rewards Unpause Task Timer

[Timer]
OnCalendar=*-*-* 20:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### Installation

1. **Copy files to systemd directory:**

```bash
cd /var/www/daily-rewards
sudo cp systemd-timers/*.timer systemd-timers/*.service /etc/systemd/system/
```

2. **Reload systemd daemon:**

```bash
sudo systemctl daemon-reload
```

3. **Enable and start timers:**

```bash
sudo systemctl enable entry-task.timer unpause-task.timer
sudo systemctl start entry-task.timer unpause-task.timer
```

4. **Create log files:**

```bash
sudo touch /var/log/entry-task.log /var/log/unpause-task.log
sudo chmod 644 /var/log/entry-task.log /var/log/unpause-task.log
```

---

## Customizing Schedules

### Systemd Timer OnCalendar Format

The `OnCalendar` directive uses systemd's calendar event format:

| Schedule | OnCalendar Value | Description |
|----------|------------------|-------------|
| Every hour at :30 | `*:30` | 00:30, 01:30, 02:30, etc. |
| Every hour at :00 | `*:00` | Top of every hour |
| Daily at midnight | `00:00` | Once per day at 00:00 |
| Daily at noon | `12:00` | Once per day at 12:00 |
| Every 30 minutes | `*:0/30` | 00:00, 00:30, 01:00, etc. |
| Weekly on Monday | `Mon *-*-* 00:00:00` | Every Monday at midnight |
| Monthly | `*-*-01 00:00:00` | First day of each month |

### Recommended Default Schedule

For optimal operation, we recommend:

- **Entry Task**: Run daily at 6:00 PM (`18:00`)
- **Unpause Task**: Run daily at 8:00 PM (`20:00`) - 2 hours after entry to allow processing to complete

This ensures the entry task has enough time to complete before users can claim rewards.

---

## Management and Monitoring

### Systemd Commands (Primary)

```bash
# Check timer status
sudo systemctl status entry-task.timer
sudo systemctl status unpause-task.timer

# List all active timers
systemctl list-timers

# Check service status
sudo systemctl status entry-task.service
sudo systemctl status unpause-task.service

# View service logs via journalctl
sudo journalctl -u entry-task.service -f
sudo journalctl -u unpause-task.service -f

# Stop timers
sudo systemctl stop entry-task.timer unpause-task.timer

# Disable timers
sudo systemctl disable entry-task.timer unpause-task.timer
```

### PM2 Commands (Optional - for manual runs)

```bash
# Run entry task manually
pm2 start ecosystem.config.js --only entry-task

# View logs
pm2 logs entry-task

# Stop a running task
pm2 stop entry-task

# Delete from PM2
pm2 delete entry-task
```

### Log Files

| Log | Location | Description |
|-----|----------|-------------|
| Entry Task | `/var/log/entry-task.log` | Systemd service output |
| Unpause Task | `/var/log/unpause-task.log` | Systemd service output |
| PM2 Logs | `~/.pm2/logs/` | PM2 managed logs |

View logs in real-time:

```bash
# Systemd logs
tail -f /var/log/entry-task.log

# PM2 logs
pm2 logs --lines 100
```

---

## Troubleshooting

### Common Issues

#### 1. Scripts not running on schedule

**Check if timers are active:**
```bash
systemctl list-timers | grep -E "entry|unpause"
```

**Verify time synchronization:**
```bash
timedatectl status
```

**Check when timers will next run:**
```bash
systemctl list-timers --all | grep -E "entry|unpause"
```

#### 2. Environment variables not loaded

**Test loading env file:**
```bash
cd /var/www/daily-rewards
source .env && node -e "console.log(process.env.RPC_URL)"
```

**Check file permissions:**
```bash
ls -la /var/www/daily-rewards/.env
```

#### 3. Permission denied errors

**Fix ownership:**
```bash
sudo chown -R $USER:$USER /var/www/daily-rewards
```

**For systemd services running as different user:**
```bash
sudo chown www-data:www-data /var/www/daily-rewards/.env
```

#### 4. Transaction failures

**Check wallet balance:**
- Ensure the reward setter wallet has enough ETH for gas

**Verify contract addresses:**
- Double-check `REWARD_DISTRIBUTOR_ADDRESS` is correct

**Check RPC connectivity:**
```bash
curl -X POST $RPC_URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

#### 5. Subgraph query failures

**Test subgraph endpoint:**
```bash
curl -X POST $GEB_SUBGRAPH_URL \
  -H "Content-Type: application/json" \
  -d '{"query": "{ _meta { block { number } } }"}'
```

#### 6. Systemd timers not persisting after reboot

**Check if timers are enabled:**
```bash
systemctl is-enabled entry-task.timer
systemctl is-enabled unpause-task.timer
```

**Re-enable timers if needed:**
```bash
sudo systemctl enable entry-task.timer unpause-task.timer
```

### Verification Checklist

Run these commands to verify your setup:

```bash
# 1. Check Node.js version
node --version  # Should be 18.x or higher

# 2. Verify environment file exists
test -f /var/www/daily-rewards/.env && echo "✓ .env exists" || echo "✗ .env missing"

# 3. Check systemd timers
systemctl list-timers | grep -E "entry|unpause"

# 4. Test entry script (dry run)
cd /var/www/daily-rewards
node -e "require('dotenv').config(); console.log('Config loaded:', !!process.env.RPC_URL)"

# 5. Check log directories
ls -la /var/log/entry-task.log /var/log/unpause-task.log 2>/dev/null || echo "Log files not created yet"
```

---

## Additional Documentation

- **Telegram Setup**: See [TELEGRAM_SETUP.md](TELEGRAM_SETUP.md) for Telegram notification configuration
- **Smart Contract**: See [contract/README.md](contract/README.md) for Reward Distributor contract documentation
- **PM2 Documentation**: https://pm2.keymetrics.io/docs/
- **Systemd Timer Documentation**: https://www.freedesktop.org/software/systemd/man/systemd.timer.html

