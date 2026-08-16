/* WebTV app.js — 频道浏览/筛选/搜索 + hls.js 多源自动切换 + EPG */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let INDEX = null;
let ALL_CH = [];       // 全部频道条目（浏览视图）
let CUR_VIEW = 'browse';
let hls = null;
let curDetail = null;  // 当前播放频道详情
let srcIdx = 0;        // 当前源下标
let playing = false;

/* ---------- 数据加载 ---------- */
async function loadIndex() {
  const r = await fetch('data/index.json');
  INDEX = await r.json();
  // 加载全部国家分片（简单模式：先拉国家列表索引，浏览视图按需）
  const cc = Object.keys(INDEX.countries);
  // 浏览视图：拉全部国家分片（177 个文件，每个几 KB-几百 KB，首屏可接受）
  const tasks = cc.map(c => fetch(`data/by_country/${c}.json`).then(r => r.json()));
  const parts = await Promise.all(tasks);
  ALL_CH = parts.flat();
  // 渲染国家/分类卡片
  renderCountries();
  renderCategories();
  renderAbout();
  // 筛选下拉
  const fsel = $('#f-country');
  cc.sort().forEach(c => {
    const it = INDEX.countries[c];
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = `${it.name} (${it.count})`;
    fsel.appendChild(opt);
  });
  const csel = $('#f-category');
  Object.entries(INDEX.categories).forEach(([cat, n]) => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = `${cat} (${n})`;
    csel.appendChild(opt);
  });
  renderGrid();
}

/* ---------- 视图切换 ---------- */
$$('.nav-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.nav-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  CUR_VIEW = tab.dataset.view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${CUR_VIEW}`).classList.add('active');
  if (CUR_VIEW === 'browse') renderGrid();
}));

