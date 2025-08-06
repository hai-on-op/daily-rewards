import { config } from './config';
import { getTelegramBot, notifyTransaction } from './modules/telegram-bot';

async function testTelegramBot() {
  console.log('🧪 Testing Telegram Bot Setup...');
  
  try {
    // Load config
    const cfg = config();
    
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
      console.log('Please add TELEGRAM_BOT_TOKEN to your .env file');
      process.exit(1);
    }
    
    console.log('✅ Telegram bot token found');
    
    // Initialize bot (non-polling mode for testing)
    const bot = getTelegramBot(false);
    console.log(`✅ Bot initialized with ${bot.getUserCount()} registered users`);
    
    // Send a test notification after 3 seconds
    setTimeout(async () => {
      console.log('📤 Sending test notification...');
      
      await notifyTransaction({
        type: 'success',
        operation: 'Telegram Bot Test',
        details: {
          message: 'This is a test notification to verify the bot is working correctly!',
          timestamp: new Date().toISOString()
        }
      });
      
      console.log('✅ Test notification sent');
      console.log('');
      console.log('🎉 Telegram bot test completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Start a chat with your bot on Telegram');
      console.log('2. Send /start to subscribe to notifications');
      console.log('3. You should receive the test notification above');
      console.log('4. Use yarn telegram-bot to start the full bot with monitoring');
      console.log('5. Use yarn entry to run the main script with notifications');
      
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error testing Telegram bot:', error);
    process.exit(1);
  }
}

// Run the test
testTelegramBot().catch(console.error); 