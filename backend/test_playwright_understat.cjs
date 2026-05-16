const { chromium } = require('playwright-chromium');

async function scrapeUnderstatWithBrowser() {
  const teamName = "Real Madrid";
  const season = "2024";
  const slug = teamName.replace(/ /g, '_');
  const url = `https://understat.com/team/${encodeURIComponent(slug)}/${season}`;

  console.log(`🚀 Iniciando navegador Chromium para Understat...`);
  console.log(`📡 Navegando a: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Vamos a la página y esperamos a que cargue
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log("⏳ Página cargada. Extrayendo variables globales (datesData)...");

    // Understat inyecta variables globales en 'window'. 
    // En lugar de usar Regex, le pedimos al navegador que evalúe la variable directamente.
    const datesData = await page.evaluate(() => {
      // Intentar obtener la variable si existe en el contexto de la ventana
      if (typeof window !== 'undefined' && window.datesData) {
        return window.datesData;
      }
      // Alternativa: buscar en todos los scripts si no está en window directamente
      let data = null;
      document.querySelectorAll('script').forEach(el => {
        const text = el.innerHTML;
        if (text.includes('datesData')) {
          const m = text.match(/var datesData\s*=\s*JSON\.parse\('([^']+)'\)/);
          if (m) {
            const decoded = m[1].replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
            try { data = JSON.parse(decoded); } catch(e) {}
          }
        }
      });
      return data;
    });

    if (datesData && datesData.length > 0) {
      console.log(`✅ ¡Éxito! Se obtuvieron ${datesData.length} partidos usando Playwright.`);
      
      const matches = datesData.slice(-5).map(m => ({
        date: m.datetime,
        opponent: m.h_team === slug.replace(/_/g, ' ') ? m.a_team : m.h_team,
        isHome: m.h_team === slug.replace(/_/g, ' '),
        result: m.result,
        goals: parseInt(m.scored),
        goalsAgainst: parseInt(m.missed),
        xG: parseFloat(m.xG).toFixed(2),
        xGA: parseFloat(m.xGA).toFixed(2),
      }));

      console.log("\n📊 Muestra de los últimos 5 partidos (Formato Motor):");
      console.table(matches);
    } else {
      console.log("❌ No se encontró 'datesData' en la página renderizada. Posible bloqueo anti-bot.");
    }
  } catch (error) {
    console.error("❌ Error durante la navegación:", error.message);
  } finally {
    await browser.close();
  }
}

scrapeUnderstatWithBrowser();
