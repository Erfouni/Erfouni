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
const repositoryResponse = (full_name, extra = {}) => ({
  ok: true, status: 200, json: async () => ({ full_name, private: false, ...extra }),
});
async function snapshot(root) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile());
  return Promise.all(files.map(async entry => [join(entry.parentPath, entry.name), await readFile(join(entry.parentPath, entry.name), 'utf8')]));
}
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'profile-contributions-'));
  await writeFile(join(root, 'README.md'), original);
  return root;
}

test('reconciles transferred repository names without losing or double-counting PRs', async () => {
  const root = await workspace();
  const numbers = [1059, 1095, 1097, 1099];
  await updateProfile({ ...options, root, fetchImpl: async () => response(numbers.map(number => pr(number, 'andorthehood/8f4e'))) });
  const calls = [];
  const result = await updateProfile({ ...options, root, fetchImpl: async (url, init) => {
    calls.push(new URL(url).pathname);
    if (new URL(url).pathname === '/search/issues') return response([...numbers, 1120].map(number => pr(number, '8f4e/8f4e')));
    assert.equal(new URL(url).pathname, '/repos/andorthehood/8f4e');
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    return repositoryResponse('8f4e/8f4e');
  }});
  assert.equal(result.projects, 1);
  assert.equal(result.merged, 5);
  const data = JSON.parse(await readFile(join(root, 'data/contributions.json'), 'utf8'));
  assert.deepEqual(data.projects.map(project => project.repo), ['8f4e/8f4e']);
  assert.deepEqual(data.projects[0].prs.map(item => item.number), [1059, 1095, 1097, 1099, 1120]);
  assert.deepEqual(calls, ['/search/issues', '/repos/andorthehood/8f4e']);
  const repeated = await updateProfile({ ...options, root, fetchImpl: async url => {
    assert.equal(new URL(url).pathname, '/search/issues');
    return response([...numbers, 1120].map(number => pr(number, '8f4e/8f4e')));
  }});
  assert.deepEqual(repeated.changed, []);
});

test('a repository transfer still rejects an actually omitted PR and preserves every output', async () => {
  const root = await workspace();
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1, 'old/project'), pr(2, 'old/project')]) });
  const before = await snapshot(root);
  await assert.rejects(updateProfile({ ...options, root, fetchImpl: async url => {
    if (new URL(url).pathname === '/search/issues') return response([pr(1, 'new/project'), pr(2, 'unrelated/project')]);
    assert.equal(new URL(url).pathname, '/repos/old/project');
    return repositoryResponse('new/project');
  }}), /Search omitted 1 recorded PR/);
  assert.deepEqual(await snapshot(root), before);
});

test('a transferred repository keeps its curated placement and presentation', async () => {
  const root = await workspace();
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1059, 'andorthehood/8f4e')]) });
  await updateProfile({ ...options, root, fetchImpl: async url => {
    if (new URL(url).pathname === '/search/issues') return response([
      pr(3709, 'flint-fyi/flint'), pr(1059, '8f4e/8f4e', 'An upstream title that should not replace the curated summary'), pr(158, 'eea/odfpy'),
    ]);
    assert.equal(new URL(url).pathname, '/repos/andorthehood/8f4e');
    return repositoryResponse('8f4e/8f4e');
  }});
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const positions = ['eea/odfpy/pull/158', '8f4e/8f4e/pull/1059', 'flint-fyi/flint/pull/3709']
    .map(path => readme.indexOf(`href="https://github.com/${path}"`));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  for (const theme of ['dark', 'light']) {
    const card = await readFile(join(root, `assets/contributions/8f4e--8f4e-compact-${theme}.svg`), 'utf8');
    assert.match(card, /Preserve floating-point precision/);
    assert.match(card, /in ensureNonZero fallbacks\./);
    assert.doesNotMatch(card, /An upstream title/);
  }
});

for (const [name, repository] of [
  ['lookup rate limit', { ok: false, status: 403 }],
  ['missing repository', { ok: false, status: 404 }],
  ['invalid canonical name', repositoryResponse('../outside')],
  ['missing canonical name', repositoryResponse(undefined)],
  ['private repository', repositoryResponse('new/project', { private: true })],
  ['unknown visibility', repositoryResponse('new/project', { private: undefined })],
  ['own repository', repositoryResponse('erfouni/project')],
]) {
  test(`repository ${name} preserves every output`, async () => {
    const root = await workspace();
    await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1, 'old/project')]) });
    const before = await snapshot(root);
    await assert.rejects(updateProfile({ ...options, root, fetchImpl: async url => {
      if (new URL(url).pathname === '/search/issues') return response([pr(1, 'new/project')]);
      assert.equal(new URL(url).pathname, '/repos/old/project');
      return repository;
    }}));
    assert.deepEqual(await snapshot(root), before);
  });
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

test('changed contributions invalidate image caches without timestamps', async () => {
  const root = await workspace();
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1)]) });
  const before = await readFile(join(root, 'README.md'), 'utf8');
  const sources = text => [...text.matchAll(/(?:src|srcset)="([^\"]+)"/g)].map(match => match[1]);
  assert.ok(sources(before).every(source => /\?v=[a-f0-9]{12}$/.test(source)));
  await updateProfile({ ...options, root, fetchImpl: async () => response([pr(1), pr(2)]) });
  const after = await readFile(join(root, 'README.md'), 'utf8');
  assert.equal(sources(before).length, 4);
  assert.ok(sources(before).every((source, index) => source !== sources(after)[index]));
});
