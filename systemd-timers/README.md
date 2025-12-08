# Systemd Timer Files

This directory contains systemd timer and service files for scheduling the Daily Rewards tasks.

For complete setup instructions, see the main [README.md](../README.md) in the project root.

## Files

| File | Description |
|------|-------------|
| `entry-task.service` | Service unit for the entry task (runs via PM2) |
| `entry-task.timer` | Timer unit that triggers entry-task.service daily at 6:00 PM |
| `unpause-task.service` | Service unit for the unpause task |
| `unpause-task.timer` | Timer unit that triggers unpause-task.service daily at 8:00 PM |

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
