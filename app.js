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
let setupIdx = 0;
let setupResults = { when: '', where: '', who: '', what: '' };
let connectorRemaining = DEFAULT_PUNCHLINE;
let connectorHistory = [];
let connectorLastText = '';
let connectorSeen = new Set();
let phase = 'setup';

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

function setSlotHTML(el, text, opts) {
  opts = opts || {};
  const inner = opts.raw ? text : renderRuby(text);
  el.innerHTML = '<div class="slot-inner">' + inner + '</div>';
}

// シャッフルバッグ式スピン
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

  // 連打防止：両ボタンを止める
  if (opts.disableBtns) opts.disableBtns.forEach(b => b && (b.disabled = true));
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
    if (opts.disableBtns) opts.disableBtns.forEach(b => b && (b.disabled = false));
    if (btn) btn.disabled = false;
    if (onLand) onLand(picked);
  }, duration);

  return picked;
}

// ===== 初期化 =====
function init() {
  punchlineCount = DEFAULT_PUNCHLINE;
  resetPlayState();
  bindPlayEvents();
  showPhase('setup');
}

function resetPlayState() {
  setupIdx = 0;
  setupResults = { when: '', where: '', who: '', what: '' };
  punchlineCount = DEFAULT_PUNCHLINE;
  connectorRemaining = punchlineCount;
  connectorHistory = [];
  connectorLastText = '';
  connectorSeen = new Set();
  phase = 'setup';

  SETUP_ORDER.forEach(cat => {
    const slot = document.getElementById(SLOT_IDS[cat]);
    slot.classList.remove('landed', 'spinning');
    slot.innerHTML = '<div class="slot-inner">―</div>';
    slot.classList.add('empty');
    const cell = slot.closest('.setup-cell');
    cell.classList.remove('active', 'current', 'done');
  });
  const firstCell = document.querySelector('.setup-cell[data-cat="' + SETUP_ORDER[0] + '"]');
  firstCell.classList.add('active', 'current');

  setSlotHTML(document.getElementById('connectorSlot'), '「{次|つぎ}へ」を{押|お}してね');
  document.getElementById('remainingCount').textContent = String(connectorRemaining);
  document.getElementById('connectorSlot').classList.remove('landed', 'spinning');
  document.querySelector('.punchline-counter').classList.remove('zero');

  // ボタン状態リセット
  const setupNext = document.getElementById('setupNextBtn');
  const setupReroll = document.getElementById('setupRerollBtn');
  const connNext = document.getElementById('connectorNextBtn');
  const connReroll = document.getElementById('connectorRerollBtn');
  setupNext.textContent = '次へ';
  setupNext.disabled = false;
  setupReroll.classList.add('hidden');
  setupReroll.disabled = false;
  connNext.textContent = '次へ';
  connNext.disabled = false;
  connReroll.classList.add('hidden');
  connReroll.disabled = false;
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
  document.getElementById('setupRerollBtn').addEventListener('click', onSetupReroll);
  document.getElementById('connectorNextBtn').addEventListener('click', onConnectorNext);
  document.getElementById('connectorRerollBtn').addEventListener('click', onConnectorReroll);
  document.getElementById('btnPunchDown').addEventListener('click', () => adjustPunchline(-1));
  document.getElementById('btnPunchUp').addEventListener('click', () => adjustPunchline(+1));
  document.getElementById('reviewRestartBtn').addEventListener('click', () => {
    resetPlayState();
    showPhase('setup');
  });
}

// オチまでの回数をいつでも増減
function adjustPunchline(delta) {
  const next = Math.max(1, Math.min(30, punchlineCount + delta));
  if (next === punchlineCount) return;
  punchlineCount = next;
  connectorRemaining = Math.max(0, punchlineCount - connectorHistory.length);
  document.getElementById('remainingCount').textContent = String(connectorRemaining);

  const counter = document.querySelector('.punchline-counter');
  const btn = document.getElementById('connectorNextBtn');
  if (connectorRemaining <= 0) {
    counter.classList.add('zero');
    if (btn) btn.textContent = 'ふりかえる';
  } else {
    counter.classList.remove('zero');
    if (btn) btn.textContent = '次へ';
  }
}

// ===== フェーズ1：4つのサイコロを順番に回す =====
function onSetupNext() {
  const btn = document.getElementById('setupNextBtn');
  const reroll = document.getElementById('setupRerollBtn');
  if (btn.disabled) return;

  if (setupIdx >= SETUP_ORDER.length) {
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
      const nextCell = document.querySelector('.setup-cell[data-cat="' + SETUP_ORDER[setupIdx] + '"]');
      nextCell.classList.add('active', 'current');
      btn.textContent = '次へ';
    } else {
      btn.textContent = 'お話をつなげる！';
    }
    // 「もう一度」を出す
    reroll.classList.remove('hidden');
  }, { disableBtns: [btn, reroll] });
}

// 直前に決まったセル（setupIdx-1）を再スピン
function onSetupReroll() {
  if (setupIdx === 0) return;
  const reroll = document.getElementById('setupRerollBtn');
  const btn = document.getElementById('setupNextBtn');
  if (reroll.disabled) return;

  const prevIdx = setupIdx - 1;
  const cat = SETUP_ORDER[prevIdx];
  const slot = document.getElementById(SLOT_IDS[cat]);
  const pool = CATEGORY_DATA[cat]();
  // 同じものが出ないように現在の値だけ除外
  const seen = new Set();
  if (setupResults[cat]) seen.add(setupResults[cat]);

  spinSlot(slot, pool, seen, setupResults[cat], reroll, (picked) => {
    setupResults[cat] = picked;
  }, { disableBtns: [btn, reroll] });
}

// ===== フェーズ2：接続詞ループ =====
function enterConnectorPhase() {
  SETUP_ORDER.forEach(cat => {
    document.getElementById(RECAP_IDS[cat]).innerHTML = renderRuby(setupResults[cat]);
  });
  showPhase('connector');
}

function onConnectorNext() {
  const btn = document.getElementById('connectorNextBtn');
  const reroll = document.getElementById('connectorRerollBtn');
  if (btn.disabled) return;

  if (connectorRemaining <= 0) {
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
    // 「もう一度」を出す
    reroll.classList.remove('hidden');
  }, { disableBtns: [btn, reroll] });
}

// 直前に決まった接続詞を再スピン（カウンタは変えない）
function onConnectorReroll() {
  if (connectorHistory.length === 0) return;
  const reroll = document.getElementById('connectorRerollBtn');
  const btn = document.getElementById('connectorNextBtn');
  if (reroll.disabled) return;

  // 直前の履歴を取り除く（カウンタは触らない）
  connectorHistory.pop();

  const slot = document.getElementById('connectorSlot');
  const pool = DATA_CONNECTOR;

  connectorLastText = spinSlot(slot, pool, connectorSeen, connectorLastText, reroll, (picked) => {
    connectorHistory.push(picked);
    // カウンタは据え置き
  }, { disableBtns: [btn, reroll] });
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
document.addEventListener('DOMContentLoaded', init);
