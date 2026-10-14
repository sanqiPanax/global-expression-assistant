import { STYLES } from './styles.js';
import { LIBRARY_KEY, LEGACY_KEY, emptyLibrary, matchesSearch, mergeLibraries, migrateDrafts, parseTags, validateLibrary, validatePublicationUrl } from './library.js';
import { createSpeaker } from './speech.js';
const $ = id => document.getElementById(id);
for (const [id, style] of Object.entries(STYLES)) {
  const option = document.createElement('option'); option.value = id; option.textContent = style.label; $('style').append(option);
}
function renderStyleHint() { $('style-hint').textContent = STYLES[$('style').value].description; }
renderStyleHint();
for (const [id, style] of Object.entries(STYLES)) { const option = document.createElement('option'); option.value = id; option.textContent = style.label; $('second-style').append(option); }
$('second-style').value = 'humorous';
let library = emptyLibrary();
let storageLocked = false;
let variants = [], activeVariant = 0;
let editingPublicationId = null, editingPhraseId = null;
let speaker;
let state = null;
let busy = false;
let currentId = null;
let demo = true;
let drafts = [];

function message(text) { $('message').textContent = text; }
function input() {
  const source = $('source').value.trim();
  return { source, type: $('type').value, style: $('style').value, mode: document.querySelector('input[name=mode]:checked').value, rules: [...document.querySelectorAll('.rule-options input:checked')].map(el => el.value), glossary: library.glossary.filter(t => source.toLowerCase().includes(t.zh.toLowerCase())).map(({ zh, en }) => ({ zh, en })) };
}
function fingerprint() { return JSON.stringify({ ...input(), posts: state?.posts.map(p => p.text) || [] }); }
function invalidate(resetConfirmation = false) {
  if (resetConfirmation) $('confirmed').checked = false;
  $('review-consent').checked = false;
  if (state) { state.check = { status: 'pending', issues: [], explanation: '内容或设置已修改，请重新检查。' }; state.checkedFingerprint = null; renderCheck(); }
  refreshLearning();
  updateButtons();
}
function canCopy() {
  if (!state || busy || !$('confirmed').checked || !state.posts.length || state.checkedFingerprint !== fingerprint() || !state.posts.every(p => p.valid)) return false;
  return state.check.status === 'pass' || (['review', 'demo'].includes(state.check.status) && $('review-consent').checked);
}
function updateButtons() {
  $('generate').disabled = busy || !$('source').value.trim() || !$('confirmed').checked;
  $('generate').textContent = busy ? '处理中，请稍候…' : demo ? '生成演示草稿 ↗' : '生成英文草稿 ↗';
  $('source-count').textContent = `${$('source').value.length} / 6000`;
  $('recheck').disabled = busy || !state?.posts.length || !$('confirmed').checked;
  $('copy-all').disabled = !canCopy();
  document.querySelectorAll('.copy-post').forEach(el => { el.disabled = !canCopy(); });
  $('save').disabled = busy || !state;
  $('record-published').disabled = busy || !state?.posts.length || state.demo;
  $('read-all').disabled = busy || !state?.posts.length || !speaker?.available;
  document.querySelectorAll('.read-english').forEach(el => { if (el.id !== 'read-all') el.disabled = !speaker?.available; });
  document.querySelectorAll('.explain-post, .use-variant').forEach(el => { el.disabled = busy || (!$('confirmed').checked && el.classList.contains('explain-post')); });
}
function renderCheck() {
  if (!state) return;
  const labels = { pass: '未发现命中项 · 发布前仍需人工审核', review: '需确认 · 请阅读以下提醒', blocked: '被个人规则拦截 · 修改内容或规则后重新检查', failed: '复检失败 · 不能视为通过', pending: '待重新检查', demo: '演示结果 · 未进行语义复检' };
  const status = state.check.status;
  $('check-status').textContent = `${labels[status]}${state.check.explanation ? `。${state.check.explanation}` : ''}`;
  $('check-status').dataset.state = status;
  $('issues').replaceChildren();
  const notes = [...state.check.issues.map(i => `${i.reason || i.label}${i.excerpt ? `（${i.excerpt}）` : ''}`), ...(state.warnings || [])];
  if (state.posts.some(p => !p.valid)) notes.push('存在超过 280 加权字符或不符合平台文本限制的帖子，请缩短后重新检查。');
  for (const note of notes) { const li = document.createElement('li'); li.textContent = note; $('issues').append(li); }
  $('review-consent-row').hidden = !['review', 'demo'].includes(status);
  updateButtons();
}
function renderResult() {
  $('empty').hidden = Boolean(state);
  $('result').hidden = !state;
  $('posts').replaceChildren();
  if (!state) { updateButtons(); return; }
  state.posts.forEach((post, index) => {
    const card = document.createElement('div'); card.className = 'post-card';
    const heading = document.createElement('div'); heading.className = 'post-heading';
    const title = document.createElement('label'); title.textContent = `POST ${String(index + 1).padStart(2, '0')}`; title.htmlFor = `post-${index}`;
    const count = document.createElement('span'); count.textContent = `${post.weightedLength} / 280 加权字符`;
    heading.append(title, count);
    const editor = document.createElement('textarea'); editor.id = `post-${index}`; editor.value = post.text; editor.maxLength = 5000; editor.lang = 'en';
    editor.addEventListener('input', () => { post.text = editor.value; post.valid = false; count.textContent = '已编辑 · 重新检查后更新字数'; invalidate(); });
    const meta = document.createElement('div'); meta.className = 'post-meta';
    const copy = document.createElement('button'); copy.className = 'text-button copy-post'; copy.textContent = '复制这条 ↗'; copy.addEventListener('click', () => copyText(post.text));
    meta.append(copy, button('朗读', () => speaker.speak(post.text), 'text-button read-english'), button('收藏表达', () => {
      const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
      openPhrase({ english: selected || post.text, context: input().source, tags: parseTags($('draft-tags').value) });
    }), button('改写解释', () => explainPost(index), 'text-button explain-post'));
    const learning = document.createElement('div'); learning.id = `learning-${index}`;
    card.append(heading, editor, meta, learning); $('posts').append(card);
  });
  $('summary').textContent = state.summaryZh || '暂无回译 / 要点。';
  renderVariants(); refreshLearning();
  renderCheck();
}
async function request(path, payload) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(155000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
async function run(reviewOnly = false) {
  if (busy || !$('confirmed').checked) return;
  if (input().glossary.length > 50) { message('原文命中的术语超过50项，请缩短原文或减少术语。'); return; }
  const pair = !reviewOnly && $('two-versions').checked;
  const secondStyle = $('second-style').value;
  if (pair && secondStyle === input().style) { message('请为第二版选择不同的语气。'); return; }
  const before = fingerprint();
  const payload = { ...input(), ...(reviewOnly ? { posts: state.posts.map(p => p.text) } : {}) };
  busy = true; updateButtons();
  message(reviewOnly ? '正在核对长度、原意与个人规则…' : demo ? '正在准备演示结果…' : '正在检查中文、生成英文并复检，通常需要一些时间…');
  // A new generation supersedes the old result; it cannot retain an old pass status.
  if (state) { state.check = { status: 'pending', issues: [] }; state.checkedFingerprint = null; renderCheck(); }
  try {
    const data = await request(reviewOnly ? '/api/review' : '/api/generate', payload);
    if (fingerprint() !== before) { message('请求期间内容发生变化，结果未覆盖当前草稿。请重新操作。'); return; }
    $('review-consent').checked = false;
    if (data.blocked) {
      state = { posts: [], summaryZh: '', warnings: [], check: data.check, demo };
      message('中文原文命中个人规则，尚未生成英文。');
    } else {
      state = reviewOnly ? { ...state, ...data } : data;
      message(data.demo ? '演示已就绪。它是固定示例，不是你的输入的翻译。' : '草稿已就绪。请检查英文是否仍是你想表达的意思。');
    }
    state.checkedFingerprint = fingerprint();
    if (!reviewOnly) { variants = [{ input: { ...payload }, result: state }]; activeVariant = 0; }
    else if (variants[activeVariant]) variants[activeVariant].result = state;
    renderResult();
    if (pair && !data.blocked) {
      const afterFirst = fingerprint();
      message('第一版已保留，正在生成并检查第二版…');
      try {
        const second = await request('/api/generate', { ...payload, style: secondStyle });
        if (fingerprint() !== afterFirst) { message('内容已修改，第二版未覆盖当前编辑内容。'); return; }
        const result = second.blocked ? { posts: [], summaryZh: '', warnings: [], check: second.check, demo } : second;
        variants.push({ input: { ...payload, style: secondStyle }, result });
        renderVariants();
        message('两版已就绪。可对照阅读，选择一版后编辑、复制或保存。');
      } catch (error) { message(`第一版已保留；第二版失败：${error.message}。未自动重试。`); }
    }
  } catch (error) {
    if (reviewOnly && state) { state.check = { status: 'failed', issues: [], explanation: '检查失败，请重试。' }; state.checkedFingerprint = null; renderCheck(); }
    message(`${error.name === 'TimeoutError' ? '请求超时；原文已保留，未自动重试。' : error.message} 原文已保留。`);
  } finally { busy = false; updateButtons(); }
}
async function copyText(text) {
  if (!canCopy()) return;
  try { await navigator.clipboard.writeText(text); message('已复制。请自行粘贴到 X，审核后发布。'); }
  catch { message('浏览器不允许自动复制，请在英文输入框中手动选择并复制。'); }
}
function persist() {
  const candidate = drafts;
  const saved = commitLibrary(next => { next.drafts = candidate; });
  if (!saved) drafts = library.drafts;
  return saved;
}
function renderHistory() {
  $('history').replaceChildren();
  const found = drafts.filter(visible);
  if (!found.length) empty($('history'), '没有符合条件的草稿。');
  for (const draft of found) {
    const card = document.createElement('article'); card.className = 'history-card';
    const date = document.createElement('time'); date.textContent = new Date(draft.updatedAt).toLocaleString();
    const preview = document.createElement('p'); preview.textContent = draft.input.source.slice(0, 100);
    const actions = document.createElement('div'); actions.className = 'actions';
    const open = document.createElement('button'); open.className = 'text-button'; open.textContent = '打开编辑 ↗';
    open.addEventListener('click', () => {
      if (busy) return;
      if (($('source').value.trim() || state) && !confirm('打开这条草稿会替换当前编辑内容。未保存的修改将丢失，是否继续？')) return;
      $('source').value = draft.input.source; $('type').value = draft.input.type; $('style').value = draft.input.style; renderStyleHint();
      $('draft-tags').value = (draft.tags || []).join('，');
      document.querySelector(`input[name=mode][value="${draft.input.mode}"]`).checked = true;
      document.querySelectorAll('.rule-options input').forEach(el => { el.checked = draft.input.rules.includes(el.value); });
      variants = structuredClone(draft.variants || []); activeVariant = draft.activeVariant || 0;
      variants.forEach(v => { v.result.check = { status: 'pending', issues: [] }; });
      state = structuredClone(draft.result); if (variants[activeVariant]) variants[activeVariant].result = state;
      $('two-versions').checked = variants.length === 2; $('second-style-row').hidden = variants.length !== 2;
      if (variants.length === 2) $('second-style').value = variants[1 - activeVariant].input.style;
      currentId = draft.id; invalidate(true); renderResult(); message('已载入草稿，请确认中文并重新检查。'); $('source').focus();
    });
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = '删除';
    remove.addEventListener('click', () => { if (!confirm('删除这条本机草稿？')) return; drafts = drafts.filter(d => d.id !== draft.id); if (persist()) { if (currentId === draft.id) currentId = null; renderLibrary(); } });
    actions.append(open, button('标签', () => editTags('drafts', draft)), remove); card.append(date, preview, tagsNode(draft.tags || []), actions); $('history').append(card);
  }
}

function button(label, action, className = 'text-button') {
  const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = label;
  el.addEventListener('click', event => {
    try { const result = action(event); if (result?.catch) result.catch(error => message(error.message)); }
    catch (error) { message(error.message); }
  });
  return el;
}
function paragraph(value, className = '') { const p = document.createElement('p'); p.textContent = value; p.className = className; return p; }
function empty(target, value) { target.append(paragraph(value, 'history-empty')); }
function tagsNode(tags) {
  const row = document.createElement('div'); row.className = 'tags';
  for (const tag of tags) row.append(button(`#${tag}`, () => { $('tag-filter').value = tag; renderLibrary(); }, 'tag'));
  return row;
}
function contextKey(value) { const { style, ...rest } = value; return JSON.stringify(rest); }
function renderVariants() {
  $('variants').replaceChildren(); $('variants').hidden = variants.length < 2;
  if (variants.length < 2) return;
  variants.forEach((variant, index) => {
    const card = document.createElement('article'); card.className = 'variant-card';
    card.append(paragraph(`版本 ${index ? 'B' : 'A'} · ${STYLES[variant.input.style].label}${index === activeVariant ? ' · 当前编辑' : ''}`, 'variant-title'));
    for (const post of variant.result.posts) card.append(paragraph(post.text, 'english-text'));
    if (!variant.result.posts.length) card.append(paragraph('这版被个人规则拦截。', 'muted'));
    if (index !== activeVariant && variant.result.posts.length) card.append(button('使用这版', () => {
      if (busy) return;
      const sameContext = contextKey(input()) === contextKey(variant.input);
      activeVariant = index; state = variant.result; $('style').value = variant.input.style; renderStyleHint(); $('review-consent').checked = false;
      if (sameContext && state.check.status !== 'pending') state.checkedFingerprint = fingerprint();
      else state.check = { status: 'pending', issues: [], explanation: '原文或设置已改变，请重新检查。' };
      renderResult(); message('已切换编辑版本。请对照中文原意审核这版英文。');
    }, 'secondary use-variant'));
    $('variants').append(card);
  });
}
function refreshLearning() {
  state?.posts.forEach((post, index) => {
    const wrapper = $(`learning-${index}`); if (!wrapper) return; wrapper.replaceChildren();
    const learning = post.learning; if (!learning) return;
    if (learning.textSnapshot !== post.text || learning.sourceSnapshot !== input().source || learning.glossarySnapshot !== JSON.stringify(input().glossary)) {
      wrapper.append(paragraph('原文、英文或术语已修改，之前的改写解释待更新。', 'muted')); return;
    }
    const details = document.createElement('details'); details.className = 'learning'; details.open = true;
    const summary = document.createElement('summary'); summary.textContent = learning.demo ? '演示解释' : '改写解释 · 学习表达';
    details.append(summary, paragraph(learning.summaryZh));
    for (const phrase of learning.phrases) {
      const item = document.createElement('div'); item.className = 'learning-phrase';
      item.append(paragraph(phrase.english, 'english-text'), paragraph(phrase.meaningZh), paragraph(phrase.usageZh, 'muted'), button('收藏这个表达', () => openPhrase({ english: phrase.english, meaningZh: phrase.meaningZh, context: input().source, tags: parseTags($('draft-tags').value) })), button('朗读', () => speaker.speak(phrase.english), 'text-button read-english'));
      details.append(item);
    }
    details.append(paragraph('这是模型的语言学习说明，可能有误，不代表事实核查或检查通过。', 'privacy-note'));
    wrapper.append(details);
  });
}
async function explainPost(index) {
  if (busy || !$('confirmed').checked) return;
  const post = state.posts[index], before = fingerprint();
  busy = true; updateButtons(); message('正在解释这段英文的措辞与语气…');
  try {
    const data = await request('/api/explain', { ...input(), text: post.text });
    if (fingerprint() !== before) { message('文本已改变，旧版本解释未应用。'); return; }
    if (data.blocked) throw new Error(data.error);
    post.learning = { ...data, textSnapshot: post.text, sourceSnapshot: input().source, glossarySnapshot: JSON.stringify(input().glossary) };
    refreshLearning(); message(data.demo ? '已展示演示说明，未调用真实模型。' : '改写解释已就绪，可收藏其中的表达。');
  } catch (error) { message(`解释失败：${error.message}。英文和检查状态已保留。`); }
  finally { busy = false; updateButtons(); }
}
function bootLibrary() {
  try {
    const stored = localStorage.getItem(LIBRARY_KEY);
    if (stored) library = validateLibrary(JSON.parse(stored));
    else {
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) { library = migrateDrafts(JSON.parse(old)); localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); localStorage.removeItem(LEGACY_KEY); }
    }
    drafts = library.drafts;
  } catch {
    storageLocked = true; drafts = library.drafts;
    $('storage-note').textContent = '本机资料读取或迁移失败。为避免覆盖，保存已暂停；请先导出原始备份，再导入有效备份恢复。';
  }
}
function commitLibrary(mutator, allowRecovery = false) {
  if (storageLocked && !allowRecovery) { message('资料无法读取，未覆盖旧数据。请先导出原始备份，再恢复。'); return false; }
  try {
    const next = structuredClone(library); mutator(next);
    const validated = validateLibrary(next);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(validated));
    library = validated; drafts = library.drafts; storageLocked = false;
    return true;
  } catch (error) { message(`未保存：${error.message}。现有资料未覆盖，当前编辑仍在页面中。`); return false; }
}
function visible(item) { return matchesSearch(item, $('search').value, $('tag-filter').value); }
function editTags(collection, item) {
  const value = prompt('主题标签，使用逗号分隔（最多10个）：', (item.tags || []).join('，')); if (value === null) return;
  const tags = parseTags(value);
  if (commitLibrary(next => { const found = next[collection].find(v => v.id === item.id); found.tags = tags; found.updatedAt = new Date().toISOString(); })) renderLibrary();
}
function removeItem(collection, item) {
  if (!confirm('删除这条本机记录？此操作不可撤销。')) return;
  const before = contextKey(input());
  if (commitLibrary(next => { next[collection] = next[collection].filter(v => v.id !== item.id); })) { renderLibrary(); if (before !== contextKey(input())) invalidate(); }
}
function renderLibrary() {
  const selected = $('tag-filter').value;
  const tags = [...new Set([...library.drafts, ...library.publications, ...library.phrases].flatMap(v => v.tags || []))].sort();
  $('tag-filter').replaceChildren(new Option('全部主题', ''));
  for (const tag of tags) $('tag-filter').append(new Option(tag, tag));
  $('tag-filter').value = tags.includes(selected) ? selected : '';
  renderHistory(); renderPublications(); renderPhrases(); renderGlossary(); updateButtons();
}
function localDate(value = new Date().toISOString()) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function openPublication(record) {
  const data = record || { sourceTextZh: '', posts: [{ text: '', sourceZh: '' }], tags: [], publishedAt: new Date().toISOString(), url: '' };
  editingPublicationId = data.id || null;
  $('publication-source').value = data.sourceTextZh; $('publication-date').value = localDate(data.publishedAt); $('publication-tags').value = data.tags.join('，'); $('publication-url').value = data.url || ''; $('publication-confirm').checked = false;
  $('publication-posts').replaceChildren();
  data.posts.forEach((post, index) => {
    const pair = document.createElement('div'); pair.className = 'publication-edit-pair';
    const enLabel = document.createElement('label'); enLabel.textContent = `第 ${index + 1} 条最终英文`;
    const en = document.createElement('textarea'); en.value = post.text; en.lang = 'en'; en.maxLength = 5000; en.required = true; en.className = 'published-en'; enLabel.append(en);
    const zhLabel = document.createElement('label'); zhLabel.textContent = '该条中文（可选，手动整理）';
    const zh = document.createElement('textarea'); zh.value = post.sourceZh || ''; zh.maxLength = 6000; zh.className = 'published-zh'; zhLabel.append(zh);
    pair.append(enLabel, zhLabel, button('删除这条', () => {
      if ($('publication-posts').children.length < 2) { $('publication-form').querySelector('.form-error').textContent = '至少保留一条英文。'; return; }
      pair.remove();
      [...$('publication-posts').children].forEach((row, i) => { row.querySelector('label').firstChild.textContent = `第 ${i + 1} 条最终英文`; });
    }, 'text-button remove-published-post')); $('publication-posts').append(pair);
  });
  $('publication-form').querySelector('.form-error').textContent = ''; $('publication-dialog').showModal();
}
function renderPublications() {
  $('publications').replaceChildren();
  const found = library.publications.filter(visible); if (!found.length) empty($('publications'), '还没有符合条件的发布记录。');
  for (const record of found) {
    const card = document.createElement('article'); card.className = 'publication-card';
    card.append(paragraph(`已发布 · ${new Date(record.publishedAt).toLocaleString()}`, 'muted'), tagsNode(record.tags));
    const source = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '查看完整中文原文'; source.append(summary, paragraph(record.sourceTextZh)); card.append(source);
    record.posts.forEach((post, index) => {
      const pair = document.createElement('div'); pair.className = 'translation-pair';
      pair.append(paragraph(post.sourceZh || (record.posts.length === 1 ? record.sourceTextZh : '该条中文未手动整理，请对照上方完整原文。'), 'translation-zh'));
      const english = paragraph(post.text, 'english-text'); english.lang = 'en'; pair.append(english);
      pair.append(button(`朗读第${index + 1}条`, () => speaker.speak(post.text), 'text-button read-english'), button('收藏英文', () => {
        const selection = window.getSelection();
        const selected = selection && english.contains(selection.anchorNode) && english.contains(selection.focusNode) ? selection.toString().trim() : '';
        openPhrase({ english: selected || post.text, context: post.sourceZh || record.sourceTextZh, tags: record.tags });
      })); card.append(pair);
    });
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('编辑最终版本', () => openPublication(record)), button('删除', () => removeItem('publications', record)));
    if (record.url) { const link = document.createElement('a'); link.href = record.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看 X 帖子 ↗'; actions.append(link); }
    card.append(actions); $('publications').append(card);
  }
}
function openPhrase(value = {}) {
  if ((value.english || '').length > 1000) { message('收藏表达最多1000字符，请先选中一个句子或短语。'); return; }
  editingPhraseId = value.id || null;
  $('phrase-en').value = value.english || ''; $('phrase-zh').value = value.meaningZh || ''; $('phrase-context').value = value.context || ''; $('phrase-tags').value = (value.tags || []).join('，');
  $('phrase-form').querySelector('.form-error').textContent = ''; $('phrase-dialog').showModal();
}
function renderPhrases() {
  $('phrases').replaceChildren(); const found = library.phrases.filter(visible); if (!found.length) empty($('phrases'), '还没有符合条件的英文表达。');
  for (const phrase of found) {
    const card = document.createElement('article'); card.className = 'phrase-card';
    card.append(paragraph(phrase.english, 'english-text'), paragraph(phrase.meaningZh || '尚未填写中文含义'), paragraph(phrase.context, 'muted'), tagsNode(phrase.tags));
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('朗读', () => speaker.speak(phrase.english), 'text-button read-english'), button('编辑', () => openPhrase(phrase)), button('删除', () => removeItem('phrases', phrase))); card.append(actions); $('phrases').append(card);
  }
}
function renderGlossary() {
  $('glossary').replaceChildren(); const found = library.glossary.filter(visible); if (!found.length) empty($('glossary'), '还没有符合条件的术语。');
  for (const term of found) {
    const row = document.createElement('div'); row.className = 'glossary-row'; row.append(paragraph(`${term.zh} → ${term.en}`), button('编辑', () => { $('term-zh').value = term.zh; $('term-en').value = term.en; $('term-en').focus(); }), button('删除', () => removeItem('glossary', term))); $('glossary').append(row);
  }
}
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('two-versions').addEventListener('change', () => { $('second-style-row').hidden = !$('two-versions').checked; });
$('read-all').addEventListener('click', () => { if (state?.posts.length) speaker.speak(state.posts.map(p => p.text).join('\n')); });
$('stop-speech').addEventListener('click', () => speaker.stop());
$('search').addEventListener('input', renderLibrary); $('tag-filter').addEventListener('change', renderLibrary);
$('record-published').addEventListener('click', () => {
  if (!state?.posts.length || state.demo) return;
  try { openPublication({ sourceTextZh: input().source, posts: state.posts.map(p => ({ text: p.text, sourceZh: '' })), tags: parseTags($('draft-tags').value), publishedAt: new Date().toISOString(), url: '' }); }
  catch (error) { message(error.message); }
});
$('add-publication').addEventListener('click', () => openPublication());
$('add-published-post').addEventListener('click', () => {
  const posts = [...document.querySelectorAll('.publication-edit-pair')].map(row => ({ text: row.querySelector('.published-en').value, sourceZh: row.querySelector('.published-zh').value }));
  if (posts.length >= 6) { $('publication-form').querySelector('.form-error').textContent = 'Thread 最多6条。'; return; }
  const saved = { id: editingPublicationId, sourceTextZh: $('publication-source').value, publishedAt: new Date($('publication-date').value || new Date()).toISOString(), tags: [], url: $('publication-url').value, posts: [...posts, { text: '', sourceZh: '' }] };
  const tags = $('publication-tags').value;
  $('publication-dialog').close(); openPublication(saved); $('publication-tags').value = tags;
});
$('add-phrase').addEventListener('click', () => openPhrase());
document.querySelectorAll('.close-dialog').forEach(el => el.addEventListener('click', () => el.closest('dialog').close()));
$('publication-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const record = { id: editingPublicationId || crypto.randomUUID(), updatedAt: new Date().toISOString(), publishedAt: new Date($('publication-date').value).toISOString(), sourceTextZh: $('publication-source').value.trim(), posts: [...document.querySelectorAll('.publication-edit-pair')].map(row => ({ text: row.querySelector('.published-en').value.trim(), sourceZh: row.querySelector('.published-zh').value.trim() })), tags: parseTags($('publication-tags').value), url: validatePublicationUrl($('publication-url').value) };
    if (!$('publication-confirm').checked) throw new Error('请先确认已实际发布并核对最终版本');
    if (commitLibrary(next => { next.publications = [record, ...next.publications.filter(v => v.id !== record.id)]; })) { $('publication-dialog').close(); renderLibrary(); message('最终中英对照已保存为发布记录。'); }
    else $('publication-form').querySelector('.form-error').textContent = '保存失败，表单已保留，请检查存储空间。';
  } catch (error) { $('publication-form').querySelector('.form-error').textContent = error.message; }
});
$('phrase-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const phrase = { id: editingPhraseId || crypto.randomUUID(), updatedAt: new Date().toISOString(), english: $('phrase-en').value.trim(), meaningZh: $('phrase-zh').value.trim(), context: $('phrase-context').value.trim(), tags: parseTags($('phrase-tags').value) };
    if (commitLibrary(next => { next.phrases = [phrase, ...next.phrases.filter(v => v.id !== phrase.id)]; })) { $('phrase-dialog').close(); renderLibrary(); message('英文表达已收藏。'); }
    else $('phrase-form').querySelector('.form-error').textContent = '保存失败，表单已保留。';
  } catch (error) { $('phrase-form').querySelector('.form-error').textContent = error.message; }
});
$('glossary-form').addEventListener('submit', event => {
  event.preventDefault(); const before = contextKey(input());
  const zh = $('term-zh').value.trim(), en = $('term-en').value.trim();
  const existing = library.glossary.find(v => v.zh.toLowerCase() === zh.toLowerCase());
  const term = { id: existing?.id || crypto.randomUUID(), updatedAt: new Date().toISOString(), zh, en };
  if (commitLibrary(next => { next.glossary = [term, ...next.glossary.filter(v => v.id !== term.id)]; })) { $('glossary-form').reset(); renderLibrary(); if (before !== contextKey(input())) invalidate(); message('术语已保存。下次生成将使用原文命中的固定写法。'); }
});
$('export-backup').addEventListener('click', () => {
  try {
    const raw = storageLocked ? (localStorage.getItem(LIBRARY_KEY) || localStorage.getItem(LEGACY_KEY) || 'null') : JSON.stringify({ ...library, exportedAt: new Date().toISOString() }, null, 2);
    download(raw, `global-expression-${storageLocked ? 'recovery' : 'backup'}-${localDate().slice(0, 10)}.json`);
    message('备份已导出。请妥善保存其中的个人内容；尚未保存的编辑不在备份中。');
  } catch (error) { message(`导出失败：${error.message}`); }
});
$('import-backup').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', async () => {
  const file = $('backup-file').files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('备份不能超过10MB');
    const incoming = validateLibrary(JSON.parse(await file.text()));
    if (!confirm(storageLocked ? '现有资料无法读取，请先导出原始数据。用这份有效备份恢复，是否继续？' : '将合并备份资料；相同ID保留更新时间较新的记录。是否继续？')) return;
    const before = contextKey(input()); const merged = mergeLibraries(library, incoming);
    if (commitLibrary(next => Object.assign(next, merged), true)) {
      localStorage.removeItem(LEGACY_KEY); renderLibrary(); if (before !== contextKey(input())) invalidate();
      $('storage-note').textContent = '资料已合并恢复。全部资料保存在当前浏览器，请定期导出备份。'; message('备份已合并；重复导入不会重复添加相同ID的记录。');
    }
  } catch (error) { message(`导入失败：${error.message}。现有资料未覆盖。`); }
  finally { $('backup-file').value = ''; }
});

