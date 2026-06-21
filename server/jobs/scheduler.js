const cron = require('node-cron');
const { runFullAnalysis } = require('../routes/email');
const { sendDailyDigest } = require('../services/emailService');
const store = require('../services/store');

function initScheduler() {
  // Runs every day at 7:00 AM server time
  // 7:00 AM GST (Gulf Standard Time = Asia/Dubai = UTC+4)
  cron.schedule('0 7 * * 1-5', async () => {
    console.log('\n⏰ Daily digest cron triggered at', new Date().toLocaleTimeString());
    try {
      // Send each opted-in user a digest of THEIR own portfolio.
      const recipients = await store.getDigestRecipients().catch(() => []);
      if (!recipients.length) { console.log('   No users opted in to the daily digest.'); return; }
      for (const email of recipients) {
        try {
          const { holdings, recommendations, whaleSignals } = await runFullAnalysis(email);
          if (!holdings.length) continue;
          const result = await sendDailyDigest({ holdings, recommendations, whaleSignals, recipient: email });
          console.log(`✅ Digest → ${email}:`, result.mode);
        } catch (e) { console.error(`❌ Digest failed for ${email}:`, e.message); }
      }
    } catch (err) {
      console.error('❌ Cron job failed:', err.message);
    }
  }, { timezone: 'Asia/Dubai' });

  console.log('⏰ Scheduler initialized — daily digest runs at 7:00 AM GST (Mon–Fri)');
}

module.exports = { initScheduler };
