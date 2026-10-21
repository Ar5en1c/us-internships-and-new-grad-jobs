import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildModel, checkGuards, emptyState, SchemaError, pausedBanner } from '../src/build.mjs';
import { renderReadme, renderArchiveMonth, archiveMonths } from '../src/render.mjs';

const root = new URL('..', import.meta.url).pathname;
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const day1 = () => load('fixtures/feed_day1.json');
const careers = () => load('data/careers_pages.json');
const OPTS = { minJobs: 10, minEmployers: 5, minKindJobs: 3, minKindEmployers: 3 };
const GOLD = (name) => join(root, 'test/golden', name);

function pin(name, actual) {
  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLD(name), actual);
  assert.equal(actual, readFileSync(GOLD(name), 'utf8'), `${name} changed; run UPDATE_GOLDEN=1 npm test if intended`);
}

test('fixture: every rule drops what it should, and the counts are pinned', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  assert.deepEqual(m.stats, {
    rowsIn: 42, open: 15, employers: 11,
    byKind: { internship: { open: 10, employers: 10 }, new_grad: { open: 5, employers: 5 } },
    withheld: [],
    capped: 0,
    dropped: {
      asks_for_experience: 1, contact_info: 2, dead_link: 2, duplicate_link: 1, expired: 1,
      merged_same_title: 4, no_location: 1, no_us_evidence: 3, not_own_crawl: 1, not_seen_in_48h: 1,
      older_than_120_days: 1, past_season: 2, portal_not_covered: 2, talent_pool: 1,
      third_party_host: 1, title_not_matching: 3,
    },
  });
});

test('fixture: README bytes are pinned', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  pin('README.md', renderReadme(m, careers()));
});

test('fixture: state bytes are pinned', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  pin('state.json', JSON.stringify(m.nextState, null, 2) + '\n');
});

test('same input gives the same bytes, whatever the row order', () => {
  const a = buildModel({ data: day1(), opts: OPTS });
  const shuffled = day1();
  shuffled.rows.reverse();
  const b = buildModel({ data: shuffled, opts: OPTS });
  assert.equal(renderReadme(a, careers()), renderReadme(b, careers()));
  assert.equal(JSON.stringify(a.nextState), JSON.stringify(b.nextState));
});

test('output has no em or en dashes, no pay, no portal names and no tagged row links', () => {
  const out = renderReadme(buildModel({ data: day1(), opts: OPTS }), careers());
  assert.ok(!/[\u2013\u2014]/.test(out));
  assert.ok(!/per hour|150,000|salary/i.test(out), 'pay must not appear in version 1');
  assert.ok(!/greenhouse|lever|ashby|workday|smartrecruiters/i.test(out.replace(/https?:\/\/\S+/g, '')));
  const rowLinks = out.split('\n').filter((l) => l.includes('[Apply]'));
  assert.ok(rowLinks.length === 15 && rowLinks.every((l) => !/utm_/.test(l)));
  assert.equal(out.match(/utm_source=github/g).length, 2); // maintainer line and footer, one reserved link
});

test('table rows stay one line with five cells', () => {
  const out = renderReadme(buildModel({ data: day1(), opts: OPTS }), careers());
  for (const l of out.split('\n').filter((x) => x.includes('[Apply]'))) {
    assert.equal(l.replace(/\\\|/g, '').split('|').length, 7, l);
  }
});

test('workday and every covered portal reach the list', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  const hosts = new Set(m.open.map((x) => new URL(x.url).hostname.split('.')[0]));
  for (const h of ['boards', 'jobs', 'ashby', 'bank']) assert.ok(hosts.has(h), h);
});

test('schema errors are refused', () => {
  assert.throws(() => buildModel({ data: [] }), SchemaError);
  assert.throws(() => buildModel({ data: { exported_at: 'x', rows: [] } }), SchemaError);
  const d = day1();
  delete d.rows[3].url;
  assert.throws(() => buildModel({ data: d }), /lacks column url/);
});

