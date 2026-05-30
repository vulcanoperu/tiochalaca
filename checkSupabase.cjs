const supabase = require('./backend/database.js');

async function check() {
  const { data, error } = await supabase
    .from('analysis_cache')
    .select('data, event_id, match_state')
    .limit(50);
    
  if (error) {
    console.error(error);
    return;
  }
  
  for (let row of data) {
    if (row.data && row.data.marketOdds && row.data.marketOdds.fotmob) {
       console.log('Found fotmob odds placeholder in:', row.event_id);
    }
  }
  console.log('Done checking 50 rows');
}

check().catch(console.error);
