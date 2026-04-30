require('dotenv').config();
const axios = require('axios');
const apiSports = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: {
    'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
    'x-rapidapi-host': 'v3.football.api-sports.io'
  }
});

async function test() {
  try {
    const r = await apiSports.get('/teams', { params: { search: 'Always Ready' } });
    const teamId = r.data.response[0].team.id;
    console.log('Team ID:', teamId);
    
    const r2 = await apiSports.get('/fixtures', { params: { team: teamId, last: 3 } });
    r2.data.response.forEach(f => {
       console.log('Match:', f.teams.home.name, 'vs', f.teams.away.name, f.league.name);
       console.log('Events length:', f.events ? f.events.length : 0);
       if(f.events) {
          const goals = f.events.filter(e => e.type === 'Goal');
          console.log('Goals:', goals.map(g => g.time.elapsed + "'"));
       }
    });
  } catch(e) { console.log(e.message); }
}
test();