test('a posting that leaves the list is shown for 7 days, then archived', () => {
  const d1 = day1();
  const m1 = buildModel({ data: d1, opts: OPTS });
  const gone = d1.rows.filter((r) => r.company !== 'Example Capital');
  const d2 = { exported_at: '2026-10-11T18:00:00Z', rows: gone.map((r) => ({ ...r, last_seen_at: '2026-10-11T10:00:00Z' })) };
  const m2 = buildModel({ data: d2, previous: m1.nextState, opts: OPTS });
  assert.equal(m2.closed.length, 1);
  assert.equal(m2.closed[0].employer, 'Example Capital');
  assert.equal(m2.closed[0].closed_on, '2026-10-11');
  assert.match(renderReadme(m2, careers()), /Left the list in the last 7 days/);
  pin('README_day2.md', renderReadme(m2, careers()));

  const d9 = { exported_at: '2026-10-19T18:00:00Z', rows: d2.rows.map((r) => ({ ...r, last_seen_at: '2026-10-19T10:00:00Z' })) };
  const m9 = buildModel({ data: d9, previous: m2.nextState, opts: OPTS });
  assert.equal(m9.closed.length, 0);
  assert.equal(m9.archive.length, 1);
  assert.deepEqual(archiveMonths(m9), ['2026-10']);
  pin('archive_2026-10.md', renderArchiveMonth('2026-10', m9.archive));
  assert.match(renderReadme(m9, careers()), /\[2026-10\]\(archive\/2026-10\.md\)/);

  // coming back removes it from the closed table
  const back = buildModel({ data: { ...d1, exported_at: '2026-10-12T18:00:00Z', rows: d1.rows.map((r) => ({ ...r, last_seen_at: '2026-10-12T10:00:00Z' })) }, previous: m2.nextState, opts: OPTS });
  assert.equal(back.closed.length, 0);
});

test('stale posting sightings never make a row current', () => {
  const d = day1();
  d.rows = d.rows.map((r) => ({ ...r, last_seen_at: '2026-10-07T00:00:00Z' }));
  const m = buildModel({ data: d, opts: OPTS });
  assert.equal(m.open.length, 0);
});

test('open rows are capped, newest first', () => {
  const m = buildModel({ data: day1(), opts: { ...OPTS, maxOpenRows: 5 } });
  assert.equal(m.open.length, 5);
  assert.equal(m.stats.capped, 10);
  assert.ok(m.open.every((x, i, a) => i === 0 || a[i - 1].first_seen >= x.first_seen));
});

test('guards', () => {
  const now = new Date('2026-10-10T20:00:00Z');
  const m = buildModel({ data: day1(), opts: OPTS });
  assert.deepEqual(checkGuards({ model: m, previous: emptyState(), now, opts: OPTS }), []);
  assert.match(checkGuards({ model: m, previous: emptyState(), now })[0], /only 15 open jobs/);
  assert.match(checkGuards({ model: m, previous: emptyState(), now: new Date('2026-10-11T22:00:00Z'), opts: OPTS })[0], /hours old/);
  const bigger = { open: new Array(30).fill({}) };
  const f = checkGuards({ model: m, previous: bigger, now, opts: OPTS });
  assert.ok(f.some((x) => /fell/.test(x)));
  assert.ok(pausedBanner('2026-10-10T18:00:00Z', new Date('2026-10-14T00:00:00Z')));
  assert.ok(!pausedBanner('2026-10-10T18:00:00Z', new Date('2026-10-12T00:00:00Z')));
});

test('careers pages file: https only, verified date set, no duplicates', () => {
  const c = careers();
  assert.match(c.verified_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(c.pages.length >= 5);
  assert.equal(new Set(c.pages.map((p) => p.employer)).size, c.pages.length);
  assert.ok(c.pages.every((p) => p.url.startsWith('https://')));
});

test('cli: writes, repeats byte for byte, refuses a bad run, banners a stale one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobs-cli-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'data', 'careers_pages.json'), readFileSync(join(root, 'data/careers_pages.json')));
  const run = (extra, input = join(root, 'fixtures/feed_day1.json')) =>
    spawnSync('node', [join(root, 'src/cli.mjs'), '--input', input, '--out', dir, ...extra], { encoding: 'utf8' });
  const args = ['--now', '2026-10-10T20:00:00Z', '--min-jobs', '10', '--min-kind-jobs', '3', '--min-kind-employers', '3', '--grace-runs', '0'];

  const guarded = run(['--now', '2026-10-10T20:00:00Z']);
  assert.equal(guarded.status, 2);
  assert.ok(!existsSync(join(dir, 'README.md')));

  assert.equal(run(args).status, 0);
  const first = readFileSync(join(dir, 'README.md'), 'utf8');
  const state1 = readFileSync(join(dir, 'data', 'state.json'), 'utf8');
  assert.equal(first, readFileSync(GOLD('README.md'), 'utf8'));
  assert.equal(run(args).status, 0);
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), first);
  assert.equal(readFileSync(join(dir, 'data', 'state.json'), 'utf8'), state1);

  const old = run(['--now', '2026-10-14T00:00:00Z', '--min-jobs', '10', '--min-kind-jobs', '3', '--min-kind-employers', '3', '--grace-runs', '0']);
  assert.equal(old.status, 3);
  assert.ok(readFileSync(join(dir, 'README.md'), 'utf8').startsWith('> Updates paused since 2026-10-10.'));

  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"rows":[]}');
  assert.equal(run(args, bad).status, 1);
});

