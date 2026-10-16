// Markdown output. Fixed column order, absolute dates, one line per row.
import { cell, cleanText, cleanUrl } from './rules.mjs';
import { FIELDS } from './rules.mjs';

// The one tagged link. Rows stay untagged.
export const YOUXAI_LINK =
  'https://youxai.app/?utm_source=github&utm_medium=referral&utm_campaign=job_list&utm_content=readme';

const KINDS = [
  ['internship', 'Internships'],
  ['new_grad', 'New graduate'],
];

const stamp = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function locationCell(locations) {
  if (!locations.length) return '';
  const shown = locations.slice(0, 3).map(cell).join('; ');
  return locations.length > 3 ? `${shown}; and ${locations.length - 3} more` : shown;
}

const rowLine = (x) =>
  `| ${cell(x.employer)} | ${cell(x.title)} | ${locationCell(x.locations)} | ${x.first_seen} | [Apply](${x.url}) |`;

const closedLine = (x) =>
  `| ${cell(x.employer)} | ${cell(x.title)} | ${locationCell(x.locations)} | ${x.first_seen} | ${x.closed_on} |`;

const HEAD = '| Employer | Role | Location | First seen | Apply |\n| --- | --- | --- | --- | --- |';
const CLOSED_HEAD = '| Employer | Role | Location | First seen | Left the list |\n| --- | --- | --- | --- | --- |';

export function renderReadme(model, careers) {
  const out = [];
  const withheld = model.withheld || [];
  const kinds = KINDS.filter(([k]) => !withheld.some((w) => w.kind === k));
  const title = kinds.length === KINDS.length ? 'Internships and new graduate jobs' : 'Internships';
  out.push(`# ${title}, checked on the employer's own site`, '');
  out.push('Each row is a posting on an employer\'s own job board that our job feed saw in the last 48 hours, and each one links to the employer\'s own page. A role was open when we checked and may have closed since. If we do not know something, the cell is blank.', '');
  out.push(`Last run: ${stamp(model.exportedAt)}. ${model.open.length} open roles at ${model.employers} employers.`, '');
  out.push('Wrong or closed row? Open an issue, or email founder@youxai.app. We reply within 2 business days.', '');
  out.push(`Maintained by [YouxAI](${YOUXAI_LINK}), a Chrome extension that finds roles that fit you and fills job applications.`, '');
  out.push('United States roles only for now. Dates are the day we first saw the role, in UTC.', '');
  const count = (kind) => model.open.filter((x) => x.kind === kind).length;
  const jump = kinds.map(([k, h]) => `[${h} (${count(k)})](#${h.toLowerCase().replace(/\s+/g, '-')})`);
  if (model.closed.length) jump.push('[Left the list](#left-the-list-in-the-last-7-days)');
  if (careers?.pages?.length) jump.push('[Careers pages](#large-employers-with-their-own-careers-sites)');
  out.push(`Jump to: ${jump.join(' | ')}`, '');

  if (withheld.some((w) => w.kind === 'new_grad')) {
    out.push('New graduate roles are not listed yet. They are added when there are enough of them to be useful.', '');
  }
  for (const [kind, heading] of kinds) {
    const rows = model.open.filter((x) => x.kind === kind);
    out.push(`## ${heading}`, '');
    if (!rows.length) { out.push('Nothing open right now.', ''); continue; }
    for (const field of FIELDS) {
      const inField = rows.filter((x) => x.field === field);
      if (!inField.length) continue;
      out.push(`### ${field} (${inField.length})`, '', HEAD, ...inField.map(rowLine), '');
    }
  }

  if (model.closed.length) {
    out.push('## Left the list in the last 7 days', '');
    out.push('These rows were on the list and are not in the latest check. The posting may be closed, or we may not have seen it this time.', '');
    out.push(CLOSED_HEAD, ...model.closed.map(closedLine), '');
  }

  if (careers?.pages?.length) {
    out.push('## Large employers with their own careers sites', '');
    out.push(`We do not read these sites, so they have no rows above. The links go to each employer's own careers page, checked on ${careers.verified_on}.`, '');
    out.push('| Employer | Careers page |', '| --- | --- |');
    for (const p of [...careers.pages].sort((a, b) => (a.employer.toLowerCase() < b.employer.toLowerCase() ? -1 : 1))) {
      const url = cleanUrl(p.url);
      if (url) out.push(`| ${cell(p.employer)} | [${cell(p.employer)} careers](${url}) |`);
    }
    out.push('');
  }

  const months = [...new Set(model.archive.map((x) => x.closed_on.slice(0, 7)))].sort().reverse();
  if (months.length) {
    out.push('## Archive', '', ...months.map((m) => `- [${m}](archive/${m}.md)`), '');
  }
  out.push('---', '', `Method and limits: [ABOUT.md](ABOUT.md). Built by [YouxAI](${YOUXAI_LINK}).`, '');
  return out.join('\n');
}

export function renderArchiveMonth(month, entries) {
  const rows = entries.filter((x) => x.closed_on.slice(0, 7) === month);
  return ['# Archive ' + month, '', 'Rows that left the list this month.', '', CLOSED_HEAD, ...rows.map(closedLine), ''].join('\n');
}

export function archiveMonths(model) {
  return [...new Set(model.archive.map((x) => x.closed_on.slice(0, 7)))].sort();
}

export const PAUSE_PREFIX = '> Updates paused since';

export function withPausedBanner(readme, sinceIso) {
  const line = `${PAUSE_PREFIX} ${cleanText(sinceIso).slice(0, 10)}.`;
  const lines = readme.split('\n');
  if (lines[0].startsWith(PAUSE_PREFIX)) { lines[0] = line; return lines.join('\n'); }
  return `${line}\n\n${readme}`;
}
