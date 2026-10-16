#!/usr/bin/env node
// node src/cli.mjs --input exports/feed.json [--out .] [--now ISO] [--dry-run] [--min-jobs N --min-employers N]
// Exit codes: 0 written, 1 usage or schema error, 2 guard failed (nothing written), 3 paused banner only.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildModel, checkGuards, emptyState, pausedBanner, validateExport } from './build.mjs';
import { renderReadme, renderArchiveMonth, archiveMonths, withPausedBanner } from './render.mjs';

function args(argv) {
  const a = { out: '.', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return a;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

const a = args(process.argv.slice(2));
if (!a.input) { console.error('usage: node src/cli.mjs --input exports/feed.json [--out .] [--now ISO] [--dry-run]'); process.exit(1); }
const out = a.out;
const statePath = a.state || join(out, 'data', 'state.json');
const careersPath = a.careers || join(out, 'data', 'careers_pages.json');
const now = a.now ? new Date(a.now) : new Date();

let data;
try { data = readJson(a.input); validateExport(data); } catch (e) {
  console.error(`schema error: ${e.message}`);
  process.exit(1);
}
const previous = existsSync(statePath) ? readJson(statePath) : emptyState();
const careers = existsSync(careersPath) ? readJson(careersPath) : null;

const readmePath = join(out, 'README.md');
if (pausedBanner(data.exported_at, now)) {
  console.error(`export older than 72 hours: writing the pause banner only`);
  if (!a.dryRun && existsSync(readmePath)) write(readmePath, withPausedBanner(readFileSync(readmePath, 'utf8'), data.exported_at));
  process.exit(3);
}

const opts = {};
if (a.minJobs) opts.minJobs = Number(a.minJobs);
if (a.minEmployers) opts.minEmployers = Number(a.minEmployers);
if (a.minKindJobs) opts.minKindJobs = Number(a.minKindJobs);
if (a.minKindEmployers) opts.minKindEmployers = Number(a.minKindEmployers);
const blockPath = a.blocklist || join(out, 'data', 'blocklist.json');
const blocklist = existsSync(blockPath) ? readJson(blockPath) : null;
const robotsPath = a.robots || join(out, 'data', 'workday_robots.json');
const robots = existsSync(robotsPath) ? readJson(robotsPath) : null;
const model = buildModel({ data, previous, opts, blocklist, robots });
const fails = checkGuards({ model, previous, now, opts });
console.log(JSON.stringify(model.stats, null, 2));
if (fails.length) {
  for (const f of fails) console.error(`guard failed: ${f}`);
  console.error('nothing written; the last good list stays');
  process.exit(2);
}
if (a.dryRun) { console.log('dry run: nothing written'); process.exit(0); }

write(readmePath, renderReadme(model, careers));
for (const m of archiveMonths(model)) write(join(out, 'archive', `${m}.md`), renderArchiveMonth(m, model.archive));
write(statePath, JSON.stringify(model.nextState, null, 2) + '\n');
console.log(`wrote ${readmePath}`);
