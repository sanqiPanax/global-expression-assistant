import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, matchesSearch, mergeLibraries, migrateDrafts, parseTags, validateLibrary, validatePublicationUrl } from '../public/library.js';
import { speechChunks } from '../public/speech.js';
const oldDraft = { id: 'old', updatedAt: '2026-10-10T01:00:00Z', input: { source: '试试星河工具', type: 'post', style: 'natural', mode: 'faithful', rules: ['crypto'] }, result: { posts: [{ text: 'Testing Nebula.', weightedLength: 15, valid: true }], summaryZh: '测试工具', warnings: [], demo: false, check: { status: 'pass', issues: [] } } };
test('legacy drafts migrate without changing bilingual content or tone', () => {
  const migrated = migrateDrafts([oldDraft]);
  assert.equal(migrated.drafts[0].input.source, oldDraft.input.source);
  assert.equal(migrated.drafts[0].result.posts[0].text, 'Testing Nebula.');
  assert.deepEqual(migrated.drafts[0].tags, []);
  assert.deepEqual(migrated.phrases, []);
});
test('backup round trip preserves all collections while discarding unknown fields', () => {
  const data = migrateDrafts([oldDraft]);
  data.publications = [{ id: 'pub', updatedAt: oldDraft.updatedAt, publishedAt: oldDraft.updatedAt, sourceTextZh: '试试星河工具', posts: [{ text: 'Testing Nebula.', sourceZh: '测试星河' }], tags: ['工具'], url: 'https://x.com/example/status/123' }];
  data.phrases = [{ id: 'phrase', updatedAt: oldDraft.updatedAt, english: 'Testing Nebula.', meaningZh: '测试星河', context: '软件测评', tags: ['工具'] }];
  data.glossary = [{ id: 'term', updatedAt: oldDraft.updatedAt, zh: '星河', en: 'Nebula' }];
  const restored = validateLibrary(JSON.parse(JSON.stringify({ ...data, MODEL_API_KEY: 'must-not-survive' })));
  assert.equal(restored.MODEL_API_KEY, undefined);
  assert.equal(restored.publications[0].posts[0].sourceZh, '测试星河');
  assert.equal(restored.phrases[0].context, '软件测评');
  assert.equal(restored.glossary[0].en, 'Nebula');
  assert.deepEqual(mergeLibraries(restored, restored), restored);
});
test('merge preserves newer current records and never silently truncates', () => {
  const current = migrateDrafts([{ ...oldDraft, updatedAt: '2026-10-14T01:00:00Z' }]);
  const backup = migrateDrafts([oldDraft]);
  assert.equal(mergeLibraries(current, backup).drafts[0].updatedAt, current.drafts[0].updatedAt);
  assert.throws(() => validateLibrary({ ...emptyLibrary(), drafts: Array(1001).fill(oldDraft) }));
  assert.throws(() => validateLibrary({ ...emptyLibrary(), drafts: [oldDraft, oldDraft] }));
});
test('invalid backups and unsafe publication links are rejected', () => {
  assert.throws(() => validateLibrary({ version: 2 }));
  assert.throws(() => validateLibrary({ ...emptyLibrary(), publications: [{ id: 'x', updatedAt: oldDraft.updatedAt, publishedAt: 'invalid', posts: [] }] }));
  assert.throws(() => validatePublicationUrl('javascript:alert(1)'));
  assert.throws(() => validatePublicationUrl('https://x.com.evil.invalid/name/status/1'));
  assert.throws(() => validatePublicationUrl('https://name:secret@x.com/name/status/1'));
  assert.equal(validatePublicationUrl('https://x.com/name/status/1'), 'https://x.com/name/status/1');
});
test('search includes both languages, contexts and tags', () => {
  const draft = { ...oldDraft, tags: ['AI'] };
  assert.equal(matchesSearch(draft, '星河 nebula', 'AI'), true);
  assert.equal(matchesSearch(draft, 'nebula', '生活'), false);
  assert.equal(matchesSearch({ english: 'still unsure', meaningZh: '还不确定', context: '谨慎表达', tags: [] }, '谨慎 unsure'), true);
  assert.deepEqual(parseTags('AI，开源, #AI'), ['AI', '开源']);
  assert.throws(() => parseTags('a'.repeat(31)));
});
test('speech chunking preserves word order and bounds long utterances', () => {
  const source = 'I am still testing this useful tool. '.repeat(30).trim();
  const chunks = speechChunks(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 180));
  assert.equal(chunks.join(' '), source);
  assert.deepEqual(speechChunks('  '), []);
});
