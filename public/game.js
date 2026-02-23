const TEMPLATES = [
  {
    name: "Anh hùng được triệu hồi",
    world: "Eldoria",
    skill: "Kỹ năng sao chép — có thể học và sử dụng bất kỳ ma thuật nào chỉ sau một lần nhìn thấy",
    backstory: "Một học sinh bình thường bị ánh sáng trắng nuốt chửng giữa đường phố Tokyo. Tỉnh dậy trong ngai vàng hoàng cung, được vua và các công chúa quỳ lạy gọi là 'Đấng Cứu Thế'. Nhưng bên ngoài lâu đài, bóng tối đang lan rộng..."
  },
  {
    name: "Phản diện bị đày",
    world: "Infernia",
    skill: "Hắc ma — điều khiển bóng tối và nỗi sợ hãi của kẻ thù, biến chúng thành vũ khí",
    backstory: "Từng là trùm phản diện khét tiếng nhất thế giới hiện đại, bị một anh hùng đánh bại và linh hồn bị ném vào thế giới fantasy tăm tối. Không có đồng minh, không có thuộc hạ — chỉ có sức mạnh và tham vọng còn lại."
  },
  {
    name: "Bị triệu hồi rồi bỏ rơi",
    world: "Vaelthorn",
    skill: "Trực giác sinh tồn — bản năng cảnh báo nguy hiểm trước 10 giây và tìm ra điểm yếu của mọi kẻ thù",
    backstory: "Được triệu hồi cùng 3 người khác, nhưng chỉ số sức mạnh thấp nhất nhóm nên bị hoàng gia bỏ rơi giữa vùng hoang dã đầy quái vật. Không bản đồ, không tiền bạc, không ai tin tưởng — chỉ có ý chí sống sót."
  },
  {
    name: "Tái sinh thành quý tộc",
    world: "Arcania",
    skill: "Thiên phú ma pháp tuyệt đối — sinh ra với lõi ma pháp hoàn hảo, có thể học mọi hệ phép thuật",
    backstory: "Chết vì tai nạn xe hơi, tỉnh dậy trong thân xác đứa trẻ 7 tuổi thuộc gia tộc quý tộc sa sút. Mang ký ức từ thế giới hiện đại, quyết tâm khôi phục vinh quang gia tộc và khám phá bí ẩn đằng sau cái chết bí ẩn của cha mình."
  },
  {
    name: "Bị hiểu nhầm là phản diện",
    world: "Lumivara",
    skill: "Nguyền rủa định mệnh — vô tình mang lời nguyền khiến mọi người xung quanh gặp vận may, nhưng bản thân lại bị coi là điềm gở",
    backstory: "Được triệu hồi với danh hiệu 'Anh hùng', nhưng kỹ năng trông giống ma thuật đen tối khiến cả vương quốc sợ hãi và truy đuổi. Thực ra chỉ muốn giúp đỡ mọi người — nhưng không ai chịu lắng nghe."
  }
];

function loadTemplate(index) {
  const t = TEMPLATES[index];
  document.getElementById('char-name').value = t.name;
  document.getElementById('char-world').value = t.world;
  document.getElementById('char-skill').value = t.skill;
  document.getElementById('char-backstory').value = t.backstory;

  // Highlight nút được chọn
  document.querySelectorAll('.template-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
}


const sessionId = Math.random().toString(36).substring(2);

// Tạo particles bay lên ở màn hình setup
function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 10 + 8) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = (Math.random() * 3 + 1) + 'px';
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

createParticles();

async function startGame() {
  const name = document.getElementById('char-name').value.trim();
  const world = document.getElementById('char-world').value.trim();
  const skill = document.getElementById('char-skill').value.trim();
  const backstory = document.getElementById('char-backstory').value.trim();

  if (!name || !world || !skill || !backstory) {
    alert('Vui lòng điền đầy đủ thông tin nhân vật!');
    return;
  }

  const character = { name, world, skill, backstory };
  sessions_character = character;
currentTurnCount = 0;

  // Chuyển màn hình
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  // Cập nhật sidebar
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-world').textContent = world;
  document.getElementById('sidebar-skill').textContent = skill;
  document.getElementById('world-title-top').textContent = world;

  addLoading();

  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, character })
    });

    const data = await res.json();
    removeLoading();
    addStoryBlock(data.message, data.choices || []);
updateNPCList(data.npcs);
  } catch (err) {
    removeLoading();
    addStoryBlock('Có lỗi xảy ra. Vui lòng thử lại!');
  }
}

async function sendMessage(predefinedMessage = null) {
  const input = document.getElementById('player-input');
  currentTurnCount++;
  const message = predefinedMessage || input.value.trim();
  if (!message) return;

  input.value = '';

  // Xóa các nút lựa chọn còn lại nếu có
  document.querySelectorAll('.choices-container').forEach(el => el.remove());

  addPlayerBlock(message);
  addLoading();
  document.getElementById('send-btn').disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message })
    });

    const data = await res.json();
    removeLoading();
    addStoryBlock(data.message, data.choices || []);
updateNPCList(data.npcs);
  } catch (err) {
    removeLoading();
    addStoryBlock('Có lỗi xảy ra. Vui lòng thử lại!');
  }

  document.getElementById('send-btn').disabled = false;
}

