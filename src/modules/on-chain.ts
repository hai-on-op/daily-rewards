import { getTelegramBot, notifyTransaction } from './telegram-bot';

/**
 * Start the Telegram bot for notifications with polling enabled
 */
export const startTelegramBot = async () => {
  try {
    // Enable polling for the main bot service
    const bot = getTelegramBot(true);
    console.log(`🤖 Telegram bot started with ${bot.getUserCount()} registered users`);
    
    // Send startup notification
    await notifyTransaction({
      type: 'success',
      operation: 'Telegram Bot Started',
      details: {
        timestamp: new Date().toISOString(),
        userCount: bot.getUserCount()
      }
    });

    return bot;
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    throw error;
  }
};

/**
 * Main function to start the bot service
 */
export const startServices = async () => {
  console.log('🚀 Starting Telegram bot service...');
  
  try {
    // Start Telegram bot with polling
    await startTelegramBot();
    
    console.log('✅ Telegram bot service started successfully');
    console.log('Bot is now ready to receive users and send notifications');
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log('🛑 Shutting down Telegram bot...');
      const bot = getTelegramBot(true);
      bot.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Telegram bot service:', error);
    process.exit(1);
  }
};

// If this file is run directly, start the bot service
if (require.main === module) {
  startServices().catch(console.error);
}
