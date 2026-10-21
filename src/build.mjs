// Turns exported feed rows into the list model. Deterministic: the same input,
// previous state and `now` always give the same model.
import { createHash } from 'node:crypto';
import {
  PORTALS, isThirdPartyHost, classifyKind, classifyField, isTalentPool, namesPastSeason, cleanText,
  hasContactInfo, cleanUrl, urlKey, employerKey, titleKey, parseLocations,
} from './rules.mjs';

export const REQUIRED_COLUMNS = [
  'id', 'job_title', 'company', 'location', 'url', 'portal', 'work_arrangement',
  'first_captured_at', 'last_seen_at', 'expires_at', 'min_years_experience', 'own_crawl_proven',
];

export const DEFAULTS = {
  freshHours: 48, // legacy proof: last_seen_at in the export
  ownCrawlHours: 72, // proof by the own_crawl_seen_at column
  graceRuns: 0, // runs a row missing from the export stays listed (the cli uses 1)
  maxOpenRows: 1000,
  closedKeepDays: 7,
  evergreenDays: 120,
  maxMinYears: 2, // a title-matched row asking for 3 or more years is mislabelled
  minJobs: 20,
  minEmployers: 5,
  minKindJobs: 20, // a list with fewer rows or employers than this is left out of the README
  minKindEmployers: 5,
  maxFeedAgeHours: 26,
  pauseBannerHours: 72,
  maxOpenDrop: 0.3,
  maxCloseShare: 0.25,
};

const LIST_MARKS = /[\u21b3\u{1F393}\u{1F525}\u{1F6C2}\u{1F1FA}\u{1F512}]/u;

export class SchemaError extends Error {}

export function validateExport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SchemaError('export must be an object with exported_at and rows');
  if (Number.isNaN(Date.parse(data.exported_at))) throw new SchemaError('exported_at is missing or not a date');
  if (!Array.isArray(data.rows)) throw new SchemaError('rows must be an array');
  data.rows.forEach((r, i) => {
    if (!r || typeof r !== 'object') throw new SchemaError(`row ${i} is not an object`);
    for (const c of REQUIRED_COLUMNS) if (!(c in r)) throw new SchemaError(`row ${i} lacks column ${c}`);
  });
}

const day = (d) => new Date(d).toISOString().slice(0, 10);
const hours = (ms) => ms / 3600000;

export function listId(employer, title) {
  return createHash('sha1').update(`${employerKey(employer)}|${titleKey(title)}`).digest('hex').slice(0, 12);
}

const byFirstSeenThenId = (a, b) =>
  a.first_seen < b.first_seen ? 1 : a.first_seen > b.first_seen ? -1 : a.list_id < b.list_id ? -1 : a.list_id > b.list_id ? 1 : 0;

export function emptyState() {
  return { version: 1, generated_at: null, open: [], closed: [], archive: [] };
}

