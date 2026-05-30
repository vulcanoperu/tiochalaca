require('dotenv').config({ path: './backend/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function createTable() {
  console.log('=== Paso 1: Crear tabla analysis_cache ===');
  
  const { error } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS analysis_cache (
        event_id    TEXT PRIMARY KEY,
        data        JSONB NOT NULL,
        match_state TEXT NOT NULL DEFAULT 'post',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires 
        ON analysis_cache (expires_at);
    `
  });

  if (error) {
    // Si rpc no existe, intentar con el REST API directamente
    console.log('RPC no disponible, intentando inserción directa...');
    
    // Verificar si la tabla existe intentando hacer un select
    const { error: selectError } = await supabase.from('analysis_cache').select('event_id').limit(1);
    
    if (selectError && selectError.code === 'PGRST205') {
      console.error('❌ La tabla analysis_cache NO EXISTE en Supabase.');
      console.error('');
      console.error('ACCIÓN REQUERIDA: Ejecuta este SQL en el SQL Editor de Supabase Dashboard:');
      console.error('─────────────────────────────────────────────────────────');
      console.error(`
CREATE TABLE IF NOT EXISTS analysis_cache (
  event_id    TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  match_state TEXT NOT NULL DEFAULT 'post',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires 
  ON analysis_cache (expires_at);

ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON analysis_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
      `);
      console.error('─────────────────────────────────────────────────────────');
    } else if (!selectError) {
      console.log('✅ La tabla analysis_cache YA EXISTE.');
    } else {
      console.error('Error inesperado:', selectError);
    }
  } else {
    console.log('✅ Tabla creada exitosamente via RPC.');
  }
}

async function testApiFootball() {
  console.log('\n=== Paso 2: Probar API-Football ===');
  
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    console.error('❌ API_FOOTBALL_KEY no encontrada en .env');
    return;
  }
  console.log(`API Key encontrada: ${key.substring(0, 8)}...`);

  const axios = require('axios');
  
  try {
    // Verificar estado de la cuenta
    const statusRes = await axios.get('https://v3.football.api-sports.io/status', {
      headers: { 'x-apisports-key': key },
      timeout: 10000
    });
    
    const account = statusRes.data.response.account;
    const requests = statusRes.data.response.requests;
    const subscription = statusRes.data.response.subscription;
    
    console.log(`✅ API-Football conectada!`);
    console.log(`   Plan: ${subscription?.plan || 'Free'}`);
    console.log(`   Peticiones hoy: ${requests?.current || 0} / ${requests?.limit_day || 100}`);
    console.log(`   Restantes: ${(requests?.limit_day || 100) - (requests?.current || 0)}`);
    
    // Probar obtener cuotas de un partido de hoy
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n=== Paso 3: Buscar partidos con cuotas para ${today} ===`);
    
    const fixturesRes = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
      headers: { 'x-apisports-key': key },
      timeout: 10000
    });
    
    const fixtures = fixturesRes.data.response;
    console.log(`   Partidos encontrados: ${fixtures.length}`);
    
    if (fixtures.length > 0) {
      // Tomar el primer partido que no sea amistoso
      const match = fixtures.find(f => !f.league.name.includes('Friendly')) || fixtures[0];
      console.log(`   Probando cuotas para: ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`);
      console.log(`   Fixture ID: ${match.fixture.id}`);
      
      const oddsRes = await axios.get(`https://v3.football.api-sports.io/odds?fixture=${match.fixture.id}`, {
        headers: { 'x-apisports-key': key },
        timeout: 10000
      });
      
      const oddsData = oddsRes.data.response;
      if (oddsData.length > 0) {
        const bookmakers = oddsData[0].bookmakers;
        console.log(`   ✅ Cuotas encontradas! (${bookmakers.length} casas de apuestas)`);
        
        // Mostrar primer bookmaker
        const bk = bookmakers[0];
        console.log(`   Casa: ${bk.name}`);
        const winnerBet = bk.bets.find(b => b.name === 'Match Winner');
        if (winnerBet) {
          console.log(`   1X2: ${winnerBet.values.map(v => `${v.value}=${v.odd}`).join(', ')}`);
        }
      } else {
        console.log('   ⚠️ No hay cuotas publicadas para este partido');
      }
    }
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    if (err.response) {
      console.error(`   Status: ${err.response.status}`);
      console.error(`   Data: ${JSON.stringify(err.response.data)}`);
    }
  }
}

async function main() {
  await createTable();
  await testApiFootball();
}

main().catch(console.error);
