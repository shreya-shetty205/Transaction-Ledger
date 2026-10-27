const app = require('./app');
const config = require('./config/env');

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Transaction Ledger API running on port ${PORT}`);
  console.log(`📡 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Local URL:   http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);

  if (!config.isConfigured) {
    console.log('----------------------------------------------------');
    console.log('⚠️  Notice: SUPABASE_URL or SUPABASE_KEY is missing or empty in .env');
    console.log('👉 Please add your Supabase credentials to .env');
    console.log('👉 Execute sql/schema.sql in your Supabase SQL Editor');
  } else {
    console.log('✅ Supabase configuration detected');
  }
  console.log('====================================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
