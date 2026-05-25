// ===== おはなしコロリン =====
// 即興でお話づくりを楽しむアプリ

// ----- 設定 -----
const DEFAULT_PUNCHLINE = 8;
const SETUP_ORDER = ['when', 'where', 'who', 'what'];
const CATEGORY_DATA = {
  when:  () => DATA_WHEN,
  where: () => DATA_WHERE,
  who:   () => DATA_WHO,
  what:  () => DATA_WHAT,
};
const SLOT_IDS = {
  when:  'slotWhen',
  where: 'slotWhere',
  who:   'slotWho',
  what:  'slotWhat',
};
const RECAP_IDS = {
  when:  'recapWhen',
  where: 'recapWhere',
  who:   'recapWho',
  what:  'recapWhat',
};
const REVIEW_IDS = {
  when:  'reviewWhen',
  where: 'reviewWhere',
  who:   'reviewWho',
  what:  'reviewWhat',
};

// ----- 状態 -----
let punchlineCount = DEFAULT_PUNCHLINE;
let setupIdx = 0;                          // 0..3 で「いつ→どこで→だれが→なにをした」を進める
let setupResults = { when: '', where: '', who: '', what: '' };
let connectorRemaining = DEFAULT_PUNCHLINE;
let connectorHistory = [];
let connectorLastText = '';
let connectorSeen = new Set();
let phase = 'setup';                       // 'setup' | 'connector' | 'review'

// ===== ルビ記法 =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function renderRuby(text) {
  if (!text) return '';
  return escapeHtml(text).replace(
    /\{([^{}|]+)\|([^{}|]+)\}/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
}

// ===== 共通：スロット表示 =====
function setSlotHTML(el, text, opts) {
  opts = opts || {};
  const inner = opts.raw ? text : renderRuby(text);
  el.innerHTML = '<div class="slot-inner">' + inner + '</div>';
}

// シャッフルバッグ式：seenに無いものから選ぶ。全部出たら自動でリセット
function spinSlot(windowEl, pool, seenSet, lastText, btn, onLand, opts) {
  opts = opts || {};
  if (!pool || pool.length === 0) {
    setSlotHTML(windowEl, 'データがありません');
    return lastText;
  }

  let eligible = pool.filter(t => !seenSet.has(t));
  if (eligible.length === 0) {
    seenSet.clear();
    if (lastText) seenSet.add(lastText);
    eligible = pool.filter(t => !seenSet.has(t));
    if (eligible.length === 0) eligible = pool;
  }

  const picked = eligible[Math.floor(Math.random() * eligible.length)];
  seenSet.add(picked);

  if (btn) btn.disabled = true;
  windowEl.classList.add('spinning');
  windowEl.classList.remove('landed');

  const duration = opts.duration || 1200;
  const interval = opts.interval || 60;

  const spinInterval = setInterval(() => {
    const r = Math.floor(Math.random() * pool.length);
    setSlotHTML(windowEl, pool[r]);
  }, interval);

  setTimeout(() => {
    clearInterval(spinInterval);
    windowEl.classList.remove('spinning');
    setSlotHTML(windowEl, picked);
    windowEl.classList.add('landed');
    if (btn) btn.disabled = false;
    if (onLand) onLand(picked);
  }, duration);

  return picked;
}

// ===== 初期化 =====
function init() {
  const hash = window.location.hash;
  if (hash.startsWith('#play=')) {
    enterPlayMode(hash.slice(6));
  } else {
    enterEditorMode();
  }
}

// ===== 設定モード =====
function enterEditorMode() {
  document.getElementById('editorView').classList.remove('hidden');
  document.getElementById('playView').classList.add('hidden');
  bindEditorEvents();
}

