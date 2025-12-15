# Systemd Timer Files

This directory contains systemd timer and service files for scheduling the Daily Rewards tasks.

For complete setup instructions, see the main [README.md](../README.md) in the project root.

## Files

| File | Description |
|------|-------------|
| `entry-task.service` | Service unit for the entry task (uses orchestrator CLI) |
| `entry-task.timer` | Timer unit that triggers entry-task.service daily at 6:00 PM |
| `unpause-task.service` | Service unit for the unpause task |
| `unpause-task.timer` | Timer unit that triggers unpause-task.service daily at 8:00 PM |

## Feature Flags

The entry task now uses a feature flag system for environment-specific configuration.
Set `FEATURE_MODE` in your `.env` file or the service's EnvironmentFile:

| Mode | Description |
|------|-------------|
| `production` | All features enabled (default) |
| `development` | Minimal operations - no blockchain writes, no notifications |
| `dry-run` | Calculate and generate trees, but don't persist anywhere |
| `custom` | Use individual FEATURE_* environment variables |

### Individual Feature Flags

For fine-grained control, set these in your `.env` file:

```bash
FEATURE_MODE=custom
FEATURE_INIT_TELEGRAM=true
FEATURE_PAUSE_CONTRACT=true
FEATURE_HANDLE_INITIAL_EPOCH=true
FEATURE_PREPARE_CONFIG=true
FEATURE_CALCULATE_REWARDS=true
FEATURE_GENERATE_MERKLE_TREES=true
FEATURE_UPDATE_ON_CHAIN=true
FEATURE_SAVE_BACKUPS=true
FEATURE_UPLOAD_TO_CLOUDFLARE=true
FEATURE_SEND_NOTIFICATIONS=true
```

## Quick Installation

```bash
# Copy files to systemd directory
sudo cp *.timer *.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start timers
sudo systemctl enable entry-task.timer unpause-task.timer
sudo systemctl start entry-task.timer unpause-task.timer
```

## Customizing Schedules

Edit the timer files before copying to `/etc/systemd/system/`:

```bash
# Edit entry task schedule (default: 18:00 / 6 PM)
nano entry-task.timer

# Edit unpause task schedule (default: 20:00 / 8 PM)
nano unpause-task.timer
```

See the main README for OnCalendar format examples.
