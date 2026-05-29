const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // Note: The SDK might not have a direct listModels, but we can try to fetch it via the client
    // Actually, usually we just need the right string.
    // Let's try to generate with gemini-1.5-flash and see the error again or try common ones.
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'gemini-pro'];
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            console.log(`Checking ${m}...`);
            await model.generateContent("test");
            console.log(`✓ ${m} is working!`);
            process.exit(0);
        } catch (e) {
            console.log(`✗ ${m} failed: ${e.message}`);
        }
    }
  } catch (err) {
    console.error(err);
  }
}

listModels();
