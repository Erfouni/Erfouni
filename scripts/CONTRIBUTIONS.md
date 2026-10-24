# Contribution cards

GitHub Actions refreshes the profile every 15 minutes, at minutes 7, 22, 37,
and 52. GitHub may delay scheduled jobs. The workflow also supports **Run
workflow** in Actions and runs when its code changes on `main`.

It uses the temporary `GITHUB_TOKEN` supplied by Actions; no personal token or
external service is needed. It counts public, merged PRs authored by Erfouni in
repositories owned by others. Multiple PRs in one repository produce one card.
New repositories get cards automatically. Existing curated styling is kept in
`contribution-style.mjs`; new PRs update each card's summary from its latest PR
number. Titles are escaped, wrapped, and truncated for the compact layout.

The script replaces only the marked contribution section in README.md and
generates SVGs in light and dark themes. It never adds timestamps. Only changed
output is committed; an unchanged run makes no commit. Output from an
incomplete, failed, empty, or truncated search is never published. If previously
recorded PRs disappear from search, it fails rather than silently reducing the
counts. For a renamed or transferred repository, it resolves the recorded name
through GitHub's repository API and still requires every recorded PR in search
under the current public repository name. Failed lookups and genuinely missing
PRs preserve all output. Check deleted/private repositories before manually
reconciling `data/contributions.json`. Searches above GitHub's 1,000-result limit fail
explicitly and require partitioning before further updates.

Run locally with Node.js 24:

```sh
node --test scripts/update-contributions.test.mjs
node scripts/update-contributions.mjs
```

An optional `GH_TOKEN` environment variable raises the search rate limit. Never
commit it. GitHub can disable schedules in public repositories after 60 days
without repository activity; re-enable this workflow in Actions if that occurs.
The unrelated Pac-Man workflow and the rest of the profile are independent.
