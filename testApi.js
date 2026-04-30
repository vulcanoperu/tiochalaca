const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/status', {
      headers: { 'x-apisports-key': '9a69711fc06ad49ae9f6b5de23193ea7' }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
}
test();
