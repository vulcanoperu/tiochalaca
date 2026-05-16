-- ═══════════════════════════════════════════════════════════════
--  MIGRACIÓN: value_bet_discoveries
--  Tabla para guardar cada Value Bet en el momento exacto en que
--  el algoritmo de Chalaca la detecta por primera vez.
--
--  Campos clave:
--    - fixture_id + selection → unicidad (no se repite el mismo pick)
--    - odds_at_detection      → cuota en el momento del hallazgo
--    - detected_at            → timestamp exacto del descubrimiento
--    - match_date             → para filtrar por jornada
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS value_bet_discoveries (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id        text NOT NULL,
  home_team         text,
  away_team         text,
  league            text,
  market            text,
  selection         text NOT NULL,
  probability       int,
  odds_at_detection float,
  argument          text,
  match_date        date DEFAULT CURRENT_DATE,
  detected_at       timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),

  -- Evitar duplicados: mismo partido + misma selección
  CONSTRAINT value_bet_discoveries_unique UNIQUE (fixture_id, selection)
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_vbd_match_date ON value_bet_discoveries (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_vbd_detected_at ON value_bet_discoveries (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_vbd_fixture_id  ON value_bet_discoveries (fixture_id);

-- Comentario descriptivo
COMMENT ON TABLE value_bet_discoveries IS
  'Registro histórico de Value Bets detectadas por el motor de análisis en el momento exacto de su descubrimiento.';
