const axios = require('axios');

async function test1xBet() {
  try {
    // 1. Get all football matches
    // sports=1 is football
    const res = await axios.get('https://1xbet.com/LineFeed/Get1x2_VZip?sports=1&count=50&mode=4', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const matches = res.data.Value;
    if (!matches || matches.length === 0) {
      console.log('No matches');
      return;
    }

    const match = matches[0];
    console.log(`Match: ${match.O1} vs ${match.O2} (ID: ${match.I})`);
    
    // The events are in 'E' array inside the match
    // For 1X2, usually T=1, 2, 3
    console.log('Odds Events:', match.E.filter(e => e.T === 1 || e.T === 2 || e.T === 3));

  } catch (err) {
    console.error(err.message);
  }
}

test1xBet().catch(console.error);
