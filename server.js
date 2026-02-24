require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs-extra');
const path = require('path');
const { getProvider } = require('./ai-adapter');

const SAVES_DIR = path.join(__dirname, 'saves');
const CONFIG_FILE = path.join(__dirname, 'api-keys.json');
fs.ensureDirSync(SAVES_DIR);

const app = express();
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});

app.use(express.json());
app.use(express.static('public'));

const sessions = {};
const sseClients = {};
const COLLECTION_NAME = 'isekai_memories';
const VECTOR_SIZE = 768;

// ========== RUNTIME KEY STORE ==========
// Ưu tiên: api-keys.json > .env
let runtimeKeys = {};

async function loadRuntimeKeys() {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      runtimeKeys = await fs.readJson(CONFIG_FILE);
      console.log('✅ Loaded API keys from api-keys.json');
    }
  } catch {}
}

function getKey(provider) {
  const map = {
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    groq:   'GROQ_API_KEY'
  };
  return runtimeKeys[provider] || process.env[map[provider]] || '';
}

// ========== QDRANT SETUP ==========

async function ensureCollection() {
  try {
    await qdrant.getCollection(COLLECTION_NAME);
  } catch {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
    });
    console.log('✅ Đã tạo collection Qdrant');
  }
}

async function getEmbedding(text) {
  const { GoogleGenerativeAI: G } = require('@google/generative-ai');
  const genAI = new G(getKey('gemini'));
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_EMBEDDING_MODEL || 'models/text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function saveMemory(sessionId, memory, type = 'event') {
  const vector = await getEmbedding(memory);
  const id = Date.now();
  await qdrant.upsert(COLLECTION_NAME, {
    points: [{ id, vector, payload: { sessionId, memory, type, timestamp: Date.now() } }]
  });
}

async function searchMemories(sessionId, query, limit = 3) {
  const vector = await getEmbedding(query);
  const results = await qdrant.search(COLLECTION_NAME, {
    vector, limit,
    filter: { must: [{ key: 'sessionId', match: { value: sessionId } }] }
  });
  return results.map(r => r.payload.memory);
}

// ========== SSE ==========

app.get('/api/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  sseClients[sessionId] = res;
  req.on('close', () => { delete sseClients[sessionId]; });
});

function sendProgress(sessionId, step, label) {
  const client = sseClients[sessionId];
  if (client) client.write(`data: ${JSON.stringify({ step, label })}\n\n`);
}

// ========== PIPELINE ==========

async function runPlanner(character, memories, npcs, playerAction, sessionId, callAI) {
  sendProgress(sessionId, 1, '⚙️ Planner đang lên kế hoạch...');
  const npcDesc = npcs.map(n => `- ${n.name} (${n.role}): affinity ${n.affinity}`).join('\n');
  const memoriesText = memories.length > 0 ? memories.join('\n') : '(Chưa có)';
  const prompt = `Bạn là Planner của một game Isekai có yếu tố romance.

NHÂN VẬT CHÍNH: ${character.name} | Thế giới: ${character.world} | Kỹ năng: ${character.skill}
CÁC NPC:\n${npcDesc || '(Chưa có)'}
KÝ ỨC LIÊN QUAN:\n${memoriesText}
HÀNH ĐỘNG CỦA NGƯỜI CHƠI: ${playerAction}

Lên kế hoạch ngắn gọn (tối đa 100 từ):
- Sự kiện chính sẽ xảy ra
- Cơ hội romance nếu có
- Tension/conflict
- NPC nào sẽ xuất hiện`;
  return await callAI(prompt);
}

async function runWorldBuilder(character, plan, memories, sessionId, callAI) {
  sendProgress(sessionId, 2, '🌍 World Builder đang xây dựng bối cảnh...');
  const memoriesText = memories.length > 0 ? memories.join('\n') : '(Chưa có)';
  const prompt = `Bạn là World Builder của game Isekai.

THẾ GIỚI: ${character.world}
KẾ HOẠCH: ${plan}
KÝ ỨC LIÊN QUAN:\n${memoriesText}

Kiểm tra và bổ sung logic thế giới (tối đa 80 từ):
- Địa điểm, bối cảnh cụ thể
- Quy tắc phép thuật/kỹ năng liên quan
- Yếu tố thế giới cần nhất quán`;
  return await callAI(prompt);
}

