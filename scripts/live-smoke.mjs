// Explicit paid-provider smoke test. Not part of npm test or CI.
// Uses only synthetic, non-private inputs. Results stay in ignored test-results/.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { server } = await import('../server.js');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const sample = {
  source: '今天我试了一个开源工具，它帮我节省了大约 20 分钟。不过只试了一次，我还不能确定它是否适合长期使用。我打算下周再测试一次。',
  type: 'post', style: 'natural', mode: 'faithful', rules: ['politics', 'sexual', 'crypto']
};
const results = [];
async function run(name, path, body) {
  const start = Date.now();
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(body), signal: AbortSignal.timeout(150000)
  });
  const result = await response.json();
  const record = { name, durationMs: Date.now() - start, httpStatus: response.status, ...result };
  results.push(record);
  console.log(JSON.stringify(record));
  assert.equal(response.status, 200, `${name} returned an error`);
  return result;
}
try {
  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.demo, false, 'Configure .env with real credentials first');
  console.log(`Testing configured model: ${config.model}`);
  const generated = await run('single-post', '/api/generate', sample);
  assert.equal(generated.demo, false);
  assert.ok(generated.posts?.length === 1);
  assert.ok(generated.posts[0].valid);
  assert.ok(['pass', 'review'].includes(generated.check.status), 'Output review must succeed');
  const blocked = await run('blocked-topic', '/api/generate', { ...sample, source: '我想聊聊比特币。' });
  assert.equal(blocked.blocked, true);
  const edited = await run('edited-review', '/api/review', { ...sample, posts: [generated.posts[0].text.replace(/20/g, '200')] });
  assert.ok(edited.warnings.some(w => w.includes('200')), 'Changed number must be flagged');
  assert.notEqual(edited.check.status, 'pass');
  console.log('Live smoke checks passed. Synthetic results saved locally.');
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/go-live.json', JSON.stringify({ model: process.env.MODEL_NAME, testedAt: new Date().toISOString(), results }, null, 2));
  await new Promise(r => server.close(r));
}
