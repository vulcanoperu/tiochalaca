const axios = require('axios');
async function testSofascore() {
  try {
    const res = await axios.get('https://api.sofascore.com/api/v1/search/events?q=Napoli%20Bologna', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    console.log('Search Data:', res.data.results?.[0]);
  } catch (e) {
    console.error(e.message);
  }
}
testSofascore();
