// ai-adapter.js — unified AI call layer
const { GoogleGenerativeAI } = require('@google/generative-ai');

let anthropicSDK, openaiSDK, groqSDK;

function getProvider(provider) {
  switch (provider) {
    case 'gemini': {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      return async (prompt) => {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        return result.response.text();
      };
    }

    case 'claude': {
      if (!anthropicSDK) anthropicSDK = require('@anthropic-ai/sdk');
      const client = new anthropicSDK.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return async (prompt) => {
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        });
        return msg.content[0].text;
      };
    }

    case 'openai': {
      if (!openaiSDK) openaiSDK = require('openai');
      const client = new openaiSDK.OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return async (prompt) => {
        const res = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }]
        });
        return res.choices[0].message.content;
      };
    }

    case 'groq': {
      if (!groqSDK) groqSDK = require('groq-sdk');
      const client = new groqSDK.Groq({ apiKey: process.env.GROQ_API_KEY });
      return async (prompt) => {
        const res = await client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }]
        });
        return res.choices[0].message.content;
      };
    }

    default:
      throw new Error(`Provider không hợp lệ: ${provider}`);
  }
}

module.exports = { getProvider };
