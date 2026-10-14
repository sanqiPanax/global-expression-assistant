import { STYLES } from './styles.js';
export const LIBRARY_KEY = 'global-expression-library-v1';
export const LEGACY_KEY = 'global-expression-drafts-v1';
export const BACKUP_APP = 'global-expression-assistant';
const ruleIds = ['politics', 'sexual', 'crypto'];
const statuses = ['pass', 'review', 'blocked', 'failed', 'pending', 'demo'];
export function emptyLibrary() { return { app: BACKUP_APP, version: 1, drafts: [], publications: [], phrases: [], glossary: [] }; }
function text(value, limit, label, required = true) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error(`${label}格式不正确`);
  return value;
}
function array(value, limit, label) {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`${label}数量或格式不正确`);
  return value;
}
function date(value) {
  const str = text(value, 40, '日期');
  if (!Number.isFinite(Date.parse(str))) throw new Error('日期格式不正确');
  return str;
}
function identity(value) { return { id: text(value.id, 100, '记录ID'), updatedAt: date(value.updatedAt) }; }
export function parseTags(value) {
  const values = typeof value === 'string' ? value.split(/[,，、]/) : array(value, 10, '标签');
  const tags = [...new Set(values.map(v => text(v, 300, '标签', false).trim().replace(/^#/, '')).filter(Boolean))];
  if (tags.length > 10 || tags.some(v => v.length > 30)) throw new Error('最多10个标签，每个不超过30字');
  return tags;
}
export function validateGlossary(value = [], limit = 50) {
  const terms = array(value, limit, '术语').map(v => ({ zh: text(v?.zh, 80, '中文术语').trim(), en: text(v?.en, 120, '英文术语').trim() }));
  if (new Set(terms.map(v => v.zh.toLowerCase())).size !== terms.length) throw new Error('中文术语不能重复');
  return terms;
}
export function validateExplanation(value) {
  return {
    summaryZh: text(value?.summaryZh, 2500, '解释'),
    phrases: array(value?.phrases, 8, '表达解释').map(p => ({ english: text(p?.english, 300, '英文表达'), meaningZh: text(p?.meaningZh, 500, '中文含义'), usageZh: text(p?.usageZh, 700, '使用说明') }))
  };
}
export function validatePublicationUrl(value = '') {
  const raw = text(value, 500, '帖子链接', false).trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('请输入完整的 X 帖子链接'); }
  if (url.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname) || url.username || url.password || !/\/status\/\d+/.test(url.pathname)) throw new Error('链接必须是 https://x.com/…/status/… 或 twitter.com 帖子');
  return url.href;
}
function input(value) {
  if (!value || !['post', 'thread'].includes(value.type) || !Object.hasOwn(STYLES, value.style) || !['faithful', 'native'].includes(value.mode)) throw new Error('草稿设置不正确');
  const rules = array(value.rules, 3, '个人规则');
  if (rules.some(r => !ruleIds.includes(r))) throw new Error('个人规则不正确');
  return { source: text(value.source, 6000, '中文原文'), type: value.type, style: value.style, mode: value.mode, rules: [...new Set(rules)], glossary: validateGlossary(value.glossary || []) };
}
function result(value) {
  if (!value || !statuses.includes(value.check?.status)) throw new Error('检查状态不正确');
  return {
    posts: array(value.posts, 6, '帖子').map(p => {
      const post = { text: text(p?.text, 5000, '英文帖子'), weightedLength: Number.isFinite(p.weightedLength) ? p.weightedLength : 0, valid: p.valid === true };
      if (p.learning) post.learning = { ...validateExplanation(p.learning), textSnapshot: text(p.learning.textSnapshot, 5000, '解释英文快照'), sourceSnapshot: text(p.learning.sourceSnapshot, 6000, '解释中文快照'), glossarySnapshot: text(p.learning.glossarySnapshot || '[]', 20000, '解释术语快照', false), demo: p.learning.demo === true };
      return post;
    }),
    summaryZh: text(value.summaryZh || '', 5000, '中文要点', false),
    warnings: array(value.warnings || [], 50, '提醒').map(w => text(w, 2000, '提醒')),
    demo: value.demo === true,
    check: { status: value.check.status, issues: array(value.check.issues || [], 100, '检查问题').map(i => ({ category: text(i.category || 'meaning', 50, '类别'), excerpt: text(i.excerpt || '', 2000, '片段', false), reason: text(i.reason || i.label || '', 2000, '原因', false) })), explanation: text(value.check.explanation || '', 2000, '检查说明', false) }
  };
}
export function validateLibrary(value) {
  if (!value || value.app !== BACKUP_APP || value.version !== 1) throw new Error('不是本项目支持的备份格式');
  const data = emptyLibrary();
  data.drafts = array(value.drafts, 1000, '草稿').map(v => ({ ...identity(v), input: input(v.input), result: result(v.result), tags: parseTags(v.tags || []), variants: array(v.variants || [], 2, '版本').map(x => ({ input: input(x.input), result: result(x.result) })), activeVariant: v.activeVariant === 1 ? 1 : 0 }));
  data.publications = array(value.publications, 1000, '发布记录').map(v => ({ ...identity(v), publishedAt: date(v.publishedAt), sourceTextZh: text(v.sourceTextZh, 6000, '中文原文'), posts: array(v.posts, 6, '发布帖子').map(p => ({ text: text(p?.text, 5000, '发布英文'), sourceZh: text(p.sourceZh || '', 6000, '分段中文', false) })), tags: parseTags(v.tags || []), url: validatePublicationUrl(v.url || '') }));
  if (data.publications.some(v => !v.posts.length)) throw new Error('发布记录不能没有英文');
  data.phrases = array(value.phrases, 2000, '表达收藏').map(v => ({ ...identity(v), english: text(v.english, 1000, '收藏英文'), meaningZh: text(v.meaningZh || '', 2000, '收藏中文', false), context: text(v.context || '', 6000, '收藏语境', false), tags: parseTags(v.tags || []) }));
  const entries = array(value.glossary, 200, '术语表');
  const terms = validateGlossary(entries, 200);
  data.glossary = entries.map((v, i) => ({ ...identity(v), ...terms[i] }));
  for (const key of ['drafts', 'publications', 'phrases', 'glossary']) if (new Set(data[key].map(v => v.id)).size !== data[key].length) throw new Error('同一集合中的记录ID重复');
  return data;
}
export function migrateDrafts(drafts) { return validateLibrary({ ...emptyLibrary(), drafts }); }
export function mergeLibraries(current, incoming) {
  const merged = emptyLibrary();
  const a = validateLibrary(current), b = validateLibrary(incoming);
  for (const key of ['drafts', 'publications', 'phrases', 'glossary']) {
    const items = new Map();
    for (const item of [...a[key], ...b[key]]) {
      const previous = items.get(item.id);
      if (!previous || Date.parse(item.updatedAt) > Date.parse(previous.updatedAt)) items.set(item.id, item);
    }
    merged[key] = [...items.values()].sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
  }
  const uniqueTerms = new Map();
  for (const term of merged.glossary) if (!uniqueTerms.has(term.zh.toLowerCase())) uniqueTerms.set(term.zh.toLowerCase(), term);
  merged.glossary = [...uniqueTerms.values()];
  return validateLibrary(merged);
}
export function matchesSearch(item, query, tag = '') {
  if (tag && !(item.tags || []).includes(tag)) return false;
  const haystack = [item.input?.source, item.result?.posts?.map(p => p.text).join(' '), item.result?.summaryZh, item.sourceTextZh, item.posts?.map(p => `${p.sourceZh} ${p.text}`).join(' '), item.english, item.meaningZh, item.context, item.zh, item.en, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}
