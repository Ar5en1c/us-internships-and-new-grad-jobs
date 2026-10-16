// Classification and text rules. Pure functions, no I/O.
// Title rules follow M2_design section 2; the regexes here must stay in step
// with the coarse SQL prefilter used for the export (the SQL is wider, never narrower).

export const PORTALS = new Set(['greenhouse', 'lever', 'ashby', 'workday']);

const INTERN = /\b(intern|interns|internship|internships)\b/i;
const COOP = /\bco-?op\b/i;
const COOP_CONTEXT = /\b(summer|fall|winter|spring|autumn|20\d\d|student)\b/i;
// Words that make the role something other than an intern, wherever they sit in the title.
const INTERN_REJECT = /\b(senior|staff|principal|lead|coordinator|recruiter)\b/i;
// Words that only reject when they follow the word intern ("Internship Program Manager" is a manager;
// "Product Manager Intern" is an intern).
const INTERN_REJECT_AFTER = /\b(intern|interns|internship|internships|co-?op)\b.*\b(manager|director|head)\b/i;
const GRAD =
  /\b(new[\s-]?grads?|new\s+(?:college\s+)?graduates?|university\s+grads?|university\s+graduates?|recent\s+(?:college\s+)?grads?|recent\s+(?:college\s+)?graduates?|early\s+careers?|campus\s+hir(?:e|es|ing)|graduate\s+program|class\s+of\s+20\d\d)\b/i;
const GRAD_REJECT = /\b(senior|staff|principal|director|recruiter|manager|coordinator|lead)\b/i;
const TALENT_POOL =
  /\b(talent\s+(pool|community|network)|general\s+(application|interest)|future\s+(opportunities|openings)|evergreen)\b/i;

/** 'internship' | 'new_grad' | null. Internship wins when both match. */
export function classifyKind(title) {
  const t = String(title || '');
  if ((INTERN.test(t) || (COOP.test(t) && COOP_CONTEXT.test(t))) && !INTERN_REJECT.test(t) && !INTERN_REJECT_AFTER.test(t)) {
    return 'internship';
  }
  if (GRAD.test(t) && !GRAD_REJECT.test(t)) return 'new_grad';
  return null;
}

export function isTalentPool(title) {
  return TALENT_POOL.test(String(title || ''));
}

// First month (UTC) a season counts as running. Applying to a season that has begun is not
// the same offer as one that is coming, so a started season is left out like a past one.
const SEASON_START_MONTH = { winter: 1, spring: 1, summer: 6, fall: 9, autumn: 9 };

/** True when the title names a season that has already started, or a year that is over, at `now`. */
export function namesPastSeason(title, now) {
  const t = String(title || '');
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const seasonRe = '(summer|spring|fall|autumn|winter)';
  const withSeason = new RegExp(`\\b${seasonRe}\\W+(?:of\\s+)?(20\\d\\d)\\b|\\b(20\\d\\d)\\W+${seasonRe}\\b`, 'gi');
  const seenYears = new Set();
  for (const m of t.matchAll(withSeason)) {
    const season = (m[1] || m[4]).toLowerCase();
    const year = Number(m[2] || m[3]);
    seenYears.add(year);
    if (year < nowYear) return true;
    if (year === nowYear && nowMonth >= SEASON_START_MONTH[season]) return true;
  }
  for (const m of t.matchAll(/\b(20\d\d)\b/g)) {
    const year = Number(m[1]);
    if (!seenYears.has(year) && year < nowYear) return true;
  }
  return false;
}

export const FIELDS = ['Software', 'Data and ML', 'Hardware', 'Product', 'Finance', 'Other'];

const FIELD_RULES = [
  ['Finance', /\b(financ\w*|accounting|investment\w*|banking|audit\w*|tax|quant\w*|trader|trading|treasury|actuarial)\b/i],
  ['Hardware', /\b(hardware|electrical|mechanical|firmware|embedded|silicon|asic|fpga|rf|manufacturing|chip|semiconductor)\b/i],
  ['Product', /\b(product\s+(manager|management|design\w*|analyst|operations)|ux|ui\/ux|designer)\b/i],
  ['Data and ML', /\b(data|machine\s+learning|ml|ai|analytics|analyst|research\s+scientist|scientist)\b/i],
  ['Software', /\b(software|swe|developer|engineer\w*|programmer|backend|frontend|full[\s-]?stack|devops|sre|security|cloud|platform|mobile|web)\b/i],
];

export function classifyField(title) {
  const t = String(title || '');
  for (const [name, re] of FIELD_RULES) if (re.test(t)) return name;
  return 'Other';
}

