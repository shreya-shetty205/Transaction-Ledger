const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Check and load .env, falling back to .env.example if .env does not exist or lacks credentials
const envPath = path.resolve(__dirname, '../../.env');
const examplePath = path.resolve(__dirname, '../../.env.example');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Fallback to .env.example if user pasted keys into .env.example
if (!process.env.SUPABASE_URL && fs.existsSync(examplePath)) {
  dotenv.config({ path: examplePath });
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  supabaseUrl: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : '',
  supabaseKey: process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY.trim() : '',
  nodeEnv: process.env.NODE_ENV || 'development',
  isConfigured: Boolean(
    process.env.SUPABASE_URL && 
    process.env.SUPABASE_KEY && 
    !process.env.SUPABASE_URL.includes('your-project') &&
    !process.env.SUPABASE_KEY.includes('your-supabase-key')
  )
};

module.exports = config;
