# Telegram Bot Setup Guide

This guide explains how to set up and use the Telegram notification bot for the Daily Rewards system.

## Prerequisites

1. **Create a Telegram Bot**:
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Use `/newbot` command to create a new bot
   - Follow the instructions to set a name and username
   - Save the bot token provided by BotFather

2. **Install Dependencies**:
   ```bash
   yarn install
   ```

## Configuration

Add the following environment variables to your `.env` file:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_STORAGE_FILE=./telegram-users.json
```

### Environment Variables

- `TELEGRAM_BOT_TOKEN`: The token provided by BotFather when creating your bot
- `TELEGRAM_CHAT_STORAGE_FILE`: Path to store user registration data (optional, defaults to `./telegram-users.json`)

## Usage

### Starting the Telegram Bot

You can run the Telegram bot in several ways:

1. **Development mode** (with TypeScript):
   ```bash
   yarn telegram-bot
   ```

2. **Production mode** (compiled JavaScript):
   ```bash
   yarn telegram-bot:prod
   ```

3. **Standalone bot** (just the bot without running transactions):
   ```typescript
   import { getTelegramBot } from './src/modules/telegram-bot';
   
   const bot = getTelegramBot();
   console.log(`Bot started with ${bot.getUserCount()} users`);
   ```

### Running the Main Entry Script

The main entry script now includes Telegram notifications:

1. **Development mode**:
   ```bash
   yarn entry
   ```

2. **Production mode**:
   ```bash
   yarn entry:prod
   ```

## How It Works

The Telegram bot has two modes to avoid conflicts:

### **Polling Mode** (Bot Service)
- Used when running `yarn telegram-bot`
- Enables interactive commands (`/start`, `/status`, `/help`, `/stop`)
- Listens for user messages
- **Only one instance can run at a time**

### **Non-Polling Mode** (Transaction Scripts)
- Used when running `yarn entry` or other transaction scripts
- Only sends notifications, doesn't listen for commands
- Multiple instances can run simultaneously
- No conflict with the polling bot

When you run the main entry script (`yarn entry`), it will:

1. **Initialize the bot in non-polling mode** and load existing users
2. **Send notifications** at key points during transaction execution:
   - When transactions are initiated
   - When transactions are confirmed
   - When transactions fail
   - When merkle roots are updated

**No separate monitoring process is needed** - notifications are sent directly from your existing transaction execution code.

## Deployment Strategies

### **Option 1: Simple Deployment**
Run only your transaction scripts - notifications will be sent automatically:
```bash
yarn entry:prod
```
*Note: Users won't be able to use interactive commands like `/start` with this approach.*

### **Option 2: Full Bot Service**
Run the bot service separately for user interaction, plus your transaction scripts:

**Terminal 1 (Bot Service):**
```bash
yarn telegram-bot:prod
```

**Terminal 2 (Transaction Scripts):**
```bash
yarn entry:prod
```

This allows users to interact with the bot AND receive notifications from transactions.

## Bot Commands

Users can interact with the bot using these commands:

- `/start` - Subscribe to notifications
- `/status` - Check subscription status
- `/stop` - Unsubscribe from notifications
- `/help` - Show help message

## Notification Types

The bot sends notifications for:

### Transaction Events
- **Initiation**: When a transaction is submitted to the blockchain
- **Success**: When a transaction is confirmed
- **Failure**: When a transaction fails

### Operations Covered
- Pause/Unpause Reward Distributor
- Start Initial Epoch
- Update Merkle Roots
- Process Daily Rewards

### Message Format

**Transaction Initiated:**
```
🚀 Transaction Initiated

Operation: Update Merkle Roots
Status: Pending confirmation...

Details: {
  "tokens": ["KITE", "OP", "DINERO", "HAI"],
  "tokenCount": 4
}
```

**Transaction Confirmed:**
```
✅ Transaction Confirmed

Operation: Update Merkle Roots
TX Hash: 0x123...
Block: 12345678
Status: Successfully confirmed!

Details: {
  "tokens": ["KITE", "OP", "DINERO", "HAI"],
  "gasUsed": "150000"
}
```

**Transaction Failed:**
```
❌ Transaction Failed

Operation: Update Merkle Roots
Error: Gas limit exceeded
Status: Transaction failed

Details: {
  "tokens": ["KITE", "OP", "DINERO", "HAI"],
  "tokenAddresses": ["0x...", "0x...", "0x...", "0x..."]
}
```

**Merkle Update:**
```
🌳 Merkle Roots Updated!

KITE: 0xabc...
OP: 0xdef...
DINERO: 0x123...
HAI: 0x456...

New rewards are now available for claiming!
```

## File Structure

```
src/modules/
├── telegram-bot.ts      # Main Telegram bot implementation
├── on-chain.ts         # Simple bot startup service
├── main.ts             # Updated with Telegram notifications
└── entry.ts            # Updated with Telegram notifications
```

## Data Storage

User registration data is stored in a JSON file (default: `telegram-users.json`):

```json
[
  {
    "chatId": 123456789,
    "username": "user123",
    "firstName": "John",
    "lastName": "Doe",
    "joinedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

## Error Handling

- The bot gracefully handles users who block it or delete their chats
- Failed notifications are logged but don't stop the main process
- If the bot token is missing, the system will warn but continue without notifications

## Security Considerations

1. **Bot Token**: Keep your bot token secure and never commit it to version control
2. **User Data**: The bot only stores minimal user information (chat ID, username, join date)
3. **Permissions**: The bot only needs to send messages, no special permissions required

## Troubleshooting

### Common Issues

1. **Bot not responding**:
   - Check if `TELEGRAM_BOT_TOKEN` is set correctly
   - Verify the token with BotFather
   - Check console logs for error messages

2. **Notifications not sending**:
   - Ensure users have started the bot with `/start`
   - Check if the bot is running and connected
   - Verify network connectivity

3. **User storage issues**:
   - Check file permissions for the storage file
   - Ensure the directory exists and is writable

### Logs

The bot provides detailed logging:
- User registrations/unsubscriptions
- Notification delivery status
- Error messages and failures

## Development

To extend the bot functionality:

1. **Add new commands**: Modify the `setupCommands()` method in `telegram-bot.ts`
2. **Add new notification types**: Extend the `TransactionNotification` interface
3. **Custom message formatting**: Modify the `notifyTransaction()` method

## Production Deployment

For production deployment:

1. Build the project: `yarn build`
2. Set environment variables
3. Run with process manager (PM2, systemd, etc.)
4. Monitor logs for any issues

### Simple Deployment

Just run your existing entry script - the bot will automatically start and send notifications:

```bash
yarn entry:prod
```

### Separate Bot Service (Optional)

If you want to run the bot as a separate service for users to interact with:

```bash
yarn telegram-bot:prod
```

Example PM2 configuration:

```json
{
  "apps": [
    {
      "name": "telegram-bot",
      "script": "dist/modules/on-chain.js",
      "env": {
        "NODE_ENV": "production"
      }
    },
    {
      "name": "daily-rewards",
      "script": "dist/modules/entry.js",
      "env": {
        "NODE_ENV": "production"
      }
    }
  ]
}
```

## Key Benefits

- **Simple Integration**: No complex monitoring setup required
- **Real-time Notifications**: Sent directly from transaction execution
- **Reliable**: No dependency on external event monitoring
- **Lightweight**: Minimal overhead on existing scripts 