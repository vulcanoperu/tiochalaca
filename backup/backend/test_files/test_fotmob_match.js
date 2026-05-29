if (typeof File === 'undefined') { global.File = require('buffer').File; }
const {chromium} = require('playwright-chromium');

(async () => {
  const browser = await chromium.launch({headless: true});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://www.fotmob.com/api/search/suggest?term=Napoli%20Bologna', {waitUntil: 'domcontentloaded'});
  const content = await page.innerText('body');
  try {
      const data = JSON.parse(content);
      console.log('Search Suggest Success!', Object.keys(data));
      if(data.matches) {
          console.log('Matches length:', data.matches.length);
          if(data.matches.length) console.log(data.matches[0]);
      }
      else console.log('No matches key');
  } catch(e) {
      console.log('Error:', e.message);
  }
  await browser.close();
})();
