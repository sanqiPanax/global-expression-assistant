import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analyzePosts, checkRules, generationPrompt, numericWarnings, parseModelJSON, reviewPrompt, validateInput, validateReview } from './lib/core.js';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const demo = !process.env.MODEL_API_KEY || !process.env.MODEL_NAME;
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';
let busy = false;
const providerSession = `global-expression-${randomUUID()}`;

export async function modelJSON(messages) {
  const base = process.env.MODEL_BASE_URL;
  if (!base) throw new Error('尚未设置 MODEL_BASE_URL');
  const url = new URL(`${base.replace(/\/$/, '')}/chat/completions`);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('远程模型接口必须使用 HTTPS');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MODEL_API_KEY}` };
  // Optional provider routing identifier, stable for this server session.
  // Identifies this application; it does not impersonate a coding client.
  if (process.env.MODEL_SESSION_HEADER) {
    if (!/^x-[a-z0-9-]*session[a-z0-9-]*$/i.test(process.env.MODEL_SESSION_HEADER)) throw new Error('MODEL_SESSION_HEADER 必须是 x- 开头的会话头名称');
    headers[process.env.MODEL_SESSION_HEADER] = providerSession;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: process.env.MODEL_NAME, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(45000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}；未自动重试，请检查服务商记录后再操作`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  return parseModelJSON(content);
}

async function semanticReview(source, posts, rules) {
  return validateReview(await modelJSON([
    { role: 'system', content: reviewPrompt() },
    { role: 'user', content: JSON.stringify({ source, posts, blockedTopics: rules }) }
  ]));
}

function demoResult(input) {
  const sample = 'I tried an open-source tool today. It made a small task easier, but I still need more time to understand its limitations.';
  return {
    posts: analyzePosts(input.type === 'thread' ? [sample, 'My next step is to test it on a real workflow and compare the results.'] : [sample], input.type),
    summaryZh: '固定演示：体验开源工具并计划继续测试。不是你的输入的翻译。',
    warnings: ['演示模式仅展示流程，固定示例与输入无关；请勿当作自己的表达发布。'],
    check: { status: 'demo', issues: [], explanation: '未调用模型，未进行语义复检。' }, demo: true
  };
}

async function handleTask(body, reviewOnly) {
  const input = validateInput(body);
  const inputIssues = checkRules(input.source, input.rules);
  if (inputIssues.length) return { blocked: true, check: { status: 'blocked', issues: inputIssues.map(i => ({ ...i, reason: `命中个人规则：${i.label}` })) } };
  if (reviewOnly) {
    const posts = analyzePosts(body.posts, input.type);
    const keywordIssues = checkRules(posts.map(p => p.text).join('\n'), input.rules).map(i => ({ ...i, reason: `命中个人规则：${i.label}` }));
    if (demo) return { posts, demo: true, warnings: numericWarnings(input.source, body.posts), check: { status: keywordIssues.length ? 'blocked' : 'demo', issues: keywordIssues } };
    const issues = [...keywordIssues, ...await semanticReview(input.source, body.posts, input.rules)];
    const blocked = issues.some(i => input.rules.includes(i.category));
    const warnings = numericWarnings(input.source, body.posts);
    return { posts, demo: false, warnings, check: { status: blocked ? 'blocked' : issues.length || warnings.length || posts.some(p => !p.valid) ? 'review' : 'pass', issues } };
  }
  if (demo) return demoResult(input);
  // Semantic input check before generation, including paraphrases and privacy/claims.
  const preIssues = await semanticReview(input.source, [], input.rules);
  if (preIssues.some(i => input.rules.includes(i.category))) return { blocked: true, check: { status: 'blocked', issues: preIssues } };
  const result = await modelJSON([
    { role: 'system', content: generationPrompt(input) },
    { role: 'user', content: input.source }
  ]);
  const posts = analyzePosts(result.posts, input.type);
  if (typeof result.summaryZh !== 'string' || result.summaryZh.length > 5000 || !Array.isArray(result.warnings) || result.warnings.length > 20 || result.warnings.some(w => typeof w !== 'string' || w.length > 2000)) throw new Error('生成响应缺少正确的中文要点或提醒');
  const localIssues = checkRules(posts.map(p => p.text).join('\n'), input.rules).map(i => ({ ...i, reason: `命中个人规则：${i.label}` }));
  let issues;
  try {
    issues = [...preIssues, ...localIssues, ...await semanticReview(input.source, result.posts, input.rules)];
  } catch {
    return { posts, summaryZh: result.summaryZh, warnings: result.warnings, demo: false, check: { status: 'failed', issues: [], explanation: '英文已生成，但复检失败。请重新检查，不能视为检查通过。' } };
  }
  const blocked = issues.some(i => input.rules.includes(i.category));
  const warnings = [...result.warnings, ...numericWarnings(input.source, result.posts)];
  return { posts, summaryZh: result.summaryZh, warnings, demo: false, check: { status: blocked ? 'blocked' : issues.length || warnings.length || posts.some(p => !p.valid) ? 'review' : 'pass', issues } };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJSON(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 80000) throw new Error('请求过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('请求不是有效 JSON'); }
}

export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const hostname = (req.headers.host || '').split(':')[0];
  // Reject DNS rebinding for the default loopback deployment.
  if (host === '127.0.0.1' && !['127.0.0.1', 'localhost'].includes(hostname)) return send(res, 403, { error: '不允许的主机名' });
  const path = req.url?.split('?')[0];
  if (req.method === 'GET' && path === '/api/config') return send(res, 200, { demo, model: demo ? null : process.env.MODEL_NAME });
  if (req.method === 'POST' && ['/api/generate', '/api/review'].includes(path)) {
    const origin = req.headers.origin;
    if (origin !== `http://${req.headers.host}` || req.headers['content-type']?.split(';')[0] !== 'application/json') return send(res, 403, { error: '只接受本页面的 JSON 请求' });
    if (busy) return send(res, 429, { error: '已有任务进行中，请等待完成' });
    busy = true;
    try { return send(res, 200, await handleTask(await readJSON(req), path === '/api/review')); }
    catch (error) {
      const message = /timeout|aborted/i.test(error.message) ? '模型请求超时，未自动重试；请检查服务商记录后再操作' : error.message;
      return send(res, 400, { error: message });
    } finally { busy = false; }
  }
  const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
  if (req.method === 'GET' && files[path]) {
    try {
      const [file, mime] = files[path];
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(await readFile(resolve(publicDir, file)));
    } catch { send(res, 500, { error: '页面读取失败' }); }
    return;
  }
  send(res, 404, { error: '未找到此资源' });
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, host, () => console.log(`Global Expression Assistant: http://${host}:${port} (${demo ? 'demo' : 'live'})`));
}
