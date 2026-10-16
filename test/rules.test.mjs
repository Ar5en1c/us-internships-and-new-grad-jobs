import test from 'node:test';
import assert from 'node:assert/strict';
import { isThirdPartyHost, cleanText, classifyKind, classifyField, namesPastSeason, parseLocations, cell, cleanUrl, urlKey, hasContactInfo, isTalentPool, employerKey } from '../src/rules.mjs';

test('internship titles, with the design counter-examples', () => {
  assert.equal(classifyKind('Software Engineer Intern, Summer 2027'), 'internship');
  assert.equal(classifyKind('2027 Internship Program: Data'), 'internship');
  assert.equal(classifyKind('Software Engineering Co-op, Fall 2026'), 'internship');
  assert.equal(classifyKind('Co-op Student, Finance'), 'internship');
  assert.equal(classifyKind('Internal Tools Engineer'), null);
  assert.equal(classifyKind('Internship Program Manager'), null);
  assert.equal(classifyKind('Co-op Advertising Specialist'), null);
  assert.equal(classifyKind('Senior Intern Coordinator'), null);
});

test('new graduate titles', () => {
  assert.equal(classifyKind('New Grad Software Engineer'), 'new_grad');
  assert.equal(classifyKind('New-Grad Engineer'), 'new_grad');
  assert.equal(classifyKind('Early Career Software Engineer'), 'new_grad');
  assert.equal(classifyKind('Class of 2027 Hardware Engineer'), 'new_grad');
  assert.equal(classifyKind('Graduate Admissions Counselor'), null);
  assert.equal(classifyKind('University Graduate, Data Analyst'), 'new_grad');
  assert.equal(classifyKind('Sales Associate'), null);
  assert.equal(classifyKind('Senior New Grad Mentor'), null);
  assert.equal(classifyKind('Intern or New Grad'), 'internship');
});

test('talent pools', () => {
  assert.ok(isTalentPool('Talent Community: Early Career'));
  assert.ok(isTalentPool('General Application'));
  assert.ok(isTalentPool('Future Openings, Interns'));
  assert.ok(!isTalentPool('Software Intern'));
});

test('past seasons and years', () => {
  const oct = new Date('2026-10-10T00:00:00Z');
  assert.ok(namesPastSeason('Summer 2026 Software Intern', oct));
  assert.ok(namesPastSeason('Intern, Spring 2026', oct));
  assert.ok(namesPastSeason('Intern 2025', oct));
  assert.ok(namesPastSeason('Class of 2025 Engineer', oct));
  assert.ok(namesPastSeason('Co-op, Fall 2026', oct), 'a season that has started is left out');
  assert.ok(!namesPastSeason('Co-op, Fall 2026', new Date('2026-07-01T00:00:00Z')));
  assert.ok(!namesPastSeason('Intern, Spring 2027', oct));
  assert.ok(!namesPastSeason('Intern, Winter 2027', oct));
  assert.ok(!namesPastSeason('Intern, Summer 2027', oct));
  assert.ok(!namesPastSeason('Intern', oct));
  assert.ok(namesPastSeason('Winter 2027 Intern, 2025 cohort', oct));
});

test('fields, in priority order', () => {
  assert.equal(classifyField('Software Engineer Intern'), 'Software');
  assert.equal(classifyField('Machine Learning Engineer Intern'), 'Data and ML');
  assert.equal(classifyField('Quantitative Developer Intern'), 'Finance');
  assert.equal(classifyField('Hardware Engineering Intern'), 'Hardware');
  assert.equal(classifyField('Product Manager Intern'), 'Product');
  assert.equal(classifyField('Marketing Intern'), 'Other');
});

test('locations need positive US evidence', () => {
  assert.deepEqual(parseLocations('San Francisco, CA').us, ['San Francisco, CA']);
  assert.deepEqual(parseLocations('US-NY-New York').us, ['New York, NY']);
  assert.deepEqual(parseLocations('Boston, MA, United States').us, ['Boston, MA']);
  assert.deepEqual(parseLocations('Portland, Oregon').us, ['Portland, Oregon']);
  assert.deepEqual(parseLocations('United States').us, ['United States']);
  assert.deepEqual(parseLocations('Austin, TX; London, United Kingdom').us, ['Austin, TX']);
  assert.equal(parseLocations('Toronto, ON, Canada').reason, 'no_us_evidence');
  assert.equal(parseLocations('Remote').reason, 'no_us_evidence');
  assert.equal(parseLocations('   ').reason, 'no_location');
  assert.equal(parseLocations('Remote - US').remote, true);
  assert.equal(parseLocations('Remote, Canada').us.length, 0);
});

