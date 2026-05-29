if (typeof File === 'undefined') { global.File = require('buffer').File; }
const axios = require('axios');
const cheerio = require('cheerio');

async function testBesoccer() {
  try {
    const q = encodeURIComponent('Napoli vs Bologna 2024');
    const res = await axios.get(`https://www.besoccer.com/search?q=${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(res.data);
    const firstMatch = $('.match-link').first().attr('href');
    if (firstMatch) {
      console.log('Match URL:', firstMatch);
      const matchRes = await axios.get(firstMatch, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' }
      });
      const $m = cheerio.load(matchRes.data);
      const referee = $m('.referee').text().trim();
      const stadium = $m('.stadium').text().trim();
      console.log('Referee:', referee);
      console.log('Stadium:', stadium);
    } else {
      console.log('No matches found on Besoccer');
    }
  } catch (e) {
    console.error(e.message);
  }
}
testBesoccer();
