const fotmobAdapter = require('./backend/adapters/fotmobAdapter.js');

async function test() {
  const date = '20260528';
  console.log('Date:', date);
  const fixtures = await fotmobAdapter.getFixtures(date);
  if (!fixtures || fixtures.length === 0) {
    console.log('No fixtures found');
    return;
  }
  
  // Find a match that likely has odds (e.g. from a major league or just any match with an ID)
  let detail = null;
  for (let f of fixtures) {
    detail = await fotmobAdapter.getMatchDetail(f.id);
    if (detail && detail.odds) {
      console.log('Found match with odds:', f.id, f.home?.name, 'vs', f.away?.name);
      console.log(JSON.stringify(detail.odds, null, 2));
      break;
    }
  }
  if (!detail || !detail.odds) console.log('No match with odds found.');
}

test().catch(console.error);