test('cell escaping stops Markdown, HTML, mentions and invisible text', () => {
  const s = cell('a | b *c* _d_ `e` [f](g) <i>h</i> @who #1 $x &amp; \u2014 \u2013\nz\u200b\u202e');
  assert.ok(!s.includes('|') || s.includes('\\|'));
  assert.ok(!/<|>/.test(s));
  assert.ok(!s.includes('@') && !/(^|[^&])#/.test(s.replace(/&#\d+;/g, '')));
  assert.ok(!/[\u2013\u2014\u200b\u202e\n]/.test(s));
  assert.equal(cell('Plain Name'), 'Plain Name');
  assert.equal(cell('a&#64;b'), 'a&amp;&#35;64;b');
});

test('links: tracking removed, unsafe and dead forms refused', () => {
  assert.equal(cleanUrl('https://x.example.com/j/1?utm_source=a&gh_jid=7#top'), 'https://x.example.com/j/1?gh_jid=7');
  assert.equal(cleanUrl('https://x.example.com/j/(1)|2'), 'https://x.example.com/j/%281%29%7C2');
  for (const bad of ['', null, 'not a url', 'javascript:alert(1)', 'ftp://x.example.com/a', 'https://user:pw@x.example.com/', 'http://localhost/a', 'https://intranet/a']) {
    assert.equal(cleanUrl(bad), null, String(bad));
  }
  assert.equal(urlKey('https://X.example.com/j/1/'), urlKey('https://x.example.com/j/1'));
});

test('contact details are caught', () => {
  assert.ok(hasContactInfo('mail jobs@example.invalid'));
  assert.ok(hasContactInfo('Co (555) 123-4567'));
  assert.ok(hasContactInfo('call 555-123-4567'));
  assert.ok(hasContactInfo('Intern see https://example.invalid/x'));
  assert.ok(hasContactInfo('Intern www.example.invalid'));
  assert.ok(!hasContactInfo('Intern 2027', 'Example Robotics', 'Austin, TX'));
});

test('employer names compare without suffix noise', () => {
  assert.equal(employerKey('Example Robotics, Inc.'), employerKey('example robotics'));
});

test('new graduate spelled out, and plural early careers', () => {
  for (const t of ['New Graduate Software Engineer', 'Software Engineer, New Graduates', 'New College Graduate, SWE',
    'Recent Graduate Analyst', 'Recent College Grad Engineer', 'Early Careers Engineer', 'Campus Hiring Engineer', 'New Grad RN']) {
    assert.equal(classifyKind(t), 'new_grad', t);
  }
  for (const t of ['Graduate Software Engineer', 'Graduate Medical Education Coordinator', 'Early Career Program Manager',
    'New Grad Recruiter', 'Campus Recruiter', 'Early Careers Coordinator', 'Lead, New Grad Hiring']) {
    assert.equal(classifyKind(t), null, t);
  }
});

test('a manager role before the word intern is still an internship', () => {
  assert.equal(classifyKind('Product Manager Intern'), 'internship');
  assert.equal(classifyKind('Technical Program Manager Intern, Summer 2027'), 'internship');
  assert.equal(classifyKind('Intern, Engineering Manager'), null);
  assert.equal(classifyKind('Internship Program Director'), null);
  assert.equal(classifyKind('Campus Recruiter, Internship Program'), null);
  assert.equal(classifyKind('Recruiting Intern'), 'internship');
});

test('locations: New Mexico, D.C., zip codes, and country codes that look like states', () => {
  assert.deepEqual(parseLocations('Albuquerque, New Mexico').us, ['Albuquerque, New Mexico']);
  assert.deepEqual(parseLocations('Santa Fe, New Mexico, United States').us, ['Santa Fe, New Mexico']);
  assert.equal(parseLocations('Mexico City, Mexico').reason, 'no_us_evidence');
  assert.deepEqual(parseLocations('Washington, D.C.').us, ['Washington, DC']);
  assert.deepEqual(parseLocations('Austin, TX 78701').us, ['Austin, TX']);
  assert.deepEqual(parseLocations('Boston, MA 02110-1234').us, ['Boston, MA']);
  for (const l of ['Bangalore, IN', 'Bengaluru, IN', 'Berlin, DE', 'Tel Aviv, IL', 'Bogota, CO', 'Toronto, CA', 'Tbilisi, Georgia', 'Jakarta, ID']) {
    assert.equal(parseLocations(l).reason, 'no_us_evidence', l);
  }
  for (const l of ['Chicago, IL', 'Denver, CO', 'Indianapolis, IN', 'Berlin, NH', 'Los Angeles, CA', 'Atlanta, Georgia', 'Toronto, CA, United States']) {
    assert.equal(parseLocations(l).reason, null, l);
  }
});

test('more tracking parameters come off, private addresses are refused', () => {
  assert.equal(cleanUrl('https://jobs.lever.co/x/abc?lever-source=LinkedIn&lever-origin=applied'), 'https://jobs.lever.co/x/abc');
  assert.equal(cleanUrl('https://x.wd5.myworkdayjobs.com/c/job/R1?source=Indeed'), 'https://x.wd5.myworkdayjobs.com/c/job/R1');
  assert.equal(cleanUrl('https://boards.greenhouse.io/x/jobs/1?gh_jid=1&gh_src=a&mc_eid=9'), 'https://boards.greenhouse.io/x/jobs/1?gh_jid=1');
  for (const bad of ['http://172.16.0.1/a.b', 'http://172.31.9.9/a.b', 'http://0.0.0.0/a.b', 'http://[::1]/a', 'http://169.254.1.1/a.b']) {
    assert.equal(cleanUrl(bad), null, bad);
  }
});

test('invisible look-alike characters are removed from text', () => {
  assert.equal(cleanText('Soft\u00adhyphen\u3164Name\u2800'), 'Soft hyphen Name');
});

test('locations seen in the real export: "ST - City", bare big US cities, prefixes', () => {
  assert.deepEqual(parseLocations('GA - Alpharetta').us, ['Alpharetta, GA']);
  assert.deepEqual(parseLocations('NY-New York').us, ['New York, NY']);
  assert.deepEqual(parseLocations('CA - Glendale').us, ['Glendale, CA']);
  assert.deepEqual(parseLocations('San Francisco').us, ['San Francisco']);
  assert.deepEqual(parseLocations('NYC').us, ['New York City']);
  assert.deepEqual(parseLocations('New York City').us, ['New York City']);
  assert.deepEqual(parseLocations('Hybrid - San Francisco').us, ['San Francisco']);
  assert.deepEqual(parseLocations('Remote - New York').us, ['New York']);
  for (const l of ['London', 'Paris, France', '2 Locations', 'Singapore-CapitaSky', 'San Francisco, Amsterdam', 'Madrid', 'ON - Toronto', 'CA - Toronto']) {
    assert.equal(parseLocations(l).reason, 'no_us_evidence', l);
  }
});

test('third party boards are not the employer page', () => {
  assert.ok(isThirdPartyHost('https://app.careerpuck.com/job-board/x/job/1?gh_jid=1'));
  assert.ok(isThirdPartyHost('https://www.linkedin.com/jobs/view/1'));
  assert.ok(isThirdPartyHost('https://simplify.jobs/p/abc'));
  assert.ok(!isThirdPartyHost('https://job-boards.greenhouse.io/astranis/jobs/1'));
  assert.ok(!isThirdPartyHost('https://seatgeek.com/jobs/1?gh_jid=1'));
  assert.ok(!isThirdPartyHost('https://careers.airbnb.com/positions/1?gh_jid=1'));
});

test('a bullet separates locations', () => {
  assert.deepEqual(parseLocations('San Francisco, CA \u2022 New York, NY').us, ['New York, NY', 'San Francisco, CA']);
});

test('parentheses stay balanced when locations are split or trimmed', () => {
  assert.deepEqual(parseLocations('Remote (United States | Canada)').us, ['Remote (United States)']);
  assert.deepEqual(parseLocations('Remote (US; Canada); Austin, TX').us, ['Austin, TX', 'Remote (US)']);
  assert.deepEqual(parseLocations('Boston, MA (Hybrid)').us, ['Boston, MA (Hybrid)']);
  assert.equal(parseLocations('Toronto (Canada | US)').reason, 'no_us_evidence');
  for (const l of ['Remote (United States', 'Austin, TX (Hybrid', 'Denver, CO)']) {
    const us = parseLocations(l).us;
    for (const x of us) assert.equal((x.match(/\(/g) || []).length, (x.match(/\)/g) || []).length, x);
  }
});