/* ---------- 浏览网格 ---------- */
function currentFilter() {
  return { country: $('#f-country').value, category: $('#f-category').value, q: $('#search').value.trim().toLowerCase() };
}
function filtered() {
  const { country, category, q } = currentFilter();
  let list = ALL_CH;
  if (country) list = list.filter(c => c.c === country);
  if (category) list = list.filter(c => (c.g || []).includes(category));
  if (q) list = list.filter(c => c.n.toLowerCase().includes(q) || (c.g || []).some(g => g.includes(q)));
  return list;
}
function renderGrid() {
  const grid = $('#ch-grid');
  const list = filtered();
  if (!list.length) { grid.innerHTML = '<div class="empty">没有匹配的频道</div>'; return; }
  grid.innerHTML = list.map(c => `
    <div class="ch-card" data-id="${esc(c.id)}">
      ${c.lg ? `<img class="ch-logo" src="${esc(c.lg)}" loading="lazy" onerror="this.outerHTML='<div class=ch-logo-ph>📺</div>'">` : '<div class="ch-logo-ph">📺</div>'}
      <div class="ch-name">${esc(c.n)}</div>
      <div class="ch-meta">
        ${(c.g || []).slice(0, 2).map(g => `<span class="chip">${esc(g)}</span>`).join('')}
      </div>
    </div>`).join('');
  $$('.ch-card', grid).forEach(card => card.addEventListener('click', () => openChannel(card.dataset.id)));
}
// 防抖搜索
let st = null;
$('#search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(renderGrid, 200); });
$('#f-country').addEventListener('change', renderGrid);
$('#f-category').addEventListener('change', renderGrid);

/* ---------- 国家/分类视图 ---------- */
function renderCountries() {
  const grid = $('#country-grid');
  grid.innerHTML = Object.entries(INDEX.countries).sort((a, b) => b[1].count - a[1].count).map(([cc, it]) => `
    <div class="country-card" data-cc="${cc}">
      <div class="cc">${flagEmoji(cc)}</div>
      <div class="cn">${esc(it.name)}</div>
      <div class="ccnt">${it.count} 频道</div>
    </div>`).join('');
  $$('.country-card', grid).forEach(card => card.addEventListener('click', () => {
    $('#f-country').value = card.dataset.cc;
    $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'browse'));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-browse'));
    CUR_VIEW = 'browse';
    renderGrid();
    window.scrollTo({ top: 0 });
  }));
}
function renderCategories() {
  const grid = $('#cat-grid');
  grid.innerHTML = Object.entries(INDEX.categories).sort((a, b) => b[1] - a[1]).map(([cat, n]) => `
    <div class="cat-card" data-cat="${esc(cat)}">
      <div class="cn">${catIcon(cat)} ${esc(cat)}</div>
      <div class="ccnt">${n} 频道</div>
    </div>`).join('');
  $$('.cat-card', grid).forEach(card => card.addEventListener('click', () => {
    $('#f-category').value = card.dataset.cat;
    $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'browse'));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-browse'));
    CUR_VIEW = 'browse';
    renderGrid();
    window.scrollTo({ top: 0 });
  }));
}
function renderAbout() {
  $('#src-list').innerHTML = (INDEX.data_sources || []).map(s =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> — ${esc(s.type)}</li>`).join('');
}

/* ---------- 播放 ---------- */
async function openChannel(id) {
  const r = await fetch(`data/ch/${encodeURIComponent(id)}.json`);
  if (!r.ok) { alert('频道数据加载失败'); return; }
  curDetail = await r.json();
  srcIdx = 0;
  $('#p-logo').src = curDetail.logo || '';
  $('#p-name').textContent = curDetail.name;
  $('#p-quality').textContent = '';
  $('#p-source-count').textContent = `${curDetail.sources.length} 源`;
  $('#player-overlay').classList.remove('hidden');
  $('#p-status').textContent = '';
  renderSrcBar();
  loadEpg();
  playSource(0);
}
function renderSrcBar() {
  $('#src-bar').innerHTML = curDetail.sources.map((s, i) =>
    `<span class="src-dot ${i === srcIdx ? 'active' : ''}" data-i="${i}" title="${esc(s.quality || '')} ${esc(s.url)}">${s.quality || 'auto'}</span>`).join('');
  $$('.src-dot', $('#src-bar')).forEach(dot => dot.addEventListener('click', () => playSource(+dot.dataset.i)));
}
function destroyHls() {
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load();
}
function playSource(i) {
  if (!curDetail || !curDetail.sources[i]) return;
  srcIdx = i;
  destroyHls();
  const src = curDetail.sources[i];
  const v = $('#video');
  $('#p-status').textContent = `尝试源 ${i + 1}/${curDetail.sources.length} (${src.quality || 'auto'})…`;
  renderSrcBar();
  // 带 referrer/ua 的源：hls.js 无法直接设置请求头，尝试裸播（多数源无需）
  const url = src.url;
  if (url.includes('.m3u8') || url.includes('playlist')) {
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 20, enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, (ev, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // 网络错误：尝试下一源
            hls.destroy(); hls = null;
            autoNext('网络错误');
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            autoNext('解码错误');
          }
        }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        $('#p-status').textContent = `播放中 (${src.quality || 'auto'})`;
        $('#p-quality').textContent = src.quality || 'auto';
        playing = true;
      });
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.play().catch(() => autoNext('播放失败'));
    } else {
      $('#p-status').textContent = '浏览器不支持 HLS';
    }
  } else {
    // 非 m3u8（rtmp/mp4 等）——多数不可直接播，直接跳下一源
    autoNext('不支持的协议');
  }
}
function autoNext(reason) {
  if (!curDetail) return;
  const total = curDetail.sources.length;
  if (srcIdx < total - 1) {
    $('#p-status').textContent = `${reason} → 切换源 ${srcIdx + 2}/${total}`;
    playSource(srcIdx + 1);
  } else {
    $('#p-status').textContent = `所有 ${total} 个源均失败`;
    playing = false;
  }
}
// 手动切换
$('#p-switch').addEventListener('click', () => { if (curDetail && srcIdx < curDetail.sources.length - 1) playSource(srcIdx + 1); });
$('#p-close').addEventListener('click', closePlayer);
$('#player-overlay').addEventListener('click', e => { if (e.target.id === 'player-overlay') closePlayer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayer(); });
function closePlayer() { destroyHls(); $('#player-overlay').classList.add('hidden'); curDetail = null; playing = false; }

/* ---------- EPG（热门频道子集，预留） ---------- */
async function loadEpg() {
  const row = $('#epg-row');
  row.style.display = 'none';
  if (!curDetail) return;
  try {
    const r = await fetch(`data/epg/${encodeURIComponent(curDetail.id)}.json`);
    if (!r.ok) return;
    const epg = await r.json();
    const now = Date.now() / 1000;
    const cur = epg.find(p => now >= p.start && now < p.stop);
    if (cur) { $('#epg-now').textContent = cur.title; row.style.display = 'flex'; }
  } catch (e) {}
}

/* ---------- 工具 ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function flagEmoji(cc) {
  const map = { UK: '🇬🇧', CN: '🇨🇳', US: '🇺🇸', JP: '🇯🇵', KR: '🇰🇷', FR: '🇫🇷', DE: '🇩🇪', RU: '🇷🇺', IN: '🇮🇳', BR: '🇧🇷', CA: '🇨🇦', AU: '🇦🇺', IT: '🇮🇹', ES: '🇪🇸' };
  if (map[cc]) return map[cc];
  if (/^[A-Z]{2}$/.test(cc)) return cc.split('').map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
  return '🌍';
}
function catIcon(cat) {
  const m = { news: '📰', sports: '⚽', music: '🎵', movies: '🎬', kids: '🧸', documentary: '🎥', education: '🎓', religious: '⛪', entertainment: '🎭', general: '📺', culture: '🏛️', lifestyle: '🌿', series: '📺', shop: '🛍️' };
  return m[cat] || '📡';
}

loadIndex().catch(e => { $('#loading').textContent = '数据加载失败: ' + e.message; });
})();
