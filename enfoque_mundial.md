# Enfoque Mundialista - Chalaca (Mayo 2026)

Este documento describe el enfoque estratégico y las adaptaciones necesarias en el motor de predicciones de Chalaca (`analysisEngine.js`) y en el ranking Elo (`eloRating.js`) para soportar la Copa del Mundo (`fifa.world`).

---

## 1. Limitaciones Técnicas del Sistema Actual

1. **Ausencia de Elo Inicial para Selecciones:**
   * En `src/services/eloRating.js`, los diccionarios de Elo iniciales (`PERU_INITIAL_ELO` e `INTERNATIONAL_INITIAL_ELO`) contienen únicamente clubes. 
   * Las selecciones nacionales comenzarán con el Elo por defecto (`1500`), anulando la precisión del modelo Elo (30% del peso en la predicción combinada).
2. **Volumen y Antigüedad de la Data de Forma:**
   * La forma reciente (`homeForm`, `awayForm`) toma hasta los últimos 15 partidos. En selecciones, esto abarca hasta 2 años de antigüedad, mezclando amistosos irrelevantes con partidos oficiales críticos.
3. **Efecto de Campo Neutral:**
   * El sistema calcula ventajas de localía (`ELO_HOME_BONUS = 80` puntos y boosts para local). En la Copa del Mundo, todos los partidos son en campo neutral (excepto para el país anfitrión).
4. **Sesgo de Confederación (Confederation Bias):**
   * El promedio de goles anotados/recibidos en eliminatorias locales no es comparable entre confederaciones (UEFA, CONMEBOL, AFC, CAF, CONCACAF) debido a la asimetría de rivales.

---

## 2. Ajustes Propuestos

### A. Diccionario de Elo de Selecciones (`WORLD_CUP_INITIAL_ELO`)
* Crear un nuevo diccionario pre-calculado con los ratings de Elo reales de las selecciones clasificadas (basado en rankings de *eloratings.net* antes del torneo).
* Fusionar estos valores en `getTeamElo`.

### B. Ventana de Histórico Acortada y Filtrada
* Limitar la ventana de análisis para `fifa.world` a los **últimos 6 partidos oficiales**.
* Penalizar o descontar los partidos amistosos en el cálculo de promedios de goles (peso de 0.4 - 0.5 vs 1.0 de un partido oficial).

### C. Bypass de Localía (Sede Neutral)
* Si la liga es `fifa.world`, forzar `aIsHome = false` para el cálculo de Elo y anular los boosts de localía en la generación de picks, excepto si juega el anfitrión.

### D. Ajuste por Fuerza de Confederación
* Implementar multiplicadores de goles según la confederación del equipo para nivelar los lambdas de Poisson y Dixon-Coles en cruces intercontinentales.

---

## 3. Archivos a Modificar

* `src/services/eloRating.js` (Rating inicial de selecciones, lógica de consulta).
* `src/services/analysisEngine.js` (Bypass de campo neutral, ventana de forma de 6 partidos y filtros de amistosos).
* `backend/adapters/espnAdapter.js` (Verificación de consistencia del histórico traído por ESPN para selecciones).
