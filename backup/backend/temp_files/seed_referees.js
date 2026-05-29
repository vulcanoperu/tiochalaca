require('dotenv').config({ path: __dirname + '/.env' });
const { getTodayFixtures, getEnrichedSummary } = require('./espnAdapter.js');
const supabase = require('./database.js');

async function seedReferees() {
  console.log('Obteniendo partidos recientes para poblar base de datos de árbitros...');
  const fixtures = await getTodayFixtures(); // Obtiene de todas las ligas
  console.log(`Se encontraron ${fixtures.length} partidos recientes.`);
  
  const completed = fixtures.filter(f => f.fixture.status.short === 'FT');
  console.log(`Procesando ${completed.length} partidos finalizados...`);

  let count = 0;
  for (const f of completed) {
    try {
      const data = await getEnrichedSummary(f.fixture.id);
      if (!data || !data.referee) continue;
      
      const referee = data.referee;
      const yellow = (data.stats.home.yellowCards || 0) + (data.stats.away.yellowCards || 0);
      const red = (data.stats.home.redCards || 0) + (data.stats.away.redCards || 0);

      // Usar analysis_cache como workaround para no crear tablas manualmente
      const refKey = `referee_${referee}`;
      
      // Obtener actual
      const { data: currentCache } = await supabase
        .from('analysis_cache')
        .select('data')
        .eq('event_id', refKey)
        .single();
      
      let refData = currentCache ? currentCache.data : { name: referee, matches: 0, yellow: 0, red: 0, avgYellow: 0, avgRed: 0, processed_matches: [] };
      
      // Evitar duplicados
      if (!refData.processed_matches) refData.processed_matches = [];
      if (refData.processed_matches.includes(f.fixture.id)) continue;

      refData.matches += 1;
      refData.yellow += yellow;
      refData.red += red;
      refData.avgYellow = +(refData.yellow / refData.matches).toFixed(2);
      refData.avgRed = +(refData.red / refData.matches).toFixed(2);
      refData.processed_matches.push(f.fixture.id);

      const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 3_600_000).toISOString();
      await supabase.from('analysis_cache').upsert(
        { event_id: refKey, data: refData, match_state: 'referee_stats', expires_at: expiresAt },
        { onConflict: 'event_id' }
      );
      
      console.log(`[+] Árbitro actualizado: ${referee} | Partidos: ${refData.matches} | Promedio Amarillas: ${refData.avgYellow}`);
      count++;
    } catch (err) {
      console.error(`Error procesando partido ${f.fixture.id}:`, err.message);
    }
  }
  console.log(`Semilla completada. Se actualizaron estadísticas de ${count} apariciones de árbitros.`);
}

seedReferees().then(() => process.exit(0)).catch(console.error);
