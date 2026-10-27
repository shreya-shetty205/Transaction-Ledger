const { createClient } = require('@supabase/supabase-js');
const config = require('./env');

let supabase;

if (config.supabaseUrl && config.supabaseKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
} else {
  // Fallback dummy client for environments prior to credentials setup
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

module.exports = supabase;
