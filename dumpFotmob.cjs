const axios = require('axios');
const fs = require('fs');

async function dump() {
  const res = await axios.get('https://www.fotmob.com/?date=20260528', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  const match = res.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (match) {
    fs.writeFileSync('fotmob_dump.json', match[1]);
    console.log('Dumped to fotmob_dump.json');
  } else {
    console.log('No next data found');
  }
}
dump().catch(console.error);
