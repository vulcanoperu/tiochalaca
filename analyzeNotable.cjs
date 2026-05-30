const fs = require('fs');

const data = JSON.parse(fs.readFileSync('fotmob_dump.json', 'utf8'));
const fallback = data?.props?.pageProps?.fallback;

const matchKey = Object.keys(fallback).find(k => k.includes('notableMatches') || k.includes('matches'));
if (matchKey) {
  const matchesData = fallback[matchKey];
  console.log('Matches Data has keys:', Object.keys(matchesData));
  if (matchesData.leagues) {
    console.log('Found leagues:', matchesData.leagues.length);
    console.log('League 1:', matchesData.leagues[0].name);
    console.log('Matches in League 1:', matchesData.leagues[0].matches.length);
  }
}
