import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchContributions, groupContributions, updateProfile } from './update-contributions.mjs';

const pr = (number, repo = 'upstream/project', title = 'Fix parser validation') => ({
  id: number, number, title, repository_url: `https://api.github.com/repos/${repo}`,
  html_url: `https://github.com/${repo}/pull/${number}`, user: { login: 'Erfouni' },
  state: 'closed', pull_request: { merged_at: '2026-10-01T00:00:00Z' },
});
const response = (items, total = items.length, extra = {}) => ({
  ok: true, status: 200,
  json: async () => ({ total_count: total, incomplete_results: false, items, ...extra }),
});
const options = { username: 'Erfouni', token: 'test-only' };

test('paginates beyond 100 results without dropping contributions', async () => {
  const calls = [];
  const items = Array.from({ length: 101 }, (_, i) => pr(i + 1));
  const found = await fetchContributions({ ...options, fetchImpl: async url => {
    calls.push(new URL(url));
    return response(calls.length === 1 ? items.slice(0, 100) : items.slice(100), 101);
  }});
  assert.equal(found.length, 101);
  assert.deepEqual(calls.map(url => url.searchParams.get('page')), ['1', '2']);
  assert.match(calls[0].searchParams.get('q'), /-user:Erfouni/);
});

test('counts unique external repositories and excludes own or unmerged PRs', () => {
  const unmerged = pr(5); unmerged.pull_request.merged_at = null;
  const groups = groupContributions([pr(1), pr(2), pr(3, 'another/project'), pr(4, 'erFOUni/own'), unmerged], 'Erfouni');
  assert.equal(groups.length, 2);
  assert.equal(groups.reduce((sum, group) => sum + group.prs.length, 0), 3);
});

for (const [name, fake] of [
  ['API rate limit', async () => ({ ok: false, status: 403 })],
  ['incomplete search', async () => response([pr(1)], 1, { incomplete_results: true })],
  ['search cap', async () => response([pr(1)], 1001)],
  ['truncated page', async () => response([pr(1)], 2)],
  ['duplicate results', async () => response([pr(1), pr(1)], 2)],
]) {
  test(`rejects ${name} instead of publishing misleading counts`, async () => {
    await assert.rejects(fetchContributions({ ...options, fetchImpl: fake }));
  });
}

const original = 'Keep intro exactly.\r\n<!-- open-source-impact:start -->\r\nold cards\r\n<!-- open-source-impact:end -->\r\nKeep footer exactly.\r\n';
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'profile-contributions-'));
  await writeFile(join(root, 'README.md'), original);
  return root;
}

test('adds compact new repository cards, escapes titles, and is deterministic', async () => {
  const root = await workspace();
  const fetchImpl = async () => response([pr(1, 'new/project', 'Fix <svg onload="bad"> & parser')]);
  await updateProfile({ ...options, root, fetchImpl });
  const first = await readFile(join(root, 'README.md'), 'utf8');
  assert.ok(first.startsWith('Keep intro exactly.\r\n'));
  assert.ok(first.endsWith('\r\nKeep footer exactly.\r\n'));
  assert.match(first, /1 external projects, 1 merged pull requests/);
  assert.match(first, /width="250"/);
  assert.doesNotMatch(first, /2026-10|verify --shipped/);
  const card = await readFile(join(root, 'assets/contributions/new--project-compact-dark.svg'), 'utf8');
  assert.match(card, /viewBox="0 0 400 142"/);
  assert.match(card, /&lt;svg/);
  assert.doesNotMatch(card, /<svg onload/);
  const result = await updateProfile({ ...options, root, fetchImpl });
  assert.deepEqual(result.changed, []);
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), first);
});

test('API failure or missing recorded PRs leaves all existing output intact', async () => {
  const root = await workspace();
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1), pr(2)]) });
  const before = await readFile(join(root, 'README.md'), 'utf8');
  const data = await readFile(join(root, 'data/contributions.json'), 'utf8');
  await assert.rejects(updateProfile({ ...options, root, fetchImpl: async () => response([pr(1)]) }));
  await assert.rejects(updateProfile({ ...options, root, fetchImpl: async () => { throw Error('offline'); } }));
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), before);
  assert.equal(await readFile(join(root, 'data/contributions.json'), 'utf8'), data);
});

test('missing or duplicate README markers fail without creating output files', async () => {
  for (const readme of ['no markers', original + original]) {
    const root = await workspace();
    await writeFile(join(root, 'README.md'), readme);
    await assert.rejects(updateProfile({ ...options, root, fetchImpl: async () => response([pr(1)]) }));
    assert.deepEqual(await readdir(root), ['README.md']);
  }
});

test('preserves mixed README line endings outside and inside the managed section', async () => {
  const root = await workspace();
  await writeFile(join(root, 'README.md'), original.replace(/\r\nold cards\r\n/, '\nold cards\n'));
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1)]) });
  const output = await readFile(join(root, 'README.md'), 'utf8');
  assert.ok(output.startsWith('Keep intro exactly.\r\n<!-- open-source-impact:start -->\n'));
  assert.ok(output.endsWith('<!-- open-source-impact:end -->\r\nKeep footer exactly.\r\n'));
});