export function buildModel({ data, previous, opts = {}, blocklist = null, robots = null }) {
  const robotsDisallowed = new Set((robots?.disallowed || []).map((h) => String(h).toLowerCase()));
  const blockedUrls = new Set((blocklist?.urls || []).map((u) => { const c = cleanUrl(u); return c ? urlKey(c) : u; }));
  const blockedEmployers = new Set((blocklist?.employers || []).map(employerKey));
  const o = { ...DEFAULTS, ...opts };
  validateExport(data);
  const prev = previous || emptyState();
  const exportedAt = new Date(data.exported_at);
  // The column is the proof only when every row carries it; otherwise the legacy window on last_seen_at applies.
  const ownMode = data.rows.length > 0 && data.rows.every((r) => r.own_crawl_seen_at);
  const dropped = {};
  const drop = (reason) => { dropped[reason] = (dropped[reason] || 0) + 1; };

  // 1. per-row rules
  const kept = [];
  const ruleDropped = new Set();
  for (const r of data.rows) {
    const title = cleanText(r.job_title);
    const employer = cleanText(r.company);
    if (!title || !employer) { drop('missing_text'); continue; }
    // Rows that came through a community list keep that list's own marks: "↳" in place of the
    // employer name, or its legend emoji in the title. Never ours to publish.
    if (!/[\p{L}\p{N}]/u.test(employer) || LIST_MARKS.test(title) || LIST_MARKS.test(employer)) { drop('community_list_marker'); continue; }
    if (!PORTALS.has(String(r.portal || '').toLowerCase())) { drop('portal_not_covered'); continue; }
    // Only rows the export itself proved were stamped by our own crawl (the `own_crawl_proven` column).
    if (r.own_crawl_proven !== true) { drop('not_own_crawl'); continue; }
    const url = cleanUrl(r.url);
    if (!url) { drop('dead_link'); continue; }
    // A row still in the export that a rule drops leaves the list now; grace is only for rows a slow board did not re-list.
    const dropRule = (reason) => { drop(reason); ruleDropped.add(urlKey(url)); };
    if (isThirdPartyHost(url)) { dropRule('third_party_host'); continue; }
    if (String(r.portal).toLowerCase() === 'workday' && robotsDisallowed.has(new URL(url).hostname.toLowerCase())) { dropRule('tenant_robots_disallows'); continue; }
    if (blockedUrls.has(urlKey(url)) || blockedEmployers.has(employerKey(employer))) { dropRule('removal_requested'); continue; }
    const lastSeen = Date.parse(r.last_seen_at);
    if (ownMode) {
      const stamp = Date.parse(r.own_crawl_seen_at);
      if (Number.isNaN(stamp) || hours(exportedAt - stamp) > o.ownCrawlHours) { drop('own_crawl_stale'); continue; }
    } else if (Number.isNaN(lastSeen) || hours(exportedAt - lastSeen) > o.freshHours) { drop('not_seen_in_48h'); continue; }
    if (r.expires_at && Date.parse(r.expires_at) <= exportedAt.getTime()) { dropRule('expired'); continue; }
    const firstCaptured = Date.parse(r.first_captured_at);
    if (Number.isNaN(firstCaptured)) { drop('bad_first_seen'); continue; }
    if (hasContactInfo(title, employer, r.location)) { dropRule('contact_info'); continue; }
    if (isTalentPool(title)) { dropRule('talent_pool'); continue; }
    const kind = classifyKind(title);
    if (!kind) { dropRule('title_not_matching'); continue; }
    if (namesPastSeason(title, exportedAt)) { dropRule('past_season'); continue; }
    if ((exportedAt - firstCaptured) / 86400000 > o.evergreenDays) { dropRule('older_than_120_days'); continue; }
    if (Number(r.min_years_experience) > o.maxMinYears) { dropRule('asks_for_experience'); continue; }
    const loc = parseLocations(r.location, r.work_arrangement);
    if (loc.reason) { dropRule(loc.reason); continue; }
    kept.push({ r, title, employer, url, lastSeen, firstCaptured, kind, loc });
  }

  // 2. same posting link twice: keep the most recently seen, then the smallest id
  const byUrl = new Map();
  for (const k of kept) {
    const key = urlKey(k.url);
    const cur = byUrl.get(key);
    if (!cur) { byUrl.set(key, k); continue; }
    drop('duplicate_link');
    const better = k.lastSeen > cur.lastSeen || (k.lastSeen === cur.lastSeen && String(k.r.id) < String(cur.r.id));
    if (better) byUrl.set(key, k);
  }

  // 3. same employer and title (repost, several cities): one row, locations merged
  const groups = new Map();
  for (const k of [...byUrl.values()].sort((a, b) => (urlKey(a.url) < urlKey(b.url) ? -1 : 1))) {
    const id = listId(k.employer, k.title);
    const g = groups.get(id);
    if (!g) {
      groups.set(id, { list_id: id, employer: k.employer, title: k.title, kind: k.kind, field: classifyField(k.title),
        locations: new Set(k.loc.us), url: k.url, firstCaptured: k.firstCaptured });
      continue;
    }
    drop('merged_same_title');
    k.loc.us.forEach((l) => g.locations.add(l));
    if (k.firstCaptured < g.firstCaptured) { g.firstCaptured = k.firstCaptured; g.url = k.url; }
  }
  let open = [...groups.values()].map((g) => ({
    list_id: g.list_id, employer: g.employer, title: g.title, kind: g.kind, field: g.field,
    locations: [...new Map([...g.locations].map((l) => [l.toLowerCase(), l])).values()]
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)),
    url: g.url, first_seen: day(g.firstCaptured),
  }));
  // Grace: a row that was listed last run and is missing now stays one more run (a slow board is
  // read less often than the window). Never carried: rows that were removed on request or whose
  // Workday tenant disallows the career site.
  const graced = [];
  if (o.graceRuns > 0) {
    const have = new Set(open.map((x) => x.list_id));
    for (const x of prev.open) {
      if (have.has(x.list_id) || (x.missed || 0) >= o.graceRuns) continue;
      if (ruleDropped.has(urlKey(x.url))) continue;
      const host = new URL(x.url).hostname.toLowerCase();
      if (blockedUrls.has(urlKey(x.url)) || blockedEmployers.has(employerKey(x.employer))) continue;
      if (robotsDisallowed.has(host)) continue;
      graced.push({ ...x, missed: (x.missed || 0) + 1 });
    }
    open = open.concat(graced);
  }
  // A list with fewer rows or employers than the minimum is not published yet.
  const withheld = [];
  for (const kind of ['internship', 'new_grad']) {
    const rows = open.filter((x) => x.kind === kind);
    const emp = new Set(rows.map((x) => employerKey(x.employer))).size;
    if (rows.length && (rows.length < o.minKindJobs || emp < o.minKindEmployers)) {
      withheld.push({ kind, open: rows.length, employers: emp });
      open = open.filter((x) => x.kind !== kind);
    }
  }
  open.sort(byFirstSeenThenId);
  let capped = 0;
  if (open.length > o.maxOpenRows) { capped = open.length - o.maxOpenRows; open = open.slice(0, o.maxOpenRows); }

  // 4. closed and archive, from the previous state
  const today = day(exportedAt);
  const openIds = new Set(open.map((x) => x.list_id));
  // Rows of a withheld list were not closed, only hidden: they are not counted as having left.
  const withheldKinds = new Set(withheld.map((w) => w.kind));
  const removed = prev.open.filter((x) => !openIds.has(x.list_id) && !withheldKinds.has(x.kind)).map((x) => ({ ...x, closed_on: today }));
  const carriedClosed = [];
  const archive = [...prev.archive];
  for (const c of [...prev.closed, ...removed]) {
    if (openIds.has(c.list_id)) continue; // reopened
    const age = (Date.parse(today) - Date.parse(c.closed_on)) / 86400000;
    if (age > o.closedKeepDays) archive.push(c);
    else carriedClosed.push(c);
  }
  const seenArchive = new Set();
  const archiveUnique = archive
    .filter((x) => { const k = `${x.list_id}|${x.closed_on}`; if (seenArchive.has(k)) return false; seenArchive.add(k); return true; })
    .sort((a, b) => (a.closed_on < b.closed_on ? 1 : a.closed_on > b.closed_on ? -1 : a.list_id < b.list_id ? -1 : 1));
  const closed = [...new Map(carriedClosed.map((c) => [c.list_id, c])).values()]
    .sort((a, b) => (a.closed_on < b.closed_on ? 1 : a.closed_on > b.closed_on ? -1 : a.list_id < b.list_id ? -1 : 1));

  const employers = new Set(open.map((x) => employerKey(x.employer))).size;
  const byKind = {};
  for (const kind of ['internship', 'new_grad']) {
    const rows = open.filter((x) => x.kind === kind);
    byKind[kind] = { open: rows.length, employers: new Set(rows.map((x) => employerKey(x.employer))).size };
  }
  return {
    exportedAt: exportedAt.toISOString(),
    open, closed, archive: archiveUnique, employers, withheld, graced: graced.length, freshness: ownMode ? 'own_crawl' : 'legacy',
    windowHours: (ownMode ? o.ownCrawlHours : o.freshHours) + 24 * o.graceRuns,
    removedCount: removed.length,
    stats: { rowsIn: data.rows.length, open: open.length, employers, byKind, withheld, capped, dropped: sortKeys(dropped) },
    nextState: { version: 1, generated_at: exportedAt.toISOString(), open, closed, archive: archiveUnique },
  };
}

