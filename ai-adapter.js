// ai-adapter.js — unified AI call layer với dynamic API key
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getProvider(provider, apiKey) {
  if (!apiKey) throw new Error(`Chưa có API key cho ${provider}. Mở ⚙️ để cấu hình.`);

  switch (provider) {
    case 'gemini': {
      const genAI = new GoogleGenerativeAI(apiKey);
      return async (prompt) => {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        return result.response.text();
      };
    }

    case 'claude': {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
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
      const { OpenAI } = require('openai');
      const client = new OpenAI({ apiKey });
      return async (prompt) => {
        const res = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }]
        });
        return res.choices[0].message.content;
      };
    }

    case 'groq': {
      const { Groq } = require('groq-sdk');
      const client = new Groq({ apiKey });
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
