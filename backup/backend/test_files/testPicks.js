const BASE = 'http://localhost:3001';

async function test() {
  // 1. Login
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({username:'chalaca', password:'chalaca'})
  });
  const { token } = await loginRes.json();
  console.log('✅ Login OK - Token obtenido');

  // 2. Guardar un pick
  const pickData = {
    fixtureId: 'test-123',
    home: 'Real Madrid',
    away: 'Barcelona',
    date: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    picks: [{ market: 'RESULTADO', selection: 'Real Madrid', probability: 72, tier: '🔥', status: 'PENDING' }]
  };
  const saveRes = await fetch(BASE + '/api/picks', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify(pickData)
  });
  const saved = await saveRes.json();
  console.log('✅ Pick guardado:', saved);

  // 3. Leer picks
  const getRes = await fetch(BASE + '/api/picks', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  const picks = await getRes.json();
  console.log('✅ Picks recuperados:', picks.length, 'picks');
  console.log('   Primer pick home:', picks[0]?.home);
}

test().catch(e => console.error('❌ Error:', e.message));
