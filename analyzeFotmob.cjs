const fs = require('fs');

const data = JSON.parse(fs.readFileSync('fotmob_dump.json', 'utf8'));
const fallback = data?.props?.pageProps?.fallback;

if (!fallback) {
  console.log('No fallback found');
} else {
  console.log('Fallback keys:');
  const keys = Object.keys(fallback);
  keys.forEach(k => {
    console.log(`- ${k}`);
  });
}