// ---------- text safety ----------

const DASHES = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2800\u3164\ufeff\ufe00-\ufe0f\uffa0]/g;

/** Plain text: NFC, no control or bidi characters, one space between words, no dash variants. */
export function cleanText(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(INVISIBLE, ' ')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape employer text for one Markdown table cell (GitHub flavour). */
export function cell(s) {
  return cleanText(s)
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/#/g, '&#35;')
    .replace(/@/g, '&#64;')
    .replace(/[*_`~|\[\]$]/g, '\\$&');
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINKISH = /https?:\/\/|www\./i;
const PHONE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

export function hasContactInfo(...parts) {
  return parts.some((p) => EMAIL.test(String(p || '')) || LINKISH.test(String(p || '')) || PHONE.test(String(p || '')));
}

// hasContactInfo also refuses text that carries its own link (employer text never becomes a link).

// ---------- links ----------

const TRACKING = /^(utm_|gh_src$|fbclid$|gclid$|msclkid$|igshid$|mc_cid$|mc_eid$|_hsenc$|_hsmi$|lever-source$|lever-origin$|source$|referrer$)/i;

/** Clean https link, or null when the row should be treated as a dead link. */
export function cleanUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes('.')) return null;
  if (/^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.startsWith('[')) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\|/g, '%7C');
}

/** Identity of a posting for de-duplication: lower-case host, no trailing slash. */
export function urlKey(clean) {
  const u = new URL(clean);
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.hostname.toLowerCase()}${path}${u.search}`;
}

// ---------- names ----------

const COMPANY_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|lp)\b/g;

export function employerKey(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function titleKey(title) {
  return cleanText(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------- locations ----------

const STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const STATE_SET = new Set(STATES);
const STATE_NAMES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
const STATE_NAME_RE = new RegExp(`,\\s*(${STATE_NAMES.join('|')})\\b`);
const NON_US = /\b(Canada|India|Mexico|United Kingdom|UK|England|Germany|France|Ireland|Singapore|Israel|Australia|Japan|China|Brazil|Netherlands|Poland|Spain)\b/i;
// Two letter country codes that are also state codes. For these (and for "Georgia") a well known
// non-US city next to the code means the country, not the state. The real fix is a country column.
const AMBIGUOUS_CODES = new Set(['CA', 'DE', 'IN', 'IL', 'CO', 'ID', 'AR', 'MA', 'PA']);
const NON_US_CITY = /\b(Toronto|Vancouver|Montreal|Ottawa|Calgary|Edmonton|Mississauga|Berlin|Munich|Hamburg|Frankfurt|Cologne|Dusseldorf|Stuttgart|Bangalore|Bengaluru|Mumbai|Delhi|New Delhi|Hyderabad|Pune|Chennai|Gurgaon|Gurugram|Noida|Kolkata|Tel Aviv|Jerusalem|Haifa|Herzliya|Bogota|Medellin|Jakarta|Buenos Aires|Casablanca|Tbilisi|Batumi)\b/i;
// Bare names of big US cities with no common non-US namesake. A bare city is positive US evidence
// only when the whole location is one of these (or "<prefix> - <city>"); lists such as
// "San Francisco, Amsterdam" are not.
const US_CITIES = {
  'san francisco': 'San Francisco', 'new york': 'New York', 'new york city': 'New York City', nyc: 'New York City',
  boston: 'Boston', seattle: 'Seattle', chicago: 'Chicago', 'los angeles': 'Los Angeles', austin: 'Austin',
  atlanta: 'Atlanta', denver: 'Denver', pittsburgh: 'Pittsburgh', 'san diego': 'San Diego', houston: 'Houston',
  dallas: 'Dallas', philadelphia: 'Philadelphia', 'palo alto': 'Palo Alto', 'mountain view': 'Mountain View',
  'menlo park': 'Menlo Park', 'redwood city': 'Redwood City', 'santa clara': 'Santa Clara', sunnyvale: 'Sunnyvale',
  cambridge: null, // Cambridge UK: never bare
  brooklyn: 'Brooklyn', 'washington dc': 'Washington, DC',
};
const WORK_PREFIX = /^(hybrid|remote|on-?site|in[\s-]?office)\s*[-:,]\s*/i;
const US_WORD = /\b(United States(?: of America)?|USA|U\.S\.A?\.?|US)\b/;

/** Split on ; | and bullets, but never inside parentheses. "Remote (United States | Canada)" becomes
 *  "Remote (United States)" and "Remote (Canada)", so every label keeps balanced parentheses. */
function splitLocations(text) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[;|\u2022]/.test(ch)) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean).flatMap((part) => {
    const m = part.match(/^(.*?)\(([^()]*)\)\s*$/);
    if (!m || !/[;|\u2022]/.test(m[2]) || !/^(remote|hybrid|on-?site)\s*$/i.test(m[1])) return [part];
    return m[2].split(/\s*[;|\u2022]\s*/).filter(Boolean).map((item) => `${m[1]}(${item})`);
  });
}

function balanceParens(label) {
  let depth = 0, cut = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === '(') { if (depth === 0) cut = i; depth++; }
    else if (label[i] === ')') { if (depth > 0) depth--; else return label.slice(0, i).trim(); }
  }
  return depth > 0 ? label.slice(0, cut).trim() : label;
}

