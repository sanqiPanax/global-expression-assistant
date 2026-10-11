import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let calls = [];
let fault = null;
let delay = false;
const model = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const request = JSON.parse(body); calls.push(request);
  if (delay) await new Promise(r => setTimeout(r, 120));
  const isReview = request.messages[0].content.startsWith('Review');
  const data = isReview ? JSON.parse(request.messages[1].content) : null;
  let content = isReview ? { issues: [] } : { posts: ['I tried an open-source tool. It saved about 20 minutes, but one trial is not enough.'], summaryZh: '工具节省约 20 分钟，但一次测试还不够。', warnings: [] };
  if (fault === 'output-review' && isReview && data.posts.length) content = { issues: 'invalid' };
  if (fault === 'input-rule' && isReview && !data.posts.length) content = { issues: [{ category: 'crypto', excerpt: '某种链上资产', reason: '命中加密货币个人规则' }] };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
});
await new Promise(r => model.listen(0, '127.0.0.1', r));
process.env.MODEL_API_KEY = 'test-only-not-a-real-key';
process.env.MODEL_NAME = 'mock';
process.env.MODEL_BASE_URL = `http://127.0.0.1:${model.address().port}/v1`;
const { server } = await import('../server.js');
let base;
before(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(r => server.close(r)); await new Promise(r => model.close(r)); });
const input = { source: '试了开源工具，节省约 20 分钟，一次还不够', type: 'post', style: 'natural', mode: 'faithful', rules: ['crypto'] };
const post = data => fetch(base + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(data) });

test('live generation performs input review, generation and output review', async () => {
  calls = []; const response = await post(input); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.demo, false); assert.equal(data.check.status, 'pass');
  assert.equal(calls.length, 3); assert.equal(calls[1].messages[1].content, input.source);
});
test('semantic input topic block prevents a generation request', async () => {
  calls = []; fault = 'input-rule';
  try { const data = await (await post(input)).json(); assert.equal(data.blocked, true); assert.equal(calls.length, 1); }
  finally { fault = null; }
});
test('output review failure preserves draft with failed status', async () => {
  fault = 'output-review';
  try { const data = await (await post(input)).json(); assert.equal(data.check.status, 'failed'); assert.equal(data.posts.length, 1); }
  finally { fault = null; }
});
test('concurrent duplicate requests are rejected rather than billed twice', async () => {
  delay = true;
  try { const first = post(input); await new Promise(r => setTimeout(r, 40)); assert.equal((await post(input)).status, 429); assert.equal((await first).status, 200); }
  finally { delay = false; }
});
