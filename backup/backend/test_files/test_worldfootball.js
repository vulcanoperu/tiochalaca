if (typeof File === 'undefined') { global.File = require('buffer').File; }
const axios = require('axios');
const cheerio = require('cheerio');

async function testWorldFootball() {
  try {
    const q = encodeURIComponent('Napoli Bologna');
    const res = await axios.get(`https://www.worldfootball.net/search/?sq=${q}&bereich=spiele`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(res.data);
    const firstMatch = $('.standard_tabelle a').first().attr('href');
    if (firstMatch) {
      const matchUrl = `https://www.worldfootball.net${firstMatch}`;
      console.log('Match URL:', matchUrl);
      const matchRes = await axios.get(matchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $m = cheerio.load(matchRes.data);
      // the referee is usually in a table cell next to "Referee:" or similar
      const htmlText = $m('body').text();
      const refMatch = htmlText.match(/Referee:\s*([^\n]+)/);
      console.log('Referee:', refMatch ? refMatch[1].trim() : 'Not found');
    } else {
      console.log('No matches found');
    }
  } catch (e) {
    console.error(e.message);
  }
}
testWorldFootball();
