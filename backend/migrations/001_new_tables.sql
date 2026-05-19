-- =====================================================================
-- CHALACA — Migración 001: Tablas nuevas para reestructuración
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Fecha: 2026-05-16
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. version_log — Bitácora de versiones del motor (Fase 1: Training)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS version_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version             TEXT NOT NULL,
  fecha               TIMESTAMPTZ DEFAULT NOW(),
  cambios             TEXT,
  aciertos_porcentaje NUMERIC,
  ligas_probadas      TEXT[],
  partidos_evaluados  INTEGER,
  metadata            JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_version_log_fecha
  ON version_log (fecha DESC);

COMMENT ON TABLE version_log IS
  'Bitácora de versiones del motor de predicciones. Cada fila es un snapshot de rendimiento tras un ajuste.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. validation_picks — Picks de validación privados (Fase 2)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validation_picks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_motor    TEXT,
  match_id         TEXT NOT NULL,
  home_team        TEXT,
  away_team        TEXT,
  league           TEXT,
  market           TEXT NOT NULL,
  prediction       TEXT NOT NULL,
  confidence       NUMERIC,
  our_odds         NUMERIC,
  bookmaker_odds   NUMERIC,
  kelly_fraction   NUMERIC,
  argument         TEXT,
  generated_at     TIMESTAMPTZ DEFAULT NOW(),
  match_date       DATE,
  result           TEXT,
  actual_score     TEXT,
  is_correct       BOOLEAN,
  settled_at       TIMESTAMPTZ,
  CONSTRAINT validation_picks_unique UNIQUE (match_id, market, prediction)
);

CREATE INDEX IF NOT EXISTS idx_vp_match_date
  ON validation_picks (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_vp_version
  ON validation_picks (version_motor);

COMMENT ON TABLE validation_picks IS
  'Picks generados en modo paper-trading (no publicados). Se validan contra resultados reales para calibrar el motor.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. live_alerts — Value bets en vivo con Supabase Realtime
-- NOTA: Se elimina y recrea para asegurar esquema correcto.
-- ─────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS live_alerts;

CREATE TABLE live_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         TEXT NOT NULL,
  home_team        TEXT,
  away_team        TEXT,
  league           TEXT,
  market           TEXT NOT NULL,
  our_probability  NUMERIC NOT NULL,
  bookmaker_odds   NUMERIC,
  ev_percentage    NUMERIC,
  minute           INTEGER,
  match_score      TEXT,
  detected_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active        BOOLEAN DEFAULT TRUE,
  expired_at       TIMESTAMPTZ,
  CONSTRAINT live_alerts_unique UNIQUE (match_id, market, minute)
);

CREATE INDEX idx_la_active
  ON live_alerts (is_active, detected_at DESC)
  WHERE is_active = TRUE;
CREATE INDEX idx_la_match
  ON live_alerts (match_id);

COMMENT ON TABLE live_alerts IS
  'Alertas de value bets detectadas en vivo. Supabase Realtime notifica al frontend.';

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE live_alerts;

-- ─────────────────────────────────────────────────────────────────────
-- 4. matches_cache — Caché de partidos para carga rápida del frontend
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches_cache (
  id          TEXT PRIMARY KEY,
  league      TEXT NOT NULL,
  home_team   TEXT NOT NULL,
  away_team   TEXT NOT NULL,
  match_date  TIMESTAMPTZ NOT NULL,
  status      TEXT DEFAULT 'NS',
  home_score  INTEGER,
  away_score  INTEGER,
  data        JSONB DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mc_date
  ON matches_cache (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_mc_league
  ON matches_cache (league);
CREATE INDEX IF NOT EXISTS idx_mc_updated
  ON matches_cache (updated_at DESC);

COMMENT ON TABLE matches_cache IS
  'Caché de partidos del día para que el frontend cargue en <2s sin esperar al scraper de ESPN.';

-- ─────────────────────────────────────────────────────────────────────
-- RLS: Solo service_role (backend) puede escribir
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE version_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON version_log
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON validation_picks
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON live_alerts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON matches_cache
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================================
-- FIN DE MIGRACIÓN 001
-- =====================================================================