function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

/** Returns a list of failure strings. Empty means safe to write. */
export function checkGuards({ model, previous, now, opts = {} }) {
  const o = { ...DEFAULTS, ...opts };
  const fails = [];
  const age = hours(now - new Date(model.exportedAt));
  if (Number.isNaN(age)) fails.push('the run time is not a date');
  else if (age < -1) fails.push(`export is dated ${(-age).toFixed(1)} hours in the future`);
  if (age > o.maxFeedAgeHours) fails.push(`export is ${age.toFixed(1)} hours old (limit ${o.maxFeedAgeHours})`);
  if (model.open.length < o.minJobs) fails.push(`only ${model.open.length} open jobs (minimum ${o.minJobs})`);
  if (model.employers < o.minEmployers) fails.push(`only ${model.employers} employers (minimum ${o.minEmployers})`);
  const prevOpen = previous?.open?.length || 0;
  if (prevOpen > 0) {
    const drop = (prevOpen - model.open.length) / prevOpen;
    if (drop > o.maxOpenDrop) fails.push(`open rows fell ${(drop * 100).toFixed(0)}% (limit ${o.maxOpenDrop * 100}%)`);
    const closeShare = model.removedCount / prevOpen;
    if (closeShare > o.maxCloseShare) fails.push(`${(closeShare * 100).toFixed(0)}% of rows left the list (limit ${o.maxCloseShare * 100}%)`);
  }
  return fails;
}

export function pausedBanner(exportedAt, now, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return hours(now - new Date(exportedAt)) > o.pauseBannerHours;
}
