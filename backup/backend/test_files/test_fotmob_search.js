const axios = require('axios');
async function testFotmob() {
  try {
    // Search for Napoli vs Bologna match from today
    const res = await axios.get('https://www.fotmob.com/api/search/suggest?term=Napoli%20Bologna', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    console.log('Search Data:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
testFotmob();
