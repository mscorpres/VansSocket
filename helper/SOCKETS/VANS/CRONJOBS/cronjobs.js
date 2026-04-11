const cron = require("node-cron");

// ============================================
// CORRECT FIX FOR PM2 CLUSTER MODE
// ============================================
// Use PM2's NODE_APP_INSTANCE environment variable
// This prevents duplicate emails in PM2 cluster mode
const PM2_INSTANCE_ID = process.env.NODE_APP_INSTANCE || '0';

if (PM2_INSTANCE_ID === '0') {
  console.log(`✅ Cron jobs initialized on PM2 Instance: ${PM2_INSTANCE_ID}, PID: ${process.pid}`);

// 12:10 AM → Dispatched Invoiced Report
  cron.schedule("10 0 * * *", () => {
  console.log(`[Instance:${PM2_INSTANCE_ID}][PID:${process.pid}] Cron job triggered for sendDispatchedInvoicedReport at ${new Date().toISOString()}`);
  try {
    require("./invoicedSummery").sendDispatchedInvoicedReport();
    console.log("✅ sendDispatchedInvoicedReport executed successfully");
  } catch (error) {
    console.error(`❌ Error executing sendDispatchedInvoicedReport: ${error.message}`, error.stack);
  }
});

  
  // 12:15 AM → Inward Report (YESTERDAY's data)
  cron.schedule("15 0 * * *", () => {
    console.log(`[Instance:${PM2_INSTANCE_ID}][PID:${process.pid}] Inward Report Cron job triggered at ${new Date().toISOString()}`);
    require("./inwardReportVans").sendIwardReport();
  });
  
  // 12:20 AM → Dispatch Report (YESTERDAY's data)
  cron.schedule("20 0 * * *", () => {
    console.log(`[Instance:${PM2_INSTANCE_ID}][PID:${process.pid}] Dispatch Report Cron job triggered at ${new Date().toISOString()}`);
    require("./dispatchReport").sendDispatchReport();
  });
  
  // 12:25 AM → Pending PO Report (YESTERDAY's data)
  cron.schedule("25 0 * * *", () => {
    console.log(`[Instance:${PM2_INSTANCE_ID}][PID:${process.pid}] Pending PO Report Cron job triggered at ${new Date().toISOString()}`);
    require("./poReport").sendPendingPOReport();
  });
  
  // 12:30 AM → Pending SO Report (YESTERDAY's data)
  cron.schedule("30 0 * * *", () => {
    console.log(`[Instance:${PM2_INSTANCE_ID}][PID:${process.pid}] Cron job triggered for sendSOPendingReport at ${new Date().toISOString()}`);
    try {
      require("./soPendingReportVans").sendSOPendingReport();
      console.log("✅ sendSOPendingReport executed successfully");
    } catch (error) {
      console.error(`❌ Error executing sendSOPendingReport: ${error.message}`, error.stack);
    }
  });





 // Minimum Stock Alert
// Runs every 30 minutes
cron.schedule("*/30 * * * *", () => {
  try {
    require("./minStockAlert").sendMinStockAlert();
    console.log("✅ sendMinStockAlert executed successfully");
  } catch (error) {
    console.error(`❌ Error executing sendMinStockAlert: ${error.message}`, error.stack);
  }
});


  
  console.log("📅 Scheduled: 12:15 AM, 12:20 AM, 12:25 AM, 12:30 AM (all fetch YESTERDAY's data)");
  
} else {
  console.log(`⏭️ Skipping cron initialization on PM2 Instance: ${PM2_INSTANCE_ID}, PID: ${process.pid}`);
}