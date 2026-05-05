

const ALLOWED_LEAGUES = {
  'ecu.1': 'LigaPro (Ecuador)',
  'per.1': 'Liga 1 (Perú)',
  'bra.1': 'Brasileirão (Brasil)',
  'arg.1': 'Liga Profesional (Argentina)',
  'chi.1': 'Primera División (Chile)',
  'col.1': 'Primera A (Colombia)',
  'uru.1': 'Primera División (Uruguay)',
  'ksa.1': 'Liga Profesional Saudí (Arabia)',
  'eng.1': 'Premier League (Inglaterra)',
  'esp.1': 'LaLiga (España)',
  'ger.1': 'Bundesliga (Alemania)',
  'por.1': 'Primeira Liga (Portugal)',
  'ned.1': 'Eredivisie (Holanda)',
  'ita.1': 'Serie A (Italia)',
  'uefa.champions': 'Champions League',
  'uefa.europa': 'Europa League',
  'uefa.europa.conf': 'Conference League',
  'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana'
};

async function check() {
  const data = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=20260504').then(r=>r.json());
  let count = 0;
  let leaguesFound = new Set();
  
  data.events?.forEach(ev => {
    let leagueName = ev.season?.slug || ev.leagues?.[0]?.slug || ev.leagues?.[0]?.id;
    if (!leagueName && ev.links?.[0]?.href) {
      const match = ev.links[0].href.match(/league\/([^\/]+)/);
      if (match) leagueName = match[1];
    }
    
    if (ALLOWED_LEAGUES[leagueName]) {
      count++;
      leaguesFound.add(ALLOWED_LEAGUES[leagueName]);
    } else {
      leaguesFound.add(`Desconocida: ${leagueName} (${ev.name})`);
    }
  });
  
  console.log(`Total permitidos: ${count}`);
  console.log(`Ligas: ${[...leaguesFound].join(', ')}`);
}

check();
