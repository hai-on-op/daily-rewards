import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import { config } from '../config';

interface TelegramUser {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: string;
}

interface TransactionNotification {
  type: 'initiate' | 'success' | 'failure';
  operation: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  details?: any;
}

class TelegramNotificationBot {
  private bot: TelegramBot;
  private users: Map<number, TelegramUser> = new Map();
  private storageFile: string;
  private isPolling: boolean;

  constructor(enablePolling: boolean = false) {
    const cfg = config();
    
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    // Only enable polling if explicitly requested (for the main bot service)
    this.isPolling = enablePolling;
    this.bot = new TelegramBot(cfg.TELEGRAM_BOT_TOKEN, { polling: enablePolling });
    this.storageFile = cfg.TELEGRAM_CHAT_STORAGE_FILE;
    
    this.loadUsers();
    
    // Only setup commands if polling is enabled
    if (enablePolling) {
      this.setupCommands();
    }
  }

  private loadUsers(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const usersArray: TelegramUser[] = JSON.parse(data);
        this.users = new Map(usersArray.map(user => [user.chatId, user]));
        console.log(`Loaded ${this.users.size} Telegram users`);
      }
    } catch (error) {
      console.error('Error loading Telegram users:', error);
    }
  }

  private saveUsers(): void {
    try {
      const usersArray = Array.from(this.users.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(usersArray, null, 2));
    } catch (error) {
      console.error('Error saving Telegram users:', error);
    }
  }

  private setupCommands(): void {
    if (!this.isPolling) {
      console.log('Bot commands not setup - polling disabled');
      return;
    }

    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const user: TelegramUser = {
        chatId,
        username: msg.from?.username,
        firstName: msg.from?.first_name,
        lastName: msg.from?.last_name,
        joinedAt: new Date().toISOString()
      };

      this.users.set(chatId, user);
      this.saveUsers();

      const welcomeMessage = `
🎉 Welcome to the Daily Rewards Notification Bot!

You will now receive notifications for:
• Transaction initiations
• Transaction confirmations
• Transaction failures
• Merkle root updates
• Reward distribution events

Use /status to check your subscription status.
Use /stop to unsubscribe from notifications.
      `;

      this.bot.sendMessage(chatId, welcomeMessage);
      console.log(`New user registered: ${user.username || user.firstName || chatId}`);
    });

    this.bot.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      const user = this.users.get(chatId);

      if (user) {
        const statusMessage = `
✅ You are subscribed to notifications!

👤 User: ${user.username || user.firstName || 'Unknown'}
📅 Joined: ${new Date(user.joinedAt).toLocaleDateString()}
🔔 Status: Active
        `;
        this.bot.sendMessage(chatId, statusMessage);
      } else {
        this.bot.sendMessage(chatId, '❌ You are not subscribed. Use /start to subscribe.');
      }
    });

    this.bot.onText(/\/stop/, (msg) => {
      const chatId = msg.chat.id;
      
      if (this.users.has(chatId)) {
        this.users.delete(chatId);
        this.saveUsers();
        this.bot.sendMessage(chatId, '❌ You have been unsubscribed from notifications.');
        console.log(`User unsubscribed: ${chatId}`);
      } else {
        this.bot.sendMessage(chatId, '❌ You are not currently subscribed.');
      }
    });

    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `
🤖 Daily Rewards Bot Commands:

/start - Subscribe to notifications
/status - Check subscription status
/stop - Unsubscribe from notifications
/help - Show this help message

This bot will notify you about:
• Merkle root updates
• Reward distribution transactions
• Transaction confirmations and failures
      `;
      this.bot.sendMessage(chatId, helpMessage);
    });

    console.log('Telegram bot commands setup complete');
  }

  public async notifyTransaction(notification: TransactionNotification): Promise<void> {
    if (this.users.size === 0) {
      console.log('No Telegram users to notify');
      return;
    }

    let message = '';
    let emoji = '';

    switch (notification.type) {
      case 'initiate':
        emoji = '🚀';
        message = `${emoji} Transaction Initiated\n\n`;
        message += `Operation: ${notification.operation}\n`;
        if (notification.txHash) {
          message += `TX Hash: \`${notification.txHash}\`\n`;
        }
        message += `Status: Pending confirmation...`;
        break;

      case 'success':
        emoji = '✅';
        message = `${emoji} Transaction Confirmed\n\n`;
        message += `Operation: ${notification.operation}\n`;
        if (notification.txHash) {
          message += `TX Hash: \`${notification.txHash}\`\n`;
        }
        if (notification.blockNumber) {
          message += `Block: ${notification.blockNumber}\n`;
        }
        message += `Status: Successfully confirmed!`;
        break;

      case 'failure':
        emoji = '❌';
        message = `${emoji} Transaction Failed\n\n`;
        message += `Operation: ${notification.operation}\n`;
        if (notification.txHash) {
          message += `TX Hash: \`${notification.txHash}\`\n`;
        }
        if (notification.error) {
          message += `Error: ${notification.error}\n`;
        }
        message += `Status: Transaction failed`;
        break;
    }

    if (notification.details) {
      message += `\n\nDetails: ${JSON.stringify(notification.details, null, 2)}`;
    }

    // Send to all registered users
    const promises = Array.from(this.users.keys()).map(async (chatId) => {
      try {
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Error sending message to ${chatId}:`, error);
        // If user blocked the bot or chat doesn't exist, remove them
        if (error instanceof Error && error.message.includes('chat not found')) {
          this.users.delete(chatId);
          this.saveUsers();
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`Notification sent to ${this.users.size} users: ${notification.operation} - ${notification.type}`);
  }

  public async notifyMerkleUpdate(tokens: string[], roots: string[]): Promise<void> {
    const message = `
🌳 Merkle Roots Updated!

${tokens.map((token, index) => `${token}: \`${roots[index]}\``).join('\n')}

New rewards are now available for claiming!
    `;

    const promises = Array.from(this.users.keys()).map(async (chatId) => {
      try {
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Error sending merkle update to ${chatId}:`, error);
        if (error instanceof Error && error.message.includes('chat not found')) {
          this.users.delete(chatId);
          this.saveUsers();
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`Merkle update notification sent to ${this.users.size} users`);
  }

  public getUserCount(): number {
    return this.users.size;
  }

  public stop(): void {
    if (this.isPolling) {
      this.bot.stopPolling();
      console.log('Telegram bot stopped');
    }
  }
}

// Singleton instances
let pollingBotInstance: TelegramNotificationBot | null = null;
let notificationBotInstance: TelegramNotificationBot | null = null;

export const getTelegramBot = (enablePolling: boolean = false): TelegramNotificationBot => {
  if (enablePolling) {
    if (!pollingBotInstance) {
      pollingBotInstance = new TelegramNotificationBot(true);
    }
    return pollingBotInstance;
  } else {
    if (!notificationBotInstance) {
      notificationBotInstance = new TelegramNotificationBot(false);
    }
    return notificationBotInstance;
  }
};

export const notifyTransaction = async (notification: TransactionNotification): Promise<void> => {
  try {
    // Use non-polling bot for notifications
    const bot = getTelegramBot(false);
    await bot.notifyTransaction(notification);
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
};

export const notifyMerkleUpdate = async (tokens: string[], roots: string[]): Promise<void> => {
  try {
    // Use non-polling bot for notifications
    const bot = getTelegramBot(false);
    await bot.notifyMerkleUpdate(tokens, roots);
  } catch (error) {
    console.error('Error sending Telegram merkle update:', error);
  }
};

/**
 * Initializes the Telegram bot in non-polling mode
 * @returns Promise that resolves when initialization is complete
 */
export const initializeTelegramBot = async (): Promise<void> => {
  try {
    const telegramBot = getTelegramBot(false); // Use non-polling mode
    console.log(
      `Telegram bot initialized with ${telegramBot.getUserCount()} users`
    );
  } catch (error) {
    console.warn('Telegram bot initialization failed:', error);
  }
};

export { TransactionNotification }; 