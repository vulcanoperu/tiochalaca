if (typeof File === 'undefined') { global.File = require('buffer').File; }
const {chromium} = require('playwright-chromium');
const cheerio = require('cheerio');

(async () => {
  const browser = await chromium.launch({headless: true});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://www.fotmob.com/api/search/suggest?term=Manchester%20United', {waitUntil: 'domcontentloaded'});
  const content = await page.innerText('body');
  try {
      const data = JSON.parse(content);
      console.log('Search Suggest Success!', Object.keys(data));
      if(data.teams) {
          console.log('Teams:', data.teams.length);
      }
      if(data.squads) {
          console.log('Squads length:', data.squads.length);
          if(data.squads.length) console.log(data.squads[0]);
      }
      console.log(content.substring(0, 300));
  } catch(e) {
      console.log('Not JSON:', content.substring(0, 500));
  }
  await browser.close();
})();
