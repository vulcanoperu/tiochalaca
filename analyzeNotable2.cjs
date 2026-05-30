const fs = require('fs');

const data = JSON.parse(fs.readFileSync('fotmob_dump.json', 'utf8'));
const fallback = data?.props?.pageProps?.fallback;
const matchKey = Object.keys(fallback).find(k => k.includes('notableMatches') || k.includes('matches'));
const matchesData = fallback[matchKey];

if (matchesData.matches && matchesData.matches.length > 0) {
    console.log('matches[0] keys:', Object.keys(matchesData.matches[0]));
    if (matchesData.matches[0].name) {
        console.log('League Name:', matchesData.matches[0].name);
    }
}