$('source').addEventListener('input', () => { invalidate(true); updateButtons(); });
for (const element of document.querySelectorAll('#type, #style, input[name=mode], .rule-options input')) element.addEventListener('change', () => invalidate());
$('style').addEventListener('change', () => {
  renderStyleHint();
  if (state?.posts.length) message(`已切换为“${STYLES[$('style').value].label}”。点击“生成英文草稿”应用新风格。`);
});
$('confirmed').addEventListener('change', updateButtons);
$('review-consent').addEventListener('change', updateButtons);
$('generate').addEventListener('click', () => run());
$('recheck').addEventListener('click', () => run(true));
$('copy-all').addEventListener('click', () => copyText(state.posts.map(p => p.text).join('\n\n')));
$('sample').addEventListener('click', () => {
  if ($('source').value.trim() && !confirm('用示例替换当前中文输入？')) return;
  $('source').value = '今天试了一个开源工具，帮我省下了大约 20 分钟。不过只试了一次，还不能确定它是否适合长期使用。我打算下周在真实工作流程里再测一次。'; invalidate(true); $('source').focus();
});
$('new-draft').addEventListener('click', () => {
  if (busy) return;
  if (($('source').value.trim() || state) && !confirm('开始新草稿会清空当前编辑内容。请先保存需要保留的修改，是否继续？')) return;
  $('source').value = ''; $('draft-tags').value = ''; state = null; variants = []; activeVariant = 0; currentId = null; $('confirmed').checked = false; $('review-consent').checked = false; speaker.stop(); renderResult(); message('已开始新草稿，已保存的历史不会删除。'); $('source').focus();
});
$('save').addEventListener('click', () => {
  if (!state || busy) return;
  currentId ||= crypto.randomUUID();
  try {
    const draft = { id: currentId, updatedAt: new Date().toISOString(), input: input(), result: structuredClone(state), tags: parseTags($('draft-tags').value), variants: structuredClone(variants), activeVariant };
    drafts = [draft, ...drafts.filter(d => d.id !== currentId)];
    const saved = persist(); renderLibrary(); if (saved) message('草稿已保存在本机浏览器。再次保存会更新同一条记录。');
  } catch (error) { message(error.message); }
});
$('clear').addEventListener('click', () => { if (!confirm('清空当前浏览器中的全部草稿？此操作不可撤销。')) return; drafts = []; if (persist()) { currentId = null; renderLibrary(); } });

bootLibrary();
speaker = createSpeaker($('voice'), $('speech-rate'), $('speech-status'), updateButtons);
renderLibrary(); updateButtons();
try { const response = await fetch('/api/config'); if (!response.ok) throw new Error('连接失败'); const config = await response.json(); demo = config.demo; $('demo-banner').hidden = !demo; $('connection').textContent = demo ? 'DEMO MODE' : '模型已配置'; updateButtons(); }
catch { $('connection').textContent = '服务连接失败'; message('无法连接本地服务，请检查终端是否正在运行。'); }
