const cron = require('node-cron');
const { runFullAnalysis } = require('../routes/email');
const { sendDailyDigest } = require('../services/emailService');

function initScheduler() {
  // Runs every day at 7:00 AM server time
  // 7:00 AM GST (Gulf Standard Time = Asia/Dubai = UTC+4)
  cron.schedule('0 7 * * 1-5', async () => {
    console.log('\n⏰ Daily digest cron triggered at', new Date().toLocaleTimeString());
    try {
      const { holdings, recommendations, whaleSignals } = await runFullAnalysis();
      const result = await sendDailyDigest({ holdings, recommendations, whaleSignals });
      console.log('✅ Daily digest sent:', result);
    } catch (err) {
      console.error('❌ Cron job failed:', err.message);
    }
  }, { timezone: 'Asia/Dubai' });

  console.log('⏰ Scheduler initialized — daily digest runs at 7:00 AM GST (Mon–Fri)');
}

module.exports = { initScheduler };