test('a bad --now or an export dated in the future cannot slip past the age guard', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  assert.match(checkGuards({ model: m, previous: emptyState(), now: new Date('nonsense'), opts: OPTS })[0], /not a date/);
  assert.match(checkGuards({ model: m, previous: emptyState(), now: new Date('2026-10-09T00:00:00Z'), opts: OPTS })[0], /in the future/);
});

test('stats report each list on its own, for the launch minimums', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  assert.equal(m.stats.byKind.internship.open + m.stats.byKind.new_grad.open, m.stats.open);
  assert.ok(m.stats.byKind.internship.employers > 0);
});

test('rows carrying a community list marker are dropped, not published', () => {
  const d = day1();
  const base = d.rows.find((r) => /Intern/.test(r.job_title));
  const mk = (id, patch) => ({ ...base, id, url: `https://boards.example.invalid/x/jobs/${id}`, job_title: `Unique Intern ${id}`, ...patch });
  d.rows.push(mk('m1', { company: '\u21b3' }), mk('m2', { job_title: 'Quantitative Research Intern \ud83c\udf93' }), mk('m3', { company: '\ud83d\udd25' }));
  const m = buildModel({ data: d, opts: OPTS });
  assert.equal(m.stats.dropped.community_list_marker, 3);
  assert.ok(!m.open.some((x) => /Unique Intern/.test(x.title)));
});

test('only rows proven to be our own crawl, and only employer pages, are listed', () => {
  const m = buildModel({ data: day1(), opts: OPTS });
  assert.equal(m.stats.dropped.not_own_crawl, 1);
  assert.equal(m.stats.dropped.third_party_host, 1);
  assert.ok(!m.open.some((x) => /careerpuck|Unproven|Aggregated/.test(x.url + x.employer)));
  const d = day1();
  d.rows[0].own_crawl_proven = null;
  assert.equal(buildModel({ data: d, opts: OPTS }).stats.dropped.not_own_crawl, 2); // anything but true is not proof
  const old = day1();
  old.rows.forEach((r) => delete r.own_crawl_proven);
  assert.throws(() => buildModel({ data: old, opts: OPTS }), /lacks column own_crawl_proven/);
});

