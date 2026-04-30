const axios = require('axios');

async function test() {
  console.log('=== Test de velocidad del endpoint /api/fixtures/live ===\n');
  
  const start = Date.now();
  const res = await axios.get('http://localhost:3001/api/fixtures/live');
  const elapsed = Date.now() - start;
  
  const data = res.data.data || [];
  console.log('Tiempo de respuesta:', elapsed + 'ms');
  console.log('Partidos en vivo:', data.length);
  
  data.forEach(f => {
    console.log(
      '  ' + f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name +
      ' | ' + f.fixture.status.short + ' ' + f.fixture.status.elapsed + "'" +
      ' | ' + f.league.name
    );
  });

  // Test 2: verificar que es diferente a lo que devuelve /api/fixtures/date/
  console.log('\n=== Comparando con /api/fixtures/date/ ===');
  const today = new Date().toLocaleDateString('en-CA');
  const res2 = await axios.get('http://localhost:3001/api/fixtures/date/' + today);
  const dateData = res2.data.data || [];
  const dateLive = dateData.filter(f => ['1H', '2H', 'HT', 'ET'].includes(f.fixture?.status?.short));
  
  console.log('Partidos en vivo via /date/:', dateLive.length);
  dateLive.forEach(f => {
    console.log(
      '  ' + f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name +
      ' | ' + f.fixture.status.short + ' ' + f.fixture.status.elapsed + "'" +
      ' | fromCache=' + res2.data.fromCache
    );
  });
}

test().catch(e => console.error('Error:', e.message));