async function runNPCSimulator(npcs, plan, playerAction, sessionId, callAI) {
  sendProgress(sessionId, 3, '🧠 NPC Simulator đang giả lập tâm lý...');
  const npcDesc = npcs.map(n =>
    `- ${n.name} (${n.role}, tính cách: ${n.personality}, affinity: ${n.affinity})`
  ).join('\n');
  const prompt = `Bạn là NPC Simulator cho game Isekai romance.

CÁC NPC:\n${npcDesc || '(Chưa có)'}
KẾ HOẠCH: ${plan}
HÀNH ĐỘNG NGƯỜI CHƠI: ${playerAction}

Giả lập tâm lý và phản ứng của từng NPC (tối đa 100 từ):
- Họ cảm thấy gì và sẽ làm gì?
- Nếu affinity > 30: có thể có cảm xúc tình cảm
- Nếu affinity < -30: xung đột, thù địch`;
  return await callAI(prompt);
}

async function runRomanceTracker(npcs, plan, npcSimulation, sessionId, callAI) {
  sendProgress(sessionId, 4, '💕 Romance Tracker đang phân tích...');
  const npcDesc = npcs.map(n => `- ${n.name}: affinity ${n.affinity}`).join('\n');
  const prompt = `Bạn là Romance Tracker cho game Isekai.

CHỈ SỐ TÌNH CẢM:\n${npcDesc || '(Chưa có)'}
KẾ HOẠCH: ${plan}
TÂM LÝ NPC: ${npcSimulation}

Phân tích romance (tối đa 80 từ):
- Nếu affinity > 50: cảnh ngọt ngào, gần gũi
- Nếu affinity 20-50: hint tình cảm tự nhiên
- Nếu affinity < 20: xây dựng quan hệ
- Tránh ép romance không tự nhiên`;
  return await callAI(prompt);
}

async function runWriter(character, plan, worldContext, npcSimulation, romanceAnalysis, history, memories, sessionId, callAI) {
  sendProgress(sessionId, 5, '✍️ Writer đang chấp bút...');
  const historyText = history.slice(-6).map(h =>
    `${h.role === 'user' ? 'Người chơi' : 'AI'}: ${h.parts[0].text}`
  ).join('\n');
  const memoriesText = memories.length > 0 ? memories.join('\n') : '(Chưa có)';
  const prompt = `Bạn là Writer chính cho game Isekai romance nhập vai.

- Kế hoạch: ${plan}
- Bối cảnh thế giới: ${worldContext}
- Tâm lý NPC: ${npcSimulation}
- Romance: ${romanceAnalysis}
- Ký ức liên quan:\n${memoriesText}
- Lịch sử gần đây:\n${historyText}

Viết đoạn tiếp theo bằng Tiếng Việt (150-250 từ):
- Sinh động, hấp dẫn, immersive
- Thể hiện đúng tâm lý NPC
- Lồng ghép romance tự nhiên nếu phù hợp
- Kết thúc bằng tình huống chờ người chơi phản hồi

Cuối bắt buộc thêm:
[NEW_NPC: tên|vai trò|tính cách] (nếu có NPC mới)
[NPC_UPDATE: tên:điểm,tên:điểm]
[CHOICES: Hành động 1|Hành động 2|Hành động 3]`;
  return await callAI(prompt);
}

async function runCritic(draft, sessionId, callAI) {
  sendProgress(sessionId, 6, '✨ Critic đang chỉnh sửa văn phong...');
  const prompt = `Bạn là Critic chỉnh sửa văn phong cho game Isekai romance.

BẢN THẢO:
${draft}

Chỉnh sửa để văn phong cuốn hút, dramatic, romance tự nhiên.
Giữ nguyên tất cả thẻ [NEW_NPC:...], [NPC_UPDATE:...], [CHOICES:...]
Viết bằng Tiếng Việt. Trả về bản đã chỉnh sửa:`;
  return await callAI(prompt);
}

