const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://site.api.espn.com/apis/site/v2/sports/soccer/per.1/scoreboard');
    const events = res.data.events || [];
    console.log('Total events:', events.length);
    events.forEach(e => {
      const comp = e.competitions[0];
      const state = comp?.status?.type?.state;
      const home = comp?.competitors?.find(c => c.homeAway === 'home');
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const homeScore = home?.score;
      const awayScore = away?.score;
      console.log(
        home?.team?.displayName + ' vs ' + away?.team?.displayName +
        ' | state=' + state +
        ' | clock=' + comp?.status?.displayClock +
        ' | period=' + comp?.status?.period +
        ' | status=' + comp?.status?.type?.description +
        ' | score=' + homeScore + '-' + awayScore
      );
    });

    // Also test the live endpoint
    console.log('\n--- Testing /api/fixtures/live ---');
    const liveRes = await axios.get('http://localhost:3001/api/fixtures/live');
    console.log('Live fixtures count:', (liveRes.data.data || []).length);
    (liveRes.data.data || []).forEach(f => {
      console.log(
        f.teams.home.name + ' vs ' + f.teams.away.name +
        ' | status=' + f.fixture.status.short +
        ' | elapsed=' + f.fixture.status.elapsed +
        ' | score=' + f.goals.home + '-' + f.goals.away
      );
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
