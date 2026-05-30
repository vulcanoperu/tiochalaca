const axios = require('axios');

async function testSofa() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Fetching SofaScore schedule for', today);
    const res = await axios.get(`https://api.sofascore.com/api/v1/sport/football/scheduled-events/${today}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    
    const events = res.data.events;
    if (!events || events.length === 0) {
      console.log('No events');
      return;
    }
    
    const match = events[0];
    console.log(`Match: ${match.homeTeam.name} vs ${match.awayTeam.name} (ID: ${match.id})`);
    
    const oddsRes = await axios.get(`https://api.sofascore.com/api/v1/event/${match.id}/odds/1/all`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    
    console.log('Odds:', JSON.stringify(oddsRes.data, null, 2));
  } catch (err) {
    console.error(err.message);
    if (err.response) console.error(err.response.status);
  }
}

testSofa().catch(console.error);
