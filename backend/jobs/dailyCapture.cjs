#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * CHALACA — dailyCapture.cjs
 * ═══════════════════════════════════════════════════════════════════
 * Script standalone para GitHub Actions CRON.
 * Se ejecuta diariamente a las 08:00 AM hora Perú (13:00 UTC).
 *
 * Flujo:
 *   1. Obtiene todos los fixtures del día desde ESPN (sin servidor)
 *   2. Para cada partido, obtiene el summary enriquecido con cuotas
 *   3. Guarda las cuotas interceptadas en Supabase (tabla analysis_cache)
 *   4. Ejecuta el motor de análisis y guarda picks en daily_snapshots
 *
 * Uso:
 *   SUPABASE_URL=xxx SUPABASE_KEY=yyy node backend/jobs/dailyCapture.cjs
 * ═══════════════════════════════════════════════════════════════════
 */

// Polyfill
if (typeof File === 'undefined') { global.File = require('buffer').File; }

require('dotenv').config({ path: __dirname + '/../.env' });

const { createClient } = require('@supabase/supabase-js');

// ── Validar credenciales ────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ FATAL: Faltan SUPABASE_URL o SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Imports del adaptador ESPN ──────────────────────────────────────
const {
  getTodayFixtures,
  getEnrichedSummary,
  getTeamSchedule,
  getMatchSummary,
  ALLOWED_LEAGUES,
} = require('../adapters/espnAdapter');

// ── Fecha actual (Peru / UTC-5) ─────────────────────────────────────
function getTodayPeru() {
  const now = new Date();
  // Offset para UTC-5 (Perú)
  const peruTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return peruTime.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ── Utilidades ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(emoji, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${emoji} ${msg}`);
}

// ── Guardar cuotas interceptadas ────────────────────────────────────
async function saveOdds(eventId, odds) {
  if (!odds) return;
  try {
    const key = `odds_${eventId}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
    await supabase
      .from('analysis_cache')
      .upsert(
        { event_id: key, data: odds, match_state: 'odds', expires_at: expiresAt },
        { onConflict: 'event_id' }
      );
    log('💾', `Cuotas guardadas: ${key}`);
  } catch (err) {
    log('⚠️', `Error guardando cuotas ${eventId}: ${err.message}`);
  }
}

// ── Guardar snapshot de predicción ──────────────────────────────────
async function saveSnapshot(date, fixture, enriched, analysisData) {
  try {
    const row = {
      snapshot_date: date,
      event_id: String(fixture.fixture.id),
      home_team: fixture.teams.home.name || 'Unknown',
      away_team: fixture.teams.away.name || 'Unknown',
      league: fixture.league.name || 'Unknown',
      predictions: analysisData?.picks || [],
      odds_snapshot: enriched?.marketOdds || null,
      analysis_data: {
        marketInsight: analysisData?.marketInsight || null,
        marketOdds: enriched?.marketOdds || null,
        homeForm: analysisData?.homeForm || null,
        awayForm: analysisData?.awayForm || null,
        matchStandings: analysisData?.matchStandings || null,
      },
    };

    const { error } = await supabase
      .from('daily_snapshots')
      .upsert(row, { onConflict: 'snapshot_date,event_id' });

    if (error) {
      log('⚠️', `Error guardando snapshot ${fixture.fixture.id}: ${error.message}`);
    } else {
      log('📸', `Snapshot: ${fixture.teams.home.name} vs ${fixture.teams.away.name} (${fixture.league.name})`);
    }
  } catch (err) {
    log('❌', `Error snapshot ${fixture.fixture.id}: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  EJECUCIÓN PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
async function main() {
  const today = getTodayPeru();
  log('🚀', `═══ CHALACA Daily Capture — ${today} ═══`);
  log('📡', `Supabase: ${SUPABASE_URL.slice(0, 30)}...`);

  // 1. Obtener todos los partidos del día
  log('⚽', 'Obteniendo fixtures del día...');
  let fixtures;
  try {
    fixtures = await getTodayFixtures();
  } catch (err) {
    log('❌', `Error obteniendo fixtures: ${err.message}`);
    process.exit(1);
  }

  if (!fixtures || fixtures.length === 0) {
    log('📭', 'No hay partidos hoy. Finalizando.');
    process.exit(0);
  }

  log('📋', `${fixtures.length} partidos encontrados en ${Object.keys(ALLOWED_LEAGUES).length} ligas`);

  // 2. Filtrar solo partidos que aún no han empezado (NS = Not Started)
  const upcomingFixtures = fixtures.filter(f => {
    const status = f.fixture?.status?.short;
    return status === 'NS' || !status; // NS o sin estado = no ha empezado
  });

  log('🎯', `${upcomingFixtures.length} partidos pendientes (pre-match)`);

  if (upcomingFixtures.length === 0) {
    log('📭', 'Todos los partidos ya empezaron o terminaron. Finalizando.');
    process.exit(0);
  }

  // 3. Para cada partido, obtener el summary enriquecido con cuotas
  let captured = 0;
  let failed = 0;
  let oddsFound = 0;

  for (let i = 0; i < upcomingFixtures.length; i++) {
    const fixture = upcomingFixtures[i];
    const eventId = fixture.fixture.id;
    const matchLabel = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;

    log('🔍', `[${i + 1}/${upcomingFixtures.length}] Procesando: ${matchLabel}`);

    try {
      // 3a. Obtener summary enriquecido (incluye cuotas de pickcenter)
      const enriched = await getEnrichedSummary(eventId);

      if (!enriched) {
        log('⚠️', `  No se pudo obtener summary para ${eventId}`);
        failed++;
        await sleep(500);
        continue;
      }

      // 3b. Interceptar y guardar cuotas
      if (enriched.marketOdds) {
        await saveOdds(eventId, enriched.marketOdds);
        oddsFound++;
      } else {
        log('⚠️', `  Sin cuotas disponibles para ${matchLabel}`);
      }

      // 3c. Guardar snapshot básico con datos disponibles
      // Nota: No ejecutamos el motor completo aquí para evitar timeouts.
      // El snapshot guarda: cuotas, datos base, y liga.
      // La auditoría luego usa estas cuotas para recalcular con el motor.
      await saveSnapshot(today, fixture, enriched, {
        picks: [], // Los picks se calculan en el frontend/auditoría con las cuotas guardadas
        marketInsight: null,
        marketOdds: enriched.marketOdds,
        homeForm: null,
        awayForm: null,
        matchStandings: null,
      });

      captured++;

      // 3d. Pausa entre requests para no saturar ESPN
      await sleep(1000);

    } catch (err) {
      log('❌', `  Error procesando ${matchLabel}: ${err.message}`);
      failed++;
      await sleep(500);
    }
  }

  // 4. Resumen final
  log('', '');
  log('📊', '═══ RESUMEN ═══');
  log('✅', `Capturados: ${captured}/${upcomingFixtures.length}`);
  log('🎰', `Con cuotas: ${oddsFound}`);
  if (failed > 0) log('❌', `Fallidos: ${failed}`);
  log('🏁', `Daily Capture finalizado — ${today}`);

  // Exit con código 0 si al menos algo se capturó, 1 si todo falló
  process.exit(captured > 0 ? 0 : 1);
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
