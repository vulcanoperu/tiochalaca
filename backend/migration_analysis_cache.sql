-- =====================================================================
-- CHALACA — Tabla de Caché Persistente de Análisis de Partidos
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================================
-- Esta tabla almacena los resultados del análisis ESPN para partidos
-- terminados (state: 'post'). Los datos son inmutables una vez el
-- partido acaba, por lo que el TTL es de 30 días.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analysis_cache (
  event_id    TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  match_state TEXT NOT NULL DEFAULT 'post',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Índice para limpiar registros expirados eficientemente
CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires 
  ON analysis_cache (expires_at);

-- Política de acceso: solo el backend (service_role) puede escribir
-- El frontend NO accede a esta tabla directamente
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON analysis_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- Limpieza automática de registros expirados (opcional)
-- Ejecutar periódicamente o como cron en Supabase
-- =====================================================================
-- DELETE FROM analysis_cache WHERE expires_at < NOW();
