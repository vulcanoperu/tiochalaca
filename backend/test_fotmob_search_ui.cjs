const { chromium } = require('playwright-chromium');

async function testFotmobSearchUI() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    });
    const page = await ctx.newPage();
    
    console.log('Navigating to fotmob.com...');
    await page.goto('https://www.fotmob.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Check if there is a search button
    const searchIcon = await page.$('button[aria-label="Search FotMob"]');
    if (searchIcon) {
       await searchIcon.click();
       await page.waitForTimeout(500);
       await page.fill('input[type="search"]', 'Arsenal');
       await page.waitForTimeout(2000);
       
       const content = await page.content();
       console.log('Search typed. HTML length:', content.length);
       // we could parse __NEXT_DATA__ again here
    } else {
       console.log('Search icon not found');
    }
    
  } catch(e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
}
testFotmobSearchUI();
