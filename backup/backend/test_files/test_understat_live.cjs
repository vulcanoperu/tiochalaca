const axios = require('axios');
const cheerio = require('cheerio');

async function validateUnderstat() {
  const teamName = "Real Madrid";
  const season = "2024";
  const slug = teamName.replace(/ /g, '_');
  const url = `https://understat.com/team/${encodeURIComponent(slug)}/${season}`;

  console.log(`📡 Probando scraping de Understat para: ${teamName} (${url})`);

  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(html);

    let datesData = null;
    let foundScript = false;

    $('script').each((_, el) => {
      const text = $(el).html() || '';
      if (text.includes('datesData')) {
        foundScript = true;
        // Esta es la regex exacta que tienes en server.js:
        const m = text.match(/var datesData\s*=\s*JSON\.parse\('(.+?)'\)/s);
        if (m) {
          try {
            // Understat codifica caracteres como \x27 para comillas
            // El server.js hace esto:
            const rawJson = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
            
            // Pero Understat usa a menudo codificación hexadecimal (\x..)
            // Vamos a probar primero como lo hace tu server.js
            try {
               datesData = JSON.parse(rawJson);
            } catch (e) {
               console.log("⚠️ Falló JSON.parse directo (estilo server.js), intentando decodificación hexadecimal...");
               // Intento de decodificación más robusto si el del server falla
               const decoded = JSON.parse(
                 JSON.parse(`"${m[1]}"`) // Esto resuelve los \x27 etc
               );
               datesData = decoded;
            }
          } catch (err) {
            console.error("❌ Error al parsear JSON:", err.message);
          }
        }
      }
    });

    if (!foundScript) {
      console.log("❌ No se encontró ningún script que contenga 'datesData'.");
    } else if (!datesData) {
      console.log("❌ Se encontró el script pero la Regex falló o el JSON es inválido.");
    } else {
      console.log(`✅ ¡FUNCIONA! Se extrajeron ${datesData.length} partidos.`);
      const last = datesData[datesData.length - 1];
      console.log(`Último dato: ${last.h_team} vs ${last.a_team} | xG: ${last.xG}`);
    }

  } catch (err) {
    console.error("❌ Error de red/petición:", err.message);
  }
}

validateUnderstat();