test('a list under the minimum is withheld from the README, by rule', () => {
  const m = buildModel({ data: day1(), opts: { ...OPTS, minKindJobs: 8 } });
  assert.deepEqual(m.withheld.map((w) => w.kind), ['new_grad']);
  assert.ok(m.open.every((x) => x.kind === 'internship'));
  const out = renderReadme(m, careers());
  assert.match(out, /^# Internships, checked on the employer's own site/);
  assert.match(out, /New graduate roles are not listed yet/);
  assert.ok(!/## New graduate/.test(out));
  assert.ok(!/\(#new-graduate\)/.test(out));
});

test('a removal request keeps a row off the list, by link or by employer', () => {
  const base = buildModel({ data: day1(), opts: OPTS });
  const first = base.open[0];
  const byUrl = buildModel({ data: day1(), opts: OPTS, blocklist: { urls: [first.url + '?utm_source=x'], employers: [] } });
  assert.equal(byUrl.stats.dropped.removal_requested, 1);
  assert.ok(!byUrl.open.some((x) => x.list_id === first.list_id));
  const byEmployer = buildModel({ data: day1(), opts: OPTS, blocklist: { urls: [], employers: ['Example Robotics, Inc.'] } });
  assert.ok(!byEmployer.open.some((x) => /Example Robotics/.test(x.employer)));
});

test('a Workday tenant whose robots.txt disallows the career site is left out, other portals are not', () => {
  const host = new URL(buildModel({ data: day1(), opts: OPTS }).open.find((x) => /bank\.wd/.test(x.url)).url).hostname;
  const m = buildModel({ data: day1(), opts: OPTS, robots: { disallowed: [host.toUpperCase()] } });
  assert.ok(m.stats.dropped.tenant_robots_disallows >= 1);
  assert.ok(!m.open.some((x) => new URL(x.url).hostname === host));
  assert.ok(m.open.some((x) => /boards\.example/.test(x.url)));
});

test('public allowlist holds no internal file, and the copy script refuses a folder without .git', { skip: !existsSync(join(root, 'scripts/publish-copy.sh')) && 'working repo only' }, () => {
  const list = readFileSync(join(root, '.public-allowlist'), 'utf8').split('\n').filter(Boolean);
  const internal = /^(QUERIES|DESIGN_UPDATE|HAND_CHECK|LAUNCH_|SPONSORSHIP_PLAN|launch\/|exports\/|scripts\/|\.public-allowlist)/;
  for (const entry of list) assert.ok(!internal.test(entry), `${entry} is internal`);
  for (const must of ['README.md', 'ABOUT.md', 'REMOVAL.md', 'src/', 'test/', 'data/blocklist.json']) assert.ok(list.includes(must), must);
  const dir = mkdtempSync(join(tmpdir(), 'pub-'));
  const r = spawnSync('sh', [join(root, 'scripts/publish-copy.sh'), dir], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no \.git/);
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'DESIGN_UPDATE_x.md'), 'internal');
  const ok = spawnSync('sh', [join(root, 'scripts/publish-copy.sh'), dir], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(join(dir, 'README.md')) && !existsSync(join(dir, 'DESIGN_UPDATE_x.md')) && existsSync(join(dir, '.git')));
  assert.ok(!existsSync(join(dir, 'QUERIES.md')) && !existsSync(join(dir, 'launch')));
});

// ---- own_crawl_seen_at switch (72 h window on the column, grace for slow boards) ----
const withStamp = (rows, hoursOld, exportedAt) =>
  rows.map((r) => ({ ...r, own_crawl_seen_at: new Date(Date.parse(exportedAt) - hoursOld * 3600000).toISOString() }));

test('own_crawl_seen_at: 72 hour window on the column, legacy 48 hour rule without it', () => {
  const d = day1();
  const at = d.exported_at;
  const fresh = { ...d, rows: withStamp(d.rows, 60, at).map((r) => ({ ...r, last_seen_at: '2026-10-01T00:00:00Z' })) };
  const m = buildModel({ data: fresh, opts: OPTS });
  assert.equal(m.freshness, 'own_crawl');
  assert.ok(m.open.length >= 14, `stamped 60 h ago and listed, got ${m.open.length}`);
  assert.ok(!m.stats.dropped.not_seen_in_48h);
  const stale = { ...d, rows: withStamp(d.rows, 80, at) };
  const s = buildModel({ data: stale, opts: OPTS });
  assert.equal(s.open.length, 0);
  assert.ok(s.stats.dropped.own_crawl_stale > 30);
  const mixed = { ...d, rows: d.rows.map((r, i) => (i === 0 ? { ...r, own_crawl_seen_at: null } : r)) };
  assert.equal(buildModel({ data: mixed, opts: OPTS }).freshness, 'legacy'); // one row without it: the old rule for all
  assert.equal(buildModel({ data: day1(), opts: OPTS }).freshness, 'legacy');
});

test('README says last 3 days only when the column is the proof', () => {
  const d = day1();
  const legacy = renderReadme(buildModel({ data: d, opts: OPTS }), careers());
  assert.match(legacy, /last 48 hours/);
  const own = renderReadme(buildModel({ data: { ...d, rows: withStamp(d.rows, 10, d.exported_at) }, opts: OPTS }), careers());
  assert.match(own, /last 3 days/);
  assert.ok(!/48 hours/.test(own));
});

test('grace: a row absent from one run stays open, from two runs it leaves', () => {
  const d1 = day1();
  const m1 = buildModel({ data: d1, opts: OPTS });
  const gone = d1.rows.filter((r) => r.company !== 'Example Capital');
  const run = (iso) => ({ exported_at: iso, rows: gone.map((r) => ({ ...r, last_seen_at: iso.replace(/T.*/, 'T10:00:00Z') })) });
  const g = { ...OPTS, graceRuns: 1 };
  const m2 = buildModel({ data: run('2026-10-11T18:00:00Z'), previous: m1.nextState, opts: g });
  assert.equal(m2.removedCount, 0);
  assert.equal(m2.closed.length, 0);
  assert.ok(m2.open.some((x) => x.employer === 'Example Capital'), 'still listed after one absence');
  assert.equal(m2.open.find((x) => x.employer === 'Example Capital').missed, 1);
  const m3 = buildModel({ data: run('2026-10-12T18:00:00Z'), previous: m2.nextState, opts: g });
  assert.equal(m3.removedCount, 1);
  assert.equal(m3.closed.length, 1);
  assert.ok(!m3.open.some((x) => x.employer === 'Example Capital'));
  // seen again after one absence: counter resets
  const back = buildModel({ data: { ...d1, exported_at: '2026-10-12T18:00:00Z', rows: d1.rows.map((r) => ({ ...r, last_seen_at: '2026-10-12T10:00:00Z' })) }, previous: m2.nextState, opts: g });
  assert.equal(back.open.find((x) => x.employer === 'Example Capital').missed, undefined);
  // README never shows the counter
  assert.ok(!/missed/.test(renderReadme(m2, careers())));
});

test('grace never carries a row that was removed, blocked or left out by robots', () => {
  const d1 = day1();
  const m1 = buildModel({ data: d1, opts: OPTS });
  const gone = { exported_at: '2026-10-11T18:00:00Z', rows: [] };
  const g = { ...OPTS, graceRuns: 1, minJobs: 0, minEmployers: 0, minKindJobs: 0, minKindEmployers: 0 };
  const target = m1.open.find((x) => x.employer === 'Example Capital');
  const blocked = buildModel({ data: gone, previous: m1.nextState, opts: g, blocklist: { urls: [], employers: ['Example Capital'] } });
  assert.ok(!blocked.open.some((x) => x.employer === 'Example Capital'));
  assert.equal(blocked.removedCount >= 1, true);
  const host = new URL(m1.open.find((x) => /bank\.wd/.test(x.url)).url).hostname;
  const robots = buildModel({ data: gone, previous: m1.nextState, opts: g, robots: { disallowed: [host] } });
  assert.ok(!robots.open.some((x) => new URL(x.url).hostname === host));
  assert.ok(target);
});

test('a list withheld for being under the minimum is not counted as rows that left', () => {
  const d1 = day1();
  const m1 = buildModel({ data: d1, opts: OPTS });
  const newGrad = m1.open.filter((x) => x.kind === 'new_grad').length;
  assert.ok(newGrad > 0);
  const d2 = { ...d1, exported_at: '2026-10-11T18:00:00Z', rows: d1.rows.map((r) => ({ ...r, last_seen_at: '2026-10-11T10:00:00Z' })) };
  const m2 = buildModel({ data: d2, previous: m1.nextState, opts: { ...OPTS, minKindJobs: newGrad + 1 } });
  assert.deepEqual(m2.withheld.map((w) => w.kind), ['new_grad']);
  assert.equal(m2.removedCount, 0);
  assert.equal(m2.closed.length, 0);
  assert.ok(!m2.nextState.open.some((x) => x.kind === 'new_grad'));
});

test('the freshness sentence counts the grace run, so it stays true', () => {
  const d = day1();
  const own = { ...d, rows: withStamp(d.rows, 10, d.exported_at) };
  assert.match(renderReadme(buildModel({ data: own, opts: { ...OPTS, graceRuns: 1 } }), careers()), /last 4 days/);
  assert.match(renderReadme(buildModel({ data: d, opts: { ...OPTS, graceRuns: 1 } }), careers()), /last 3 days/);
  assert.match(renderReadme(buildModel({ data: d, opts: OPTS }), careers()), /last 48 hours/);
});

test('grace is for rows the export no longer lists, not for rows a rule now drops', () => {
  const d1 = day1();
  const m1 = buildModel({ data: d1, opts: OPTS });
  const g = { ...OPTS, graceRuns: 1 };
  const target = m1.open.find((x) => x.employer === 'Example Capital');
  // still in the export, but the location now reads as outside the US: it leaves at once
  const d2 = { ...d1, exported_at: '2026-10-11T18:00:00Z', rows: d1.rows.map((r) => ({ ...r, last_seen_at: '2026-10-11T10:00:00Z',
    location: r.company === 'Example Capital' ? 'Toronto, Canada' : r.location })) };
  const m2 = buildModel({ data: d2, previous: m1.nextState, opts: g });
  assert.ok(target);
  assert.ok(!m2.open.some((x) => x.employer === 'Example Capital'));
  assert.ok(m2.removedCount >= 1);
});
