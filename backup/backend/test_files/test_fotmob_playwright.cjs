const { chromium } = require('playwright-chromium');

async function testFotmobPlaywright() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Interceptar llamadas API
    page.on('response', async res => {
      if (res.url().includes('/api/matches')) {
        console.log('API call found:', res.url());
        const data = await res.json();
        console.log('Matches array length:', data.leagues?.length);
      }
    });
    
    await page.goto('https://www.fotmob.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('Page loaded successfully');
    
    const content = await page.content();
    const match = content.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if(match) {
        const data = JSON.parse(match[1]);
        const keys = Object.keys(data.props.pageProps.fallback);
        const matchesKey = keys.find(k => k.includes('matches'));
        if (matchesKey) {
            const fb = data.props.pageProps.fallback[matchesKey];
            console.log('Matches fallback leagues:', fb.leagues?.length);
            if (fb.matches && fb.matches.length > 0) {
               console.log('Found matches:', fb.matches.length);
            }
        }
    } else {
        console.log('NO NEXT DATA');
    }
    
  } catch(e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
}
testFotmobPlaywright();
