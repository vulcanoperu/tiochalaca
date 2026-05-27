-- =====================================================================
-- CHALACA — Tabla de Snapshots Diarios de Predicciones
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================================
-- Esta tabla almacena la "foto de la mañana" generada por el CRON
-- de GitHub Actions. Contiene todas las predicciones del día con
-- cuotas vivas, antes de que ESPN las borre.
--
-- La auditoría de la tarde/noche usa estos datos como fuente de verdad
-- en lugar de recalcular con cuotas ya borradas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id            SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,                    -- Fecha del snapshot (YYYY-MM-DD)
  event_id      TEXT NOT NULL,                    -- ID del partido ESPN
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  league        TEXT NOT NULL,
  predictions   JSONB NOT NULL,                   -- Picks generados por el motor
  odds_snapshot JSONB,                            -- Cuotas capturadas en el momento
  analysis_data JSONB,                            -- Datos completos del análisis
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, event_id)                 -- Un solo snapshot por partido por día
);

-- Índice para consultas por fecha (uso principal de la auditoría)
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date
  ON daily_snapshots (snapshot_date);

-- Índice para buscar un partido específico
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_event
  ON daily_snapshots (event_id);

-- Política de acceso: solo el backend (service_role) puede escribir
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on daily_snapshots"
  ON daily_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- Limpieza automática de snapshots antiguos (>90 días)
-- Ejecutar periódicamente o como cron en Supabase
-- =====================================================================
-- DELETE FROM daily_snapshots WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';