// ========== PARSE ==========

function parseResponse(aiMessage, existingNpcs) {
  const newNpcMatches = [...aiMessage.matchAll(/\[NEW_NPC:\s*(.*?)\]/g)];
  let npcs = [...existingNpcs];

  newNpcMatches.forEach(match => {
    const parts = match[1].split('|').map(s => s.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      if (!npcs.find(n => n.name === name)) {
        npcs.push({ name, role: parts[1] || '', personality: parts[2] || '', affinity: 0 });
      }
    }
  });

  const updateMatch = aiMessage.match(/\[NPC_UPDATE:(.*?)\]/);
  if (updateMatch) {
    updateMatch[1].split(',').forEach(update => {
      const parts = update.trim().split(':');
      if (parts.length < 2) return;
      const name = parts[0].trim();
      const change = parseInt(parts[1].trim());
      if (isNaN(change)) return;
      const npc = npcs.find(n => n.name === name);
      if (npc) npc.affinity = Math.max(-100, Math.min(100, (npc.affinity || 0) + change));
    });
  }

  const choicesMatch = aiMessage.match(/\[CHOICES:(.*?)\]/);
  const choices = choicesMatch ? choicesMatch[1].split('|').map(c => c.trim()) : [];

  const cleanMessage = aiMessage
    .replace(/\[NEW_NPC:.*?\]/g, '')
    .replace(/\[NPC_UPDATE:.*?\]/g, '')
    .replace(/\[CHOICES:.*?\]/g, '')
    .trim();

  return { cleanMessage, choices, npcs };
}

// ========== ROUTES ==========

// Kiểm tra provider nào có key
app.get('/api/providers', (req, res) => {
  res.json({
    gemini: !!getKey('gemini'),
    claude: !!getKey('claude'),
    openai: !!getKey('openai'),
    groq:   !!getKey('groq')
  });
});

// GET settings — trả về trạng thái đã set chưa (không trả key thật)
app.get('/api/settings', (req, res) => {
  res.json({
    gemini: !!getKey('gemini'),
    claude: !!getKey('claude'),
    openai: !!getKey('openai'),
    groq:   !!getKey('groq')
  });
});