function addStoryBlock(text, choices = []) {
  const box = document.getElementById('story-content');

  const div = document.createElement('div');
  div.className = 'story-block';
  div.textContent = text;
  box.appendChild(div);

  if (choices.length > 0) {
    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices-container';

    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.onclick = () => {
        choicesDiv.remove();
        sendMessage(choice);
      };
      choicesDiv.appendChild(btn);
    });

    box.appendChild(choicesDiv);
  }

  scrollToBottom();
}

function addPlayerBlock(text) {
  const box = document.getElementById('story-content');
  const div = document.createElement('div');
  div.className = 'player-block';
  div.textContent = `⚔ ${text}`;
  box.appendChild(div);
  scrollToBottom();
}

function addLoading() {
  const box = document.getElementById('story-content');
  const div = document.createElement('div');
  div.className = 'loading-block';
  div.id = 'loading-indicator';
  div.innerHTML = `
    <div class="loading-dots">
      <span></span><span></span><span></span>
    </div>
    <span id="loading-label">Đang khởi động...</span>
  `;
  box.appendChild(div);
  scrollToBottom();

  // Kết nối SSE để nhận tiến trình
  const evtSource = new EventSource(`/api/progress/${sessionId}`);
  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const label = document.getElementById('loading-label');
    if (label) label.textContent = data.label;
    if (data.step === 7) evtSource.close();
  };
  evtSource.onerror = () => evtSource.close();

  // Lưu lại để đóng khi xong
  window._sseSource = evtSource;
}

function removeLoading() {
  const el = document.getElementById('loading-indicator');
  if (el) el.remove();
  if (window._sseSource) {
    window._sseSource.close();
    window._sseSource = null;
  }
}

function removeLoading() {
  const el = document.getElementById('loading-indicator');
  if (el) el.remove();
}

function scrollToBottom() {
  const box = document.getElementById('story-box');
  box.scrollTop = box.scrollHeight;
}

function updateNPCList(npcs) {
  const list = document.getElementById('npc-list');
  if (!list || !npcs) return;

  list.innerHTML = '';

  npcs.forEach(npc => {
    const affinity = npc.affinity || 0;
    const percent = ((affinity + 100) / 200) * 100;

    let color = '#6a7080';
    let label = 'Trung lập';
    if (affinity > 30) { color = '#4caf84'; label = 'Thân thiện'; }
    if (affinity > 60) { color = '#c9a84c'; label = 'Tin tưởng'; }
    if (affinity < -30) { color = '#cc4a4a'; label = 'Thù địch'; }
    if (affinity < -60) { color = '#8b0000'; label = 'Căm ghét'; }

    list.innerHTML += `
      <div class="npc-card">
        <div class="npc-name">${npc.name}</div>
        <div class="npc-role">${npc.role}</div>
        <div class="affinity-bar-bg">
          <div class="affinity-bar" style="width:${percent}%; background:${color}"></div>
        </div>
        <div class="affinity-label" style="color:${color}">${label} (${affinity > 0 ? '+' : ''}${affinity})</div>
      </div>
    `;
  });
}

// Load danh sách save khi vào trang
async function loadSavesList() {
  const res = await fetch('/api/saves');
  const saves = await res.json();

  const section = document.getElementById('continue-section');
  const list = document.getElementById('saves-list');

  if (saves.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = '';

  saves.forEach(save => {
    const date = new Date(save.savedAt).toLocaleString('vi-VN');
    list.innerHTML += `
      <div class="save-card">
        <div class="save-info">
          <div class="save-name">${save.saveName}</div>
          <div class="save-meta">${save.character.name} • ${save.character.world} • ${date}</div>
        </div>
        <button class="save-load-btn" onclick="loadGame('${save.sessionId}')">▶ Tiếp tục</button>
        <button class="save-delete-btn" onclick="deleteSave('${save.sessionId}')">🗑</button>
      </div>
    `;
  });
}

async function saveGame() {
  const saveName = `${sessions_character?.name || 'Nhân vật'} • Lượt ${currentTurnCount}`;
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, saveName })
  });
  const data = await res.json();
  if (data.success) {
    showToast('💾 Đã lưu game!');
  }
}

async function loadGame(savedSessionId) {
  const res = await fetch('/api/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: savedSessionId })
  });
  const data = await res.json();
  if (!data.success) return;

  // Dùng sessionId của save
  Object.assign(window, { sessionId: savedSessionId });

  // Cập nhật UI
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('sidebar-name').textContent = data.character.name;
  document.getElementById('sidebar-world').textContent = data.character.world;
  document.getElementById('sidebar-skill').textContent = data.character.skill;
  document.getElementById('world-title-top').textContent = data.character.world;
  sessions_character = data.character;
  updateNPCList(data.npcs);

  addStoryBlock('✨ Đã tải game thành công! Tiếp tục hành trình của bạn...');
}

async function deleteSave(savedSessionId) {
  if (!confirm('Xóa save này?')) return;
  await fetch(`/api/save/${savedSessionId}`, { method: 'DELETE' });
  loadSavesList();
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 30px; right: 30px;
    background: rgba(201, 168, 76, 0.9); color: #000;
    padding: 12px 20px; border-radius: 8px;
    font-size: 0.95rem; z-index: 9999;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

let sessions_character = null;
let currentTurnCount = 0;

// Enter gửi, Shift+Enter xuống dòng
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('player-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  loadSavesList();
});

function backToMenu() {
  if (!confirm('Quay về màn hình chính? Hãy lưu game trước nếu chưa lưu!')) return;
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('story-content').innerHTML = '';
  loadSavesList();
}
