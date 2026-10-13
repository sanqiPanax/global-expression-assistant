import { STYLES } from './styles.js';
const $ = id => document.getElementById(id);
for (const [id, style] of Object.entries(STYLES)) {
  const option = document.createElement('option'); option.value = id; option.textContent = style.label; $('style').append(option);
}
function renderStyleHint() { $('style-hint').textContent = STYLES[$('style').value].description; }
renderStyleHint();
const storageKey = 'global-expression-drafts-v1';
let state = null;
let busy = false;
let currentId = null;
let demo = true;
let drafts = [];

function message(text) { $('message').textContent = text; }
function input() {
  return { source: $('source').value.trim(), type: $('type').value, style: $('style').value, mode: document.querySelector('input[name=mode]:checked').value, rules: [...document.querySelectorAll('.rule-options input:checked')].map(el => el.value) };
}
function fingerprint() { return JSON.stringify({ ...input(), posts: state?.posts.map(p => p.text) || [] }); }
function invalidate(resetConfirmation = false) {
  if (resetConfirmation) $('confirmed').checked = false;
  $('review-consent').checked = false;
  if (state) { state.check = { status: 'pending', issues: [], explanation: '内容或设置已修改，请重新检查。' }; state.checkedFingerprint = null; renderCheck(); }
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
    meta.append(copy); card.append(heading, editor, meta); $('posts').append(card);
  });
  $('summary').textContent = state.summaryZh || '暂无回译 / 要点。';
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
      state = { ...state, ...data };
      message(data.demo ? '演示已就绪。它是固定示例，不是你的输入的翻译。' : '草稿已就绪。请检查英文是否仍是你想表达的意思。');
    }
    state.checkedFingerprint = fingerprint();
    renderResult();
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
  try { localStorage.setItem(storageKey, JSON.stringify(drafts)); return true; }
  catch { message('浏览器存储不可用或已满；草稿仅保留在当前页面，请先复制内容。'); return false; }
}
function renderHistory() {
  $('history').replaceChildren();
  if (!drafts.length) { const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = '还没有保存的草稿。'; $('history').append(p); }
  for (const draft of drafts) {
    const card = document.createElement('article'); card.className = 'history-card';
    const date = document.createElement('time'); date.textContent = new Date(draft.updatedAt).toLocaleString();
    const preview = document.createElement('p'); preview.textContent = draft.input.source.slice(0, 100);
    const actions = document.createElement('div'); actions.className = 'actions';
    const open = document.createElement('button'); open.className = 'text-button'; open.textContent = '打开编辑 ↗';
    open.addEventListener('click', () => {
      if (busy) return;
      if (($('source').value.trim() || state) && !confirm('打开这条草稿会替换当前编辑内容。未保存的修改将丢失，是否继续？')) return;
      $('source').value = draft.input.source; $('type').value = draft.input.type; $('style').value = draft.input.style; renderStyleHint();
      document.querySelector(`input[name=mode][value="${draft.input.mode}"]`).checked = true;
      document.querySelectorAll('.rule-options input').forEach(el => { el.checked = draft.input.rules.includes(el.value); });
      state = structuredClone(draft.result); currentId = draft.id; invalidate(true); renderResult(); message('已载入草稿，请确认中文并重新检查。'); $('source').focus();
    });
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = '删除';
    remove.addEventListener('click', () => { if (!confirm('删除这条本机草稿？')) return; drafts = drafts.filter(d => d.id !== draft.id); if (currentId === draft.id) currentId = null; persist(); renderHistory(); });
    actions.append(open, remove); card.append(date, preview, actions); $('history').append(card);
  }
}

$('source').addEventListener('input', () => { invalidate(true); updateButtons(); });
for (const element of document.querySelectorAll('#type, #style, input[name=mode], .rule-options input')) element.addEventListener('change', () => invalidate());
$('style').addEventListener('change', () => {
  renderStyleHint();
  if (state?.posts.length) message(`已切换为“${STYLES[$('style').value].label”。点击“生成英文草稿”应用新风格。`);
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
  $('source').value = ''; state = null; currentId = null; $('confirmed').checked = false; $('review-consent').checked = false; renderResult(); message('已开始新草稿，已保存的历史不会删除。'); $('source').focus();
});
$('save').addEventListener('click', () => {
  if (!state || busy) return;
  currentId ||= crypto.randomUUID();
  const draft = { id: currentId, updatedAt: new Date().toISOString(), input: input(), result: structuredClone(state) };
  drafts = [draft, ...drafts.filter(d => d.id !== currentId)].slice(0, 100);
  const saved = persist(); renderHistory(); if (saved) message('草稿已保存在本机浏览器。再次保存会更新同一条记录。');
});
$('clear').addEventListener('click', () => { if (!confirm('清空当前浏览器中的全部草稿？此操作不可撤销。')) return; drafts = []; currentId = null; persist(); renderHistory(); });

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(stored)) throw new Error('格式错误');
  drafts = stored.filter(d => d && typeof d.id === 'string' && typeof d.updatedAt === 'string' && typeof d.input?.source === 'string' && ['post', 'thread'].includes(d.input.type) && typeof d.input.style === 'string' && Object.hasOwn(STYLES, d.input.style) && ['faithful', 'native'].includes(d.input.mode) && Array.isArray(d.input.rules) && Array.isArray(d.result?.posts) && d.result.posts.every(p => typeof p.text === 'string')).slice(0, 100);
} catch { $('storage-note').textContent = '本机草稿读取失败，当前页面仍可使用。'; }
renderHistory(); updateButtons();
try { const response = await fetch('/api/config'); if (!response.ok) throw new Error('连接失败'); const config = await response.json(); demo = config.demo; $('demo-banner').hidden = !demo; $('connection').textContent = demo ? 'DEMO MODE' : '模型已配置'; updateButtons(); }
catch { $('connection').textContent = '服务连接失败'; message('无法连接本地服务，请检查终端是否正在运行。'); }