// POST settings — lưu key vào file json, áp dụng ngay vào runtime
app.post('/api/settings', async (req, res) => {
  try {
    const allowed = ['gemini', 'claude', 'openai', 'groq'];
    allowed.forEach(p => {
      if (req.body[p]) runtimeKeys[p] = req.body[p];
    });
    await fs.writeJson(CONFIG_FILE, runtimeKeys, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/start', async (req, res) => {
  const { sessionId, character, provider = 'gemini' } = req.body;

  sessions[sessionId] = { character, history: [], turnCount: 0, npcs: [], provider };

  try {
    const callAI = getProvider(provider, getKey(provider));
    const memories = [];
    const plan = await runPlanner(character, memories, [], 'Bắt đầu câu chuyện', sessionId, callAI);
    const worldContext = await runWorldBuilder(character, plan, memories, sessionId, callAI);
    const npcSimulation = await runNPCSimulator([], plan, 'Bắt đầu câu chuyện', sessionId, callAI);
    const romanceAnalysis = await runRomanceTracker([], plan, npcSimulation, sessionId, callAI);
    const draft = await runWriter(character, plan, worldContext, npcSimulation, romanceAnalysis, [], memories, sessionId, callAI);
    const final = await runCritic(draft, sessionId, callAI);

    sessions[sessionId].history.push(
      { role: 'user', parts: [{ text: 'Bắt đầu câu chuyện!' }] },
      { role: 'model', parts: [{ text: final }] }
    );
    sessions[sessionId].turnCount++;

    const { cleanMessage, choices, npcs } = parseResponse(final, []);
    sessions[sessionId].npcs = npcs;

    await saveMemory(sessionId, `Câu chuyện bắt đầu: ${cleanMessage.substring(0, 200)}`, 'event');
    sendProgress(sessionId, 7, '✅ Hoàn thành!');
    res.json({ message: cleanMessage, choices, npcs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  const session = sessions[sessionId];
  if (!session) return res.status(400).json({ error: 'Session không tồn tại' });

  try {
    const callAI = getProvider(session.provider || 'gemini', getKey(session.provider || 'gemini'));
    const memories = await searchMemories(sessionId, message, 3);
    const plan = await runPlanner(session.character, memories, session.npcs, message, sessionId, callAI);
    const worldContext = await runWorldBuilder(session.character, plan, memories, sessionId, callAI);
    const npcSimulation = await runNPCSimulator(session.npcs, plan, message, sessionId, callAI);
    const romanceAnalysis = await runRomanceTracker(session.npcs, plan, npcSimulation, sessionId, callAI);
    const draft = await runWriter(session.character, plan, worldContext, npcSimulation, romanceAnalysis, session.history, memories, sessionId, callAI);
    const final = await runCritic(draft, sessionId, callAI);

    session.history.push(
      { role: 'user', parts: [{ text: message }] },
      { role: 'model', parts: [{ text: final }] }
    );
    if (session.history.length > 10) session.history = session.history.slice(-10);
    session.turnCount++;

    const { cleanMessage, choices, npcs } = parseResponse(final, session.npcs);
    session.npcs = npcs;

    await saveMemory(sessionId, `Người chơi: ${message} → ${cleanMessage.substring(0, 200)}`, 'event');
    sendProgress(sessionId, 7, '✅ Hoàn thành!');
    res.json({ message: cleanMessage, choices, npcs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Lưu game
app.post('/api/save', async (req, res) => {
  const { sessionId, saveName } = req.body;
  const session = sessions[sessionId];
  if (!session) return res.status(400).json({ error: 'Session không tồn tại' });
  const saveData = {
    saveName: saveName || 'Lưu game ' + new Date().toLocaleString('vi-VN'),
    savedAt: Date.now(),
    character: session.character,
    history: session.history,
    turnCount: session.turnCount,
    npcs: session.npcs,
    provider: session.provider
  };
  await fs.writeJson(path.join(SAVES_DIR, `${sessionId}.json`), saveData, { spaces: 2 });
  res.json({ success: true, saveName: saveData.saveName });
});

// Lấy danh sách save
app.get('/api/saves', async (req, res) => {
  try {
    const files = await fs.readdir(SAVES_DIR);
    const saves = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await fs.readJson(path.join(SAVES_DIR, file));
      saves.push({ sessionId: file.replace('.json', ''), saveName: data.saveName, savedAt: data.savedAt, character: data.character, provider: data.provider || 'gemini' });
    }
    saves.sort((a, b) => b.savedAt - a.savedAt);
    res.json(saves);
  } catch { res.json([]); }
});

// Tải game
app.post('/api/load', async (req, res) => {
  const { sessionId } = req.body;
  const filePath = path.join(SAVES_DIR, `${sessionId}.json`);
  if (!await fs.pathExists(filePath)) return res.status(404).json({ error: 'Không tìm thấy save' });
  const saveData = await fs.readJson(filePath);
  sessions[sessionId] = { character: saveData.character, history: saveData.history, turnCount: saveData.turnCount, npcs: saveData.npcs, provider: saveData.provider || 'gemini' };
  res.json({ success: true, character: saveData.character, npcs: saveData.npcs, saveName: saveData.saveName, provider: saveData.provider || 'gemini' });
});

// Xóa save
app.delete('/api/save/:sessionId', async (req, res) => {
  await fs.remove(path.join(SAVES_DIR, `${req.params.sessionId}.json`));
  res.json({ success: true });
});

// Khởi động
loadRuntimeKeys().then(() => ensureCollection()).then(() => {
  app.listen(3000, () => console.log('Server đang chạy tại http://localhost:3000'));
});