function bindEditorEvents() {
  const input = document.getElementById('punchlineCount');
  const minus = document.getElementById('btnPunchMinus');
  const plus  = document.getElementById('btnPunchPlus');

  const clamp = (v) => Math.max(1, Math.min(30, v|0 || DEFAULT_PUNCHLINE));

  minus.addEventListener('click', () => {
    input.value = clamp(parseInt(input.value, 10) - 1);
  });
  plus.addEventListener('click', () => {
    input.value = clamp(parseInt(input.value, 10) + 1);
  });
  input.addEventListener('change', () => {
    input.value = clamp(parseInt(input.value, 10));
  });

  document.getElementById('btnPublish').addEventListener('click', publishUrl);
  document.getElementById('btnCopy').addEventListener('click', () => {
    const u = document.getElementById('publishedUrl');
    if (!u.value) return;
    u.select();
    navigator.clipboard.writeText(u.value).then(() => {
      const btn = document.getElementById('btnCopy');
      const orig = btn.textContent;
      btn.textContent = 'コピー済';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  });
  document.getElementById('btnOpen').addEventListener('click', () => {
    const url = document.getElementById('publishedUrl').value;
    if (!url) return;
    window.open(url, '_blank');
  });
}

// ===== URL発行 =====
function publishUrl() {
  const input = document.getElementById('punchlineCount');
  let p = parseInt(input.value, 10);
  if (!p || p < 1) p = DEFAULT_PUNCHLINE;
  if (p > 30) p = 30;
  input.value = p;

  const payload = { p: p };
  const json = JSON.stringify(payload);
  const encoded = encodeURIComponent(json);
  const baseUrl = window.location.href.split('#')[0];
  const url = `${baseUrl}#play=${encoded}`;
  document.getElementById('publishedUrl').value = url;
}

// ===== プレイモード =====
function enterPlayMode(encoded) {
  document.getElementById('editorView').classList.add('hidden');
  document.getElementById('playView').classList.remove('hidden');

  let p = DEFAULT_PUNCHLINE;
  try {
    const payload = JSON.parse(decodeURIComponent(encoded));
    if (payload && typeof payload.p === 'number') {
      p = Math.max(1, Math.min(30, payload.p|0));
    }
  } catch (e) { /* fallback to default */ }

  punchlineCount = p;
  resetPlayState();
  bindPlayEvents();
  showPhase('setup');
}

function resetPlayState() {
  setupIdx = 0;
  setupResults = { when: '', where: '', who: '', what: '' };
  connectorRemaining = punchlineCount;
  connectorHistory = [];
  connectorLastText = '';
  connectorSeen = new Set();
  phase = 'setup';

  // 表示リセット
  SETUP_ORDER.forEach(cat => {
    const slot = document.getElementById(SLOT_IDS[cat]);
    slot.classList.remove('landed', 'spinning');
    slot.innerHTML = '<div class="slot-inner">―</div>';
    slot.classList.add('empty');
    const cell = slot.closest('.setup-cell');
    cell.classList.remove('active', 'current', 'done');
  });
  // 最初の「いつ」だけアクティブにする
  const firstCell = document.querySelector('.setup-cell[data-cat="' + SETUP_ORDER[0] + '"]');
  firstCell.classList.add('active', 'current');

  // 接続詞スロット初期表示
  setSlotHTML(document.getElementById('connectorSlot'), '「{次|つぎ}へ」を{押|お}してね');
  document.getElementById('remainingCount').textContent = String(connectorRemaining);
  document.getElementById('connectorSlot').classList.remove('landed', 'spinning');
  document.querySelector('.punchline-counter').classList.remove('zero');

  // ボタンラベルをリセット
  document.getElementById('setupNextBtn').textContent = '次へ';
  document.getElementById('setupNextBtn').disabled = false;
  document.getElementById('connectorNextBtn').textContent = '次へ';
  document.getElementById('connectorNextBtn').disabled = false;
}

function showPhase(name) {
  phase = name;
  document.getElementById('setupPhase').classList.toggle('hidden', name !== 'setup');
  document.getElementById('connectorPhase').classList.toggle('hidden', name !== 'connector');
  document.getElementById('reviewPhase').classList.toggle('hidden', name !== 'review');
}

let _playEventsBound = false;
function bindPlayEvents() {
  if (_playEventsBound) return;
  _playEventsBound = true;

  document.getElementById('setupNextBtn').addEventListener('click', onSetupNext);
  document.getElementById('connectorNextBtn').addEventListener('click', onConnectorNext);
  document.getElementById('reviewRestartBtn').addEventListener('click', () => {
    resetPlayState();
    showPhase('setup');
  });
}

// ===== フェーズ1：4つのサイコロを順番に回す =====
function onSetupNext() {
  const btn = document.getElementById('setupNextBtn');
  if (btn.disabled) return;

  if (setupIdx >= SETUP_ORDER.length) {
    // 全部出揃った → 接続詞フェーズへ
    enterConnectorPhase();
    return;
  }

  const cat = SETUP_ORDER[setupIdx];
  const slot = document.getElementById(SLOT_IDS[cat]);
  const cell = slot.closest('.setup-cell');
  slot.classList.remove('empty');

  const pool = CATEGORY_DATA[cat]();
  const seen = new Set();
  spinSlot(slot, pool, seen, '', btn, (picked) => {
    setupResults[cat] = picked;
    cell.classList.remove('current');
    cell.classList.add('done');
    setupIdx++;

    if (setupIdx < SETUP_ORDER.length) {
      // 次のセルをアクティブに
      const nextCell = document.querySelector('.setup-cell[data-cat="' + SETUP_ORDER[setupIdx] + '"]');
      nextCell.classList.add('active', 'current');
      btn.textContent = '次へ';
    } else {
      // 全部終わった
      btn.textContent = 'お話をつなげる！';
    }
  });
}

// ===== フェーズ2：接続詞ループ =====
function enterConnectorPhase() {
  // recapを埋める
  SETUP_ORDER.forEach(cat => {
    document.getElementById(RECAP_IDS[cat]).innerHTML = renderRuby(setupResults[cat]);
  });
  showPhase('connector');
}

function onConnectorNext() {
  const btn = document.getElementById('connectorNextBtn');
  if (btn.disabled) return;

  if (connectorRemaining <= 0) {
    // オチに到達済み → ふりかえりへ
    enterReviewPhase();
    return;
  }

  const slot = document.getElementById('connectorSlot');
  const pool = DATA_CONNECTOR;

  connectorLastText = spinSlot(slot, pool, connectorSeen, connectorLastText, btn, (picked) => {
    connectorHistory.push(picked);
    connectorRemaining--;
    document.getElementById('remainingCount').textContent = String(connectorRemaining);

    if (connectorRemaining <= 0) {
      document.querySelector('.punchline-counter').classList.add('zero');
      btn.textContent = 'ふりかえる';
    }
  });
}

// ===== フェーズ3：ふりかえり =====
function enterReviewPhase() {
  SETUP_ORDER.forEach(cat => {
    document.getElementById(REVIEW_IDS[cat]).innerHTML = renderRuby(setupResults[cat]);
  });
  const list = document.getElementById('reviewConnectorList');
  list.innerHTML = '';
  connectorHistory.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = renderRuby(c);
    list.appendChild(li);
  });
  showPhase('review');
}

// ===== 起動 =====
window.addEventListener('hashchange', () => {
  init();
});
document.addEventListener('DOMContentLoaded', init);
