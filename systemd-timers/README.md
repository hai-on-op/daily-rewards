# Daily Rewards Systemd Timers

This directory contains systemd timer and service files for automating the Daily Rewards tasks. The system consists of two main components:

1. Entry Task - Runs at minute 30 of every hour (e.g., 00:30, 01:30, 02:30, etc.)
2. Unpause Task - Runs at minute 40 of every hour (e.g., 00:40, 01:40, 02:40, etc.)

## Prerequisites

- Systemd-based Linux distribution
- Node.js installed
- The Daily Rewards application deployed at `/var/www/daily-rewards`
- Proper environment file (`.env`) in the application directory

## Customizing Timer Schedules

Before installation, you may want to adjust the default timing schedules. The timers are configured in the `.timer` files:

1. Edit `entry-task.timer` to modify the Entry Task schedule:
```bash
nano entry-task.timer
```
The default schedule is set to run at minute 30 of every hour:
```ini
[Timer]
OnCalendar=*:30
```

2. Edit `unpause-task.timer` to modify the Unpause Task schedule:
```bash
nano unpause-task.timer
```
The default schedule is set to run at minute 40 of every hour:
```ini
[Timer]
OnCalendar=*:40
```

You can modify the `OnCalendar` value using systemd time format. Some examples:
- `*:30` - At minute 30 of every hour (e.g., 00:30, 01:30, etc.)
- `hourly` - At the start of every hour
- `daily` - Once per day
- `weekly` - Once per week
- `00:00` - At midnight
- `12:00` - At noon
- `Mon *-*-* 12:00:00` - Every Monday at noon
- `*:0/30` - Every 30 minutes (e.g., 00:00, 00:30, 01:00, etc.)

## Installation

1. Copy the timer and service files to the systemd directory:

```bash
sudo cp *.timer *.service /etc/systemd/system/
```

2. Reload the systemd daemon to recognize the new files:

```bash
sudo systemctl daemon-reload
```

3. Enable and start the timers:

```bash
sudo systemctl enable entry-task.timer
sudo systemctl enable unpause-task.timer
sudo systemctl start entry-task.timer
sudo systemctl start unpause-task.timer
```

## Timer Configuration

### Entry Task
- Runs every 30 minutes (e.g., 00:30, 01:30, 02:30, etc.)
- Executes `./src/modules/entry.ts`
- Runs as root user
- Logs output to `/var/log/entry-task.log`

### Unpause Task
- Runs every 40 minutes (e.g., 00:40, 01:40, 02:40, etc.)
- Executes `./src/modules/unpause.ts`
- Runs as www-data user
- Logs output to `/var/log/unpause-task.log`

## Service Management

### Check Timer Status
```bash
sudo systemctl status entry-task.timer
sudo systemctl status unpause-task.timer
```

### Check Service Status
```bash
sudo systemctl status entry-task.service
sudo systemctl status unpause-task.service
```

### View Logs
```bash
sudo journalctl -u entry-task.service
sudo journalctl -u unpause-task.service
```

### Stop Timers
```bash
sudo systemctl stop entry-task.timer
sudo systemctl stop unpause-task.timer
```

### Disable Timers
```bash
sudo systemctl disable entry-task.timer
sudo systemctl disable unpause-task.timer
```

## Troubleshooting

1. Check if the timers are active:
```bash
systemctl list-timers
```

2. Verify the service files are properly loaded:
```bash
systemctl list-unit-files | grep daily-rewards
```

3. Check the logs for any errors:
```bash
tail -f /var/log/entry-task.log
tail -f /var/log/unpause-task.log
```

## Notes

- Both services have retry configurations in case of failures
- Services will retry up to 5 times within a 10-minute window
- Each service has a timeout of 5 minutes (300 seconds)
- The unpause task is configured to run after the entry task completes 