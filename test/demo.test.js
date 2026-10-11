import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.MODEL_API_KEY = '';
process.env.MODEL_NAME = '';
const { server } = await import('../server.js');
let base;
before(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(r => server.close(r)));
const input = { source: '试试开源工具', type: 'post', style: 'natural', mode: 'faithful', rules: ['crypto'] };
async function post(path, data, origin = base) {
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
}
test('page and config are served without credentials', async () => {
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await (await fetch(base + '/api/config')).json()).demo, true);
  assert.equal((await fetch(base + '/.env')).status, 404);
});
test('demo is explicitly marked and input topic blocking happens first', async () => {
  const sample = await (await post('/api/generate', input)).json();
  assert.equal(sample.demo, true); assert.equal(sample.check.status, 'demo');
  assert.match(sample.summaryZh, /不是你的输入/);
  const blocked = await (await post('/api/generate', { ...input, source: '比特币' })).json();
  assert.equal(blocked.blocked, true); assert.equal(blocked.posts, undefined);
});
test('external origins, bad types and invalid structures are rejected', async () => {
  assert.equal((await post('/api/generate', input, 'https://evil.invalid')).status, 403);
  assert.equal((await post('/api/generate', { ...input, type: 'invalid' })).status, 400);
  assert.equal((await post('/api/review', { ...input, posts: [] })).status, 400);
});
test('review recalculates edited text and blocks overlength', async () => {
  const data = await (await post('/api/review', { ...input, posts: ['a'.repeat(281)] })).json();
  assert.equal(data.posts[0].valid, false); assert.equal(data.posts[0].weightedLength, 281);
});
