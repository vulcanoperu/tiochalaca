require('dotenv').config({ path: './backend/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase
    .from('analysis_cache')
    .select('event_id, expires_at')
    .like('event_id', 'odds_%');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} odds records in analysis_cache`);
    if (data.length > 0) {
      console.log('Sample keys:', data.slice(0, 5).map(d => d.event_id));
    }
  }
}

check();
