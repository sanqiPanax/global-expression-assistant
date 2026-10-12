import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePosts, checkRules, numericWarnings, parseModelJSON, validateInput, validateReview, generationPrompt } from '../lib/core.js';

const input = { source: '一个想法', type: 'post', style: 'natural', mode: 'faithful', rules: ['crypto'] };
test('model JSON accepts only plain JSON or one complete JSON fence', () => {
  assert.deepEqual(parseModelJSON(' {"issues":[]} '), { issues: [] });
  assert.deepEqual(parseModelJSON('```json\n{"issues":[]}\n```'), { issues: [] });
  assert.throws(() => parseModelJSON('Explanation\n```json\n{"issues":[]}\n```'));
  assert.throws(() => parseModelJSON('```json\n{"issues":[]}\n```\nextra'));
  assert.throws(() => parseModelJSON('```json\n{"issues":\n```'));
  assert.throws(() => parseModelJSON(null));
});
test('input validation rejects missing text and arbitrary rules', () => {
  assert.throws(() => validateInput({ ...input, source: ' ' }));
  assert.throws(() => validateInput({ ...input, rules: ['unknown'] }));
  assert.throws(() => validateInput({ ...input, source: 'a'.repeat(6001) }));
  assert.equal(validateInput(input).source, '一个想法');
});
test('personal rules are configurable and catch Chinese / English', () => {
  assert.equal(checkRules('谈谈比特币', ['crypto']).length, 1);
  assert.equal(checkRules('Bitcoin observation', ['crypto']).length, 1);
  assert.equal(checkRules('Bitcoin observation', []).length, 0);
  assert.equal(checkRules('an open-source tool', ['crypto']).length, 0);
});
test('official weighted counting includes links, CJK and emoji', () => {
  assert.equal(analyzePosts(['汉字'], 'post')[0].weightedLength, 4);
  assert.equal(analyzePosts(['https://example.com/a-very-long-path-for-testing'], 'post')[0].weightedLength, 23);
  assert.equal(analyzePosts(['👨‍👩‍👧‍👦'], 'post')[0].weightedLength, 2);
  assert.equal(analyzePosts(['a'.repeat(280)], 'post')[0].valid, true);
  assert.equal(analyzePosts(['a'.repeat(281)], 'post')[0].valid, false);
  assert.throws(() => analyzePosts(['one', 'two'], 'post'));
  assert.throws(() => analyzePosts([], 'thread'));
  assert.throws(() => analyzePosts(['   '], 'post'));
});
test('numeric drift is flagged for omissions and additions', () => {
  assert.equal(numericWarnings('节省 20 分钟', ['Saved 20 minutes.']).length, 0);
  assert.equal(numericWarnings('节省 20 分钟', ['Saved 200 minutes.']).length, 2);
});
test('malformed semantic review fails closed', () => {
  assert.throws(() => validateReview({ issues: 'pass' }));
  assert.throws(() => validateReview({ issues: [{ category: 'unknown', reason: 'x', excerpt: 'y' }] }));
  assert.deepEqual(validateReview({ issues: [] }), []);
});
test('generation keeps input separate and uses faithful default option', () => {
  assert.match(generationPrompt(input), /faithful minimal/);
  assert.match(generationPrompt(input), /Never invent/);
});
