import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curatedProjects } from './contribution-style.mjs';
import { renderContributions } from './render-contributions.mjs';

const START = '<!-- open-source-impact:start -->';
const END = '<!-- open-source-impact:end -->';
const repoPattern = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/;
const clean = value => String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchContributions({ username, token, fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9-]+$/.test(username)) throw Error('Invalid GitHub username');
  const items = [];
  let total;
  for (let page = 1; page <= 10; page++) {
    const url = new URL('https://api.github.com/search/issues');
    url.search = new URLSearchParams({
      q: `is:pr is:merged author:${username} -user:${username} is:public`,
      per_page: '100', page: String(page), sort: 'created', order: 'asc',
    });
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'profile-contributions' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error(`GitHub search failed (HTTP ${response.status}); existing profile preserved`);
    const data = await response.json();
    if (data.incomplete_results !== false || !Array.isArray(data.items) || !Number.isSafeInteger(data.total_count) || data.total_count < 0) {
      throw Error('Incomplete or invalid GitHub search response');
    }
    if (data.total_count > 1000) throw Error('GitHub search exceeds its 1,000-result limit; partition the query before publishing');
    if (total !== undefined && total !== data.total_count) throw Error('Search changed while paginating; retry next run');
    total = data.total_count;
    items.push(...data.items);
    if (items.length === total) break;
    if (data.items.length !== 100 || items.length > total) throw Error('Truncated GitHub search response');
  }
  if (items.length !== total || new Set(items.map(item => item.id)).size !== total) throw Error('Missing or duplicate search results');
  for (const item of items) {
    if (!repoPattern.test(item.repository_url) || !Number.isSafeInteger(item.number) || item.number <= 0 ||
        typeof item.title !== 'string' || item.user?.login?.toLowerCase() !== username.toLowerCase() ||
        !item.pull_request?.merged_at || item.state !== 'closed') throw Error('Unexpected PR data in merged search');
  }
  return items;
}

export function groupContributions(items, username) {
  const groups = new Map();
  for (const item of items) {
    const repo = repoPattern.exec(item.repository_url)?.[1];
    if (!repo || repo.split('/')[0].toLowerCase() === username.toLowerCase() ||
        item.user?.login?.toLowerCase() !== username.toLowerCase() || !item.pull_request?.merged_at) continue;
    const key = repo.toLowerCase();
    if (!groups.has(key)) groups.set(key, { repo, prs: [] });
    const group = groups.get(key);
    if (!group.prs.some(pr => pr.number === item.number)) group.prs.push({ number: item.number, title: clean(item.title) });
  }
  const order = new Map(curatedProjects.map((entry, index) => [entry[0].toLowerCase(), index]));
  return [...groups.values()].map(group => ({ ...group, prs: group.prs.sort((a, b) => a.number - b.number) }))
    .sort((a, b) => (order.get(a.repo.toLowerCase()) ?? Infinity) - (order.get(b.repo.toLowerCase()) ?? Infinity) || a.repo.toLowerCase().localeCompare(b.repo.toLowerCase(), 'en'));
}

function truncate(text, limit) {
  const characters = [...clean(text)];
  return characters.length <= limit ? characters.join('') : characters.slice(0, limit - 1).join('') + '…';
}

function summary(title) {
  const words = clean(title).split(' ');
  let first = '';
  while (words.length && [...`${first} ${words[0]}`.trim()].length <= 38) first = `${first} ${words.shift()}`.trim();
  if (!first) return [truncate(words.shift() || '', 38), truncate(words.join(' '), 38)];
  return [first, truncate(words.join(' '), 38)];
}

function projectStyle(group) {
  const curated = curatedProjects.find(entry => entry[0].toLowerCase() === group.repo.toLowerCase());
  const numbers = group.prs.map(pr => pr.number);
  const unchanged = curated && numbers.length === curated[4].length && numbers.every(number => curated[4].includes(number));
  return [group.repo, curated?.[1] ?? truncate(group.repo.split('/')[1], 25), '',
    unchanged ? curated[3] : summary(group.prs.at(-1).title), numbers, curated?.[5] ?? 'blue'];
}

async function readOptional(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function updateProfile({ root, username, token, fetchImpl }) {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2 || readme.indexOf(END) < readme.indexOf(START)) {
    throw Error('README must contain one ordered pair of contribution markers');
  }
  const items = await fetchContributions({ username, token, fetchImpl });
  const groups = groupContributions(items, username);
  if (!groups.length) throw Error('Empty contribution result; preserving existing profile');
  const previous = await readOptional(join(root, 'data/contributions.json'));
  if (previous) {
    const current = new Set(groups.flatMap(group => group.prs.map(pr => `${group.repo.toLowerCase()}#${pr.number}`)));
    const missing = JSON.parse(previous).projects.flatMap(group => group.prs.map(pr => `${group.repo.toLowerCase()}#${pr.number}`)).filter(key => !current.has(key));
    if (missing.length) throw Error(`Search omitted ${missing.length} recorded PR(s); preserving existing profile`);
  }
  const rendered = renderContributions(groups.map(projectStyle), username);
  const newline = readme.slice(readme.indexOf(START) + START.length).startsWith('\r\n') ? '\r\n' : '\n';
  const updated = readme.slice(0, readme.indexOf(START)) + rendered.section.replaceAll('\n', newline) + readme.slice(readme.indexOf(END) + END.length);
  const files = {
    ...rendered.files,
    'data/contributions.json': JSON.stringify({ username, projects: groups }, null, 2) + '\n',
    'README.md': updated,
  };
  const changed = [];
  // Finish all network calls and validation before touching any output. The
  // workflow publishes this entire set in one commit only after success.
  for (const [relative, content] of Object.entries(files)) {
    const destination = join(root, relative);
    if (await readOptional(destination) === content) continue;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
    changed.push(relative);
  }
  return { changed, projects: rendered.projectCount, merged: rendered.prCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await updateProfile({
      root: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      username: process.env.PROFILE_USERNAME || 'Erfouni', token: process.env.GH_TOKEN,
    });
    console.log(`${result.projects} external projects, ${result.merged} merged PRs; ${result.changed.length} changed file(s).`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
