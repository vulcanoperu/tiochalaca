// ─────────────────────────────────────────────────────────────────
//  geminiService.js
//  Integración con Google Gemini para análisis tipster profesional
// ─────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Construye el prompt completo a partir de los datos del partido
 */
function buildPrompt(matchData) {
  const {
    homeName, awayName, leagueName, kickoff,
    homeForm, awayForm,
    homeSplit, awaySplit,
    h2hData,
    h2hMatches,
    poisson,
    injuries,
    picks,            // picks ya generados por el motor estadístico
    homeMatches,      // últimos partidos locales (max 10)
    awayMatches,      // últimos partidos visitantes (max 10)
  } = matchData;

  const fmtMatches = (matches = []) =>
    matches.slice(0, 8).map(m => {
      const isHome = m._isHome;
      const hg = m.goals?.home ?? 0;
      const ag = m.goals?.away ?? 0;
      const opp = m._opponent || '?';
      const result = m._result || '?';
      return `  • ${result} ${hg}-${ag} vs ${opp} (${isHome ? 'Local' : 'Visitante'})`;
    }).join('\n') || '  (Sin datos)';

  const fmtForm = (form, name) => form
    ? `${name}: ${form.wins}V-${form.draws}E-${form.losses}D | GF: ${form.goalsFor} | GC: ${form.goalsAgainst} | Forma: ${form.score}% (${form.label})`
    : `${name}: Sin datos`;

  const fmtH2H = (h2h) => h2h
    ? `  Local gana: ${h2h.homeWinPct}% | Empate: ${h2h.drawPct}% | Visitante gana: ${h2h.awayWinPct}%\n  Over 2.5: ${h2h.over25Pct}% | BTTS: ${h2h.bttsPct}% | Media goles: ${h2h.avgGoals} | N partidos: ${h2h.total}`
    : '  Sin historial H2H disponible';

  const fmtPicks = (picks = []) => picks.length === 0
    ? '  No hay picks estadísticos generados.'
    : picks.map(p => `  • [${p.tier}] ${p.market} → ${p.selection} (${p.probability}% | Riesgo: ${p.risk})\n    ${p.argument}`).join('\n');

  const fmtH2HMatches = (matches = []) => matches.length === 0
    ? '  (Sin partidos H2H recientes)'
    : matches.slice(0, 5).map(m => {
        const hg = m.goals?.home ?? 0;
        const ag = m.goals?.away ?? 0;
        const home = m.teams?.home?.name ?? '?';
        const away = m.teams?.away?.name ?? '?';
        const date = m.fixture?.date ? new Date(m.fixture.date).toISOString().split('T')[0] : '?';
        return `  • [${date}] ${home} ${hg}-${ag} ${away}`;
      }).join('\n');

  const fmtInjuries = (inj = []) => inj.length === 0
    ? '  Ninguna baja confirmada'
    : inj.slice(0, 6).map(i => `  • ${i.player?.name} (${i.team?.name}) - ${i.player?.reason || 'Lesión'}`).join('\n');

  const fmtSplit = (split, name) => split
    ? `${name}: Over 2.5=${split.over25Pct}% | BTTS=${split.bttsPct}% | Over 1.5=${split.over15Pct}%`
    : `${name}: Sin datos`;

  return `Eres un analista tipster deportivo profesional de élite con 15 años de experiencia en mercados de apuestas de fútbol. Tu tarea es analizar el siguiente partido y generar un informe detallado, profesional y accionable en español.

═══════════════════════════════════════════
  DATOS DEL PARTIDO
═══════════════════════════════════════════

Partido: ${homeName} vs ${awayName}
Liga: ${leagueName}
Fecha/Hora: ${kickoff}

───────────────────────────────────────────
  FORMA RECIENTE (últimos partidos)
───────────────────────────────────────────
${fmtForm(homeForm, homeName)}
${fmtForm(awayForm, awayName)}

Últimos partidos ${homeName}:
${fmtMatches(homeMatches)}

Últimos partidos ${awayName}:
${fmtMatches(awayMatches)}

───────────────────────────────────────────
  ESTADÍSTICAS CLAVE
───────────────────────────────────────────
${fmtSplit(homeSplit, homeName)}
${fmtSplit(awaySplit, awayName)}

Probabilidades Poisson:
  Local: ${poisson?.home ?? '?'}% | Empate: ${poisson?.draw ?? '?'}% | Visitante: ${poisson?.away ?? '?'}%
  λ Local: ${poisson?.lambdaHome ?? '?'} | λ Visitante: ${poisson?.lambdaAway ?? '?'}

───────────────────────────────────────────
  HISTORIAL HEAD-TO-HEAD
───────────────────────────────────────────
Estadísticas H2H:
${fmtH2H(h2hData)}

Últimos enfrentamientos directos:
${fmtH2HMatches(h2hMatches)}

───────────────────────────────────────────
  BAJAS Y LESIONES
───────────────────────────────────────────
${fmtInjuries(injuries)}

───────────────────────────────────────────
  PICKS ESTADÍSTICOS (motor propio)
───────────────────────────────────────────
${fmtPicks(picks)}

═══════════════════════════════════════════
  TU TAREA
═══════════════════════════════════════════

Eres un "Sharp Bettor" y analista táctico de élite. Tu objetivo NO es repetir los números que ya están en pantalla, sino interpretar lo que significan para el apostador.

REGLAS CRÍTICAS DE ESTILO:
1. PROHIBIDO repetir estadísticas exactas (ej. no digas "el equipo tiene 60% de over"). El usuario ya ve los números.
2. ENFOQUE TÁCTICO: Habla de estilos de juego, presión, cansancio o importancia del torneo.
3. VALOR AÑADIDO: Da consejos que un algoritmo matemático no vería.
4. TONO: Profesional, directo, de experto a experto.

Estructura de respuesta (JSON puro):
{
  "context": "Análisis del escenario del partido. ¿Qué se juegan? ¿Hay un equipo que llega 'inflado' o subestimado por los números?",
  "stats": "Lectura entre líneas de las tendencias. Ej: ¿Por qué hay goles tarde? ¿Es por fragilidad defensiva o empuje final?",
  "h2h": "La psicología del enfrentamiento. ¿Hay una paternidad histórica o un patrón táctico que se repite?",
  "injuries": "Análisis de la profundidad de plantilla. ¿Quién cubrirá la baja y cómo cambia el sistema?",
  "verdict": "Tu lectura final del partido como experto humano. ¿Dónde está la trampa o la oportunidad?",
  "picks": "2-3 consejos de apuestas de alto valor con justificación táctica.",
  "warnings": "Variables 'caóticas' que podrían arruinar el análisis (clima, arbitraje, motivación)."
}

IMPORTANTE: Responde solo el JSON crudo. Justifica todo con la data pero desde una perspectiva narrativa y de asesoría.`;
}

/**
 * Genera el análisis IA usando Gemini
 * @param {Object} matchData - Datos completos del partido
 * @returns {Promise<{text: string, cached: boolean}>}
 */
async function generateAIAnalysis(matchData) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no configurada en el servidor');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const prompt = buildPrompt(matchData);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();
  
  // Limpieza de Markdown si el modelo ignora el system prompt
  if (text.includes('```json')) {
    text = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    text = text.split('```')[1].split('```')[0].trim();
  }

  return { text, cached: false };
}

module.exports = { generateAIAnalysis };
