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
  if (q) list = list.filter(c => c.n.toLowerCase().includes(q)
    || (c.an || []).some(a => a.toLowerCase().includes(q))
    || (c.g || []).some(g => g.includes(q)));
  return list;
}
function renderGrid() {
  const grid = $('#ch-grid');
  const list = filtered();
  if (!list.length) { grid.innerHTML = `<div class="empty">${_t('empty')}</div>`; return; }
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
      <div class="ccnt">${it.count} ${_t('channels')}</div>
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
      <div class="ccnt">${n} ${_t('channels')}</div>
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
  $('#about-title').textContent = _t('about_title');
  $('#about-desc').textContent = _t('about_desc');
  $('#about-src').textContent = _t('about_src');
  $('#legal').textContent = _t('legal');
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
  $('#p-source-count').textContent = `${curDetail.sources.length} ${_t('sources')}`;
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
  $('#p-status').textContent = `${_t('try_src')} ${i + 1}/${curDetail.sources.length} (${src.quality || 'auto'})…`;
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
        $('#p-status').textContent = `${_t('playing')} (${src.quality || 'auto'})`;
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
    $('#p-status').textContent = `${reason} → ${_t('try_src')} ${srcIdx + 2}/${total}`;
    playSource(srcIdx + 1);
  } else {
    $('#p-status').textContent = `${_t('all_failed')} ${total} ${_t('failed')}`;
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

/* ---------- 多语言 i18n ---------- */
const I18N = {
  zh: { search_ph: '搜索频道… (如 CNN / BBC / 央视)', tab_browse: '频道', tab_countries: '国家', tab_categories: '分类', tab_about: '关于', all_country: '全部国家', all_category: '全部分类', loading: '加载中…', empty: '没有匹配的频道', sources: '源', about_title: '📺 WebTV — 开源 IPTV 播放平台', about_desc: '聚合全球公开免费的电视直播频道，支持多源自动切换与节目单。', about_src: '📡 数据来源', legal: '本项目仅聚合公开可用流地址，不托管任何视频内容；版权归原频道所有。', try_src: '尝试源', playing: '播放中', all_failed: '所有', failed: '个源均失败', no_hls: '浏览器不支持 HLS', switch_next: '切换下一源', epg_label: '📋 节目', channels: '频道' },
  en: { search_ph: 'Search channels… (e.g. CNN / BBC / CCTV)', tab_browse: 'Channels', tab_countries: 'Countries', tab_categories: 'Categories', tab_about: 'About', all_country: 'All countries', all_category: 'All categories', loading: 'Loading…', empty: 'No matching channels', sources: 'sources', about_title: '📺 WebTV — Open-Source IPTV Platform', about_desc: 'Free public live TV channels from around the world, with multi-source auto-failover and EPG.', about_src: '📡 Data Sources', legal: 'This site only aggregates publicly available streams. No content is hosted here; all rights belong to original broadcasters.', try_src: 'Trying source', playing: 'Playing', all_failed: 'All', failed: 'sources failed', no_hls: 'HLS not supported in this browser', switch_next: 'Next source', epg_label: '📋 Now', channels: 'channels' },
  es: { search_ph: 'Buscar canales… (ej. CNN / BBC)', tab_browse: 'Canales', tab_countries: 'Países', tab_categories: 'Categorías', tab_about: 'Acerca', all_country: 'Todos los países', all_category: 'Todas las categorías', loading: 'Cargando…', empty: 'Sin canales coincidentes', sources: 'fuentes', about_title: '📺 WebTV — Plataforma IPTV Open Source', about_desc: 'Canales de TV gratuitos de todo el mundo con cambio automático de fuente y EPG.', about_src: '📡 Fuentes de datos', legal: 'Este sitio solo agrega transmisiones públicas. No se aloja contenido; los derechos pertenecen a los emisores.', try_src: 'Probando fuente', playing: 'Reproduciendo', all_failed: 'Todas', failed: 'fuentes fallaron', no_hls: 'HLS no soportado', switch_next: 'Siguiente fuente', epg_label: '📋 Ahora', channels: 'canales' },
  fr: { search_ph: 'Rechercher… (ex. CNN / BBC)', tab_browse: 'Chaînes', tab_countries: 'Pays', tab_categories: 'Catégories', tab_about: 'À propos', all_country: 'Tous les pays', all_category: 'Toutes les catégories', loading: 'Chargement…', empty: 'Aucune chaîne trouvée', sources: 'sources', about_title: '📺 WebTV — Plateforme IPTV Open Source', about_desc: 'Chaînes TV gratuites du monde entier avec bascule automatique multi-source et EPG.', about_src: '📡 Sources de données', legal: 'Ce site agrège uniquement des flux publics. Aucun contenu hébergé; droits aux diffuseurs.', try_src: 'Essai source', playing: 'Lecture', all_failed: 'Toutes', failed: 'sources échouées', no_hls: 'HLS non supporté', switch_next: 'Source suivante', epg_label: '📋 En cours', channels: 'chaînes' },
  ru: { search_ph: 'Поиск каналов… (напр. CNN / BBC)', tab_browse: 'Каналы', tab_countries: 'Страны', tab_categories: 'Категории', tab_about: 'О сайте', all_country: 'Все страны', all_category: 'Все категории', loading: 'Загрузка…', empty: 'Ничего не найдено', sources: 'источники', about_title: '📺 WebTV — Open Source IPTV', about_desc: 'Бесплатные ТВ-каналы со всего мира с автопереключением источников и EPG.', about_src: '📡 Источники данных', legal: 'Сайт агрегирует только публичные потоки. Контент не размещается; права принадлежат вещателям.', try_src: 'Пробуем источник', playing: 'Воспроизведение', all_failed: 'Все', failed: 'источников недоступны', no_hls: 'HLS не поддерживается', switch_next: 'Следующий источник', epg_label: '📋 Сейчас', channels: 'каналов' },
  ja: { search_ph: 'チャンネル検索… (例: CNN / BBC)', tab_browse: 'チャンネル', tab_countries: '国', tab_categories: 'カテゴリ', tab_about: '情報', all_country: 'すべての国', all_category: 'すべてのカテゴリ', loading: '読み込み中…', empty: '一致するチャンネルなし', sources: 'ソース', about_title: '📺 WebTV — オープンソース IPTV', about_desc: '世界中の無料テレビチャンネル、マルチソース自動切替とEPG対応。', about_src: '📡 データソース', legal: '公開ストリームのみを集約。コンテンツはホストせず、権利は放送局に帰属。', try_src: 'ソース試行中', playing: '再生中', all_failed: 'すべての', failed: 'ソースが失敗', no_hls: 'HLS未対応ブラウザ', switch_next: '次のソース', epg_label: '📋 現在', channels: 'チャンネル' },
};
let LANG = localStorage.getItem('webtv_lang') || (navigator.language || 'en').slice(0, 2);
if (!I18N[LANG]) LANG = 'en';
function t(key) { return (I18N[LANG] || I18N.en)[key] || I18N.en[key] || key; }
function applyI18n() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach(el => { el.placeholder = t(el.dataset.i18n); });
  $$('.nav-tab').forEach(el => { el.textContent = t('tab_' + el.dataset.view); });
  $('#f-country').options[0].textContent = t('all_country');
  $('#f-category').options[0].textContent = t('all_category');
  $('#p-switch').textContent = t('switch_next');
  $('#lang-sel').value = LANG;
}
$('#lang-sel').addEventListener('change', e => {
  LANG = e.target.value; localStorage.setItem('webtv_lang', LANG); applyI18n(); renderGrid(); renderCountries(); renderCategories();
});
// 挂接渲染里的文案
const _t = t;

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
applyI18n();
})();