/**
 * Returns { us: string[], remote: boolean, reason: null|'no_location'|'no_us_evidence' }.
 * `us` holds display labels for the parts that show positive US evidence; the rest are dropped.
 */
export function parseLocations(raw, workArrangement) {
  const text = cleanText(raw).replace(/\bD\.\s?C\.?(?=\s*(?:$|[,;|]))/g, 'DC');
  const remoteFlag = /remote/i.test(String(workArrangement || ''));
  if (!text) return { us: [], remote: remoteFlag, reason: 'no_location' };
  const parts = splitLocations(text);
  const us = [];
  let remote = remoteFlag;
  for (let part of parts) {
    const bareText = part.replace(WORK_PREFIX, '');
    // Workday style: "GA - Alpharetta", "NY-New York"
    const st = bareText.match(/^([A-Z]{2})\s*-\s*(.+)$/);
    if (st && STATE_SET.has(st[1]) && !NON_US.test(st[2]) && !(AMBIGUOUS_CODES.has(st[1]) && NON_US_CITY.test(st[2]))) {
      us.push(`${st[2].trim()}, ${st[1]}`);
      continue;
    }
    const bare = US_CITIES[bareText.trim().toLowerCase()];
    if (bare) { if (bareText !== part) remote = remote || /remote/i.test(part); us.push(bare); continue; }
    if (NON_US.test(part.replace(/\bNew Mexico\b/gi, 'NM'))) continue;
    const isRemote = /\bremote\b/i.test(part);
    if (isRemote) remote = true;
    // Workday style: US-CA-San Francisco
    const wd = part.match(/^US[-,]\s*([A-Z]{2})\s*[-,]\s*(.+)$/);
    if (wd && STATE_SET.has(wd[1])) {
      us.push(`${wd[2].trim()}, ${wd[1]}`);
      continue;
    }
    const stateAbbr = part.match(/,\s*([A-Z]{2})\b/);
    const hasState = (stateAbbr && STATE_SET.has(stateAbbr[1])) || STATE_NAME_RE.test(part);
    const hasUsWord = US_WORD.test(part);
    if (!hasState && !hasUsWord) continue;
    const ambiguous = (stateAbbr && AMBIGUOUS_CODES.has(stateAbbr[1])) || /,\s*Georgia\b/.test(part);
    if (ambiguous && !hasUsWord && NON_US_CITY.test(part)) continue;
    let label = part
      .replace(/(,\s*[A-Z]{2})\s+\d{5}(?:-\d{4})?$/, '$1')
      .replace(/^United States(?: of America)?\s*[-,]\s*/i, '')
      .replace(/,\s*(United States(?: of America)?|USA|U\.S\.A?\.?|US)$/i, '')
      .trim();
    if (/^(United States(?: of America)?|USA|U\.S\.A?\.?|US)$/i.test(label)) label = 'United States';
    label = balanceParens(label);
    if (label) us.push(label);
  }
  const unique = [...new Map(us.map((l) => [l.toLowerCase(), l])).values()].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
  );
  return { us: unique, remote, reason: unique.length ? null : 'no_us_evidence' };
}

// ---------- hosts ----------

// Boards and aggregators that are not the employer's own posting page.
const THIRD_PARTY_HOSTS = [
  'careerpuck.com', 'linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'simplify.jobs',
  'joinhandshake.com', 'wellfound.com', 'angel.co', 'builtin.com', 'workatastartup.com', 'ycombinator.com',
  'levels.fyi', 'themuse.com', 'remoteok.com', 'remotive.com', 'weworkremotely.com', 'jooble.org',
  'adzuna.com', 'monster.com', 'dice.com', 'talent.com', 'jobright.ai', 'swelist.com', 'github.com',
];

/** True when the link's host is a third-party board or aggregator, not the employer's own page. */
export function isThirdPartyHost(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return true; }
  return THIRD_PARTY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
