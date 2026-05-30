const fotmobAdapter = require('./backend/adapters/fotmobAdapter.js');

async function test() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  console.log('Today:', today);
  const fixtures = await fotmobAdapter.getFixtures(today);
  if (fixtures.length === 0) {
    console.log('No fixtures found');
    return;
  }
  const matchId = fixtures[0].id;
  console.log('Testing matchId:', matchId);
  const detail = await fotmobAdapter.getMatchDetail(matchId);
  console.log(JSON.stringify(detail.odds, null, 2));
}

test().catch(console.error);
