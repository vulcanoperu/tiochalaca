const axios = require('axios');

async function testApi() {
  try {
    const res = await axios.get('https://www.fotmob.com/api/matches?date=20260530', {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });
    console.log('Matches length:', res.data.leagues?.length);
    if (res.data.leagues && res.data.leagues.length > 0) {
        const match = res.data.leagues[0].matches[0];
        console.log('Found match:', match.id, match.home?.name, 'vs', match.away?.name);
        
        // Fetch match details
        const detailRes = await axios.get(`https://www.fotmob.com/api/matchDetails?matchId=${match.id}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        console.log('Has odds?', !!detailRes.data.content?.odds);
        if (detailRes.data.content?.odds) {
            console.log(JSON.stringify(detailRes.data.content.odds, null, 2));
        }
    }
  } catch (err) {
    console.error(err.message);
  }
}

testApi().catch(console.error);
