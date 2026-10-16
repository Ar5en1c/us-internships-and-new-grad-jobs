// Writes fixtures/feed_day1.json. Every company here is invented.
import { writeFileSync } from 'node:fs';
let n = 0;
const row = (o) => ({
  id: `fx-${String(++n).padStart(3, '0')}`,
  job_title: '', company: '', location: '', url: '', portal: 'greenhouse', work_arrangement: null,
  salary_range: null, first_captured_at: '2026-10-08T09:00:00Z', last_seen_at: '2026-10-10T12:00:00Z',
  expires_at: null, min_years_experience: null, own_crawl_proven: true, ...o,
});
const rows = [
  row({ job_title: 'Software Engineer Intern, Summer 2027', company: 'Example Robotics', location: 'San Francisco, CA', url: 'https://boards.example.invalid/examplerobotics/jobs/101' }),
  row({ job_title: 'Software Engineer Intern, Summer 2027', company: 'Example Robotics', location: 'San Francisco, CA', url: 'https://boards.example.invalid/examplerobotics/jobs/101/?utm_source=list', last_seen_at: '2026-10-10T08:00:00Z' }),
  row({ job_title: 'Software Engineer Intern, Summer 2027', company: 'Example Robotics, Inc.', location: 'Austin, TX', url: 'https://boards.example.invalid/examplerobotics/jobs/102', first_captured_at: '2026-10-05T09:00:00Z' }),
  row({ job_title: 'Machine Learning Intern', company: 'Example Analytics', location: 'New York, NY', url: 'https://jobs.example.invalid/exampleanalytics/aaa-1', portal: 'lever', salary_range: '$40 to $50 per hour', first_captured_at: '2026-10-09T09:00:00Z' }),
  row({ job_title: 'Hardware Engineering Intern', company: 'Fake Silicon Inc.', location: 'Remote - US', url: 'https://ashby.example.invalid/fakesilicon/h1', portal: 'ashby', work_arrangement: 'remote' }),
  row({ job_title: 'Finance Intern \u2013 Summer 2027', company: 'Sample Bank Holdings', location: 'US-NY-New York', url: 'https://bank.wd.example.invalid/en-US/careers/job/New-York/Finance-Intern_R1', portal: 'workday', first_captured_at: '2026-10-10T01:00:00Z' }),
  row({ job_title: 'New Grad Software Engineer', company: 'Sample Bank Holdings', location: 'Charlotte, NC', url: 'https://bank.wd.example.invalid/en-US/careers/job/Charlotte/New-Grad-SWE_R2', portal: 'workday', first_captured_at: '2026-10-10T01:00:00Z' }),
  row({ job_title: 'Product Design Intern', company: 'Placeholder Labs', location: 'Seattle, WA', url: 'https://ashby.example.invalid/placeholderlabs/p1', portal: 'ashby' }),
  row({ job_title: 'University Graduate, Data Analyst', company: 'Example Analytics', location: 'New York, NY', url: 'https://jobs.example.invalid/exampleanalytics/aaa-2', portal: 'lever' }),
  row({ job_title: 'Internal Tools Engineer', company: 'Example Robotics', location: 'Austin, TX', url: 'https://boards.example.invalid/examplerobotics/jobs/103' }),
  row({ job_title: 'Internship Program Manager', company: 'Example Foods', location: 'Chicago, IL', url: 'https://boards.example.invalid/examplefoods/jobs/201' }),
  row({ job_title: 'Co-op Advertising Specialist', company: 'Example Foods', location: 'Chicago, IL', url: 'https://boards.example.invalid/examplefoods/jobs/202' }),
  row({ job_title: 'Software Engineering Co-op, Fall 2026', company: 'Example Cloud', location: 'Denver, CO', url: 'https://boards.example.invalid/examplecloud/jobs/301' }),
  row({ job_title: 'Summer 2026 Software Intern', company: 'Example Cloud', location: 'Denver, CO', url: 'https://boards.example.invalid/examplecloud/jobs/302' }),
  row({ job_title: 'Talent Community: Early Career', company: 'Example Cloud', location: 'Denver, CO', url: 'https://boards.example.invalid/examplecloud/jobs/304' }),
  row({ job_title: 'Data Intern', company: 'Example Labs', location: 'Boston, MA', url: 'https://boards.example.invalid/examplelabs/jobs/1', expires_at: '2026-10-09T00:00:00Z' }),
  row({ job_title: 'Data Intern', company: 'Example Labs', location: 'Boston, MA', url: 'https://boards.example.invalid/examplelabs/jobs/2', last_seen_at: '2026-10-07T12:00:00Z' }),
  row({ job_title: 'Software Intern', company: 'Example Labs', location: 'Boston, MA', url: 'https://smart.example.invalid/examplelabs/3', portal: 'smartrecruiters' }),
  row({ job_title: 'Software Intern', company: 'Example Labs', location: 'Boston, MA', url: 'https://github.example.invalid/community-list/4', portal: 'github_list' }),
  row({ job_title: 'Software Intern', company: 'Dead Link Co', location: 'Boston, MA', url: '' }),
  row({ job_title: 'Software Intern', company: 'Dead Link Co', location: 'Boston, MA', url: 'javascript:alert(1)' }),
  row({ job_title: 'Software Intern', company: 'Example Overseas', location: 'London, United Kingdom', url: 'https://boards.example.invalid/exampleoverseas/jobs/1' }),
  row({ job_title: 'Software Intern', company: 'Example Overseas', location: 'Toronto, ON, Canada', url: 'https://boards.example.invalid/exampleoverseas/jobs/2' }),
  row({ job_title: 'Software Intern', company: 'Example Overseas', location: '', url: 'https://boards.example.invalid/exampleoverseas/jobs/3' }),
  row({ job_title: 'Software Intern', company: 'Example Overseas', location: 'Remote', url: 'https://boards.example.invalid/exampleoverseas/jobs/4' }),
  row({ job_title: 'Intern `code` _under_ #1 @mention $5 | pipe\nsecond line \u200b', company: 'Odd | Chars *Corp* <b>x</b> [link]', location: 'Boston, MA', url: 'https://boards.example.invalid/odd/jobs/(1)|x', first_captured_at: '2026-10-10T03:00:00Z' }),
  row({ job_title: 'Intern \u2014 reach us at jobs@example.invalid', company: 'Example Contact', location: 'Boston, MA', url: 'https://boards.example.invalid/contact/jobs/1' }),
  row({ job_title: 'Intern', company: 'Example Contact (555-123-4567)', location: 'Boston, MA', url: 'https://boards.example.invalid/contact/jobs/2' }),
  row({ job_title: 'Data Science Intern', company: 'Example Analytics', location: 'New York, NY', url: 'https://jobs.example.invalid/exampleanalytics/aaa-3', portal: 'lever', first_captured_at: '2026-05-01T09:00:00Z' }),
  row({ job_title: 'New Grad Engineer', company: 'Example Cloud', location: 'Denver, CO', url: 'https://boards.example.invalid/examplecloud/jobs/305', min_years_experience: 4 }),
  row({ job_title: 'Early Career Software Engineer', company: 'Example Cloud', location: 'Denver, CO', url: 'https://boards.example.invalid/examplecloud/jobs/306', min_years_experience: 0, first_captured_at: '2026-10-09T09:00:00Z' }),
  row({ job_title: 'New Grad - Quantitative Researcher', company: 'Example Capital', location: 'New York, NY', url: 'https://ashby.example.invalid/examplecapital/q1', portal: 'ashby', salary_range: '$150,000 to $180,000' }),
  row({ job_title: 'Class of 2027 Hardware Engineer', company: 'Fake Silicon Inc.', location: 'Austin, TX', url: 'https://ashby.example.invalid/fakesilicon/h2', portal: 'ashby' }),
  row({ job_title: 'Intern, Marketing', company: 'Example Foods', location: 'Chicago, IL', url: 'https://boards.example.invalid/examplefoods/jobs/203' }),
  row({ job_title: 'Software Intern', company: 'Café Example Ltd', location: 'Portland, Oregon', url: 'https://jobs.example.invalid/cafeexample/c1', portal: 'lever' }),
  row({ job_title: 'Research Internship', company: 'Example Labs', location: 'United States', url: 'https://boards.example.invalid/examplelabs/jobs/9' }),
  row({ job_title: 'Software Intern', company: 'Example Unproven', location: 'Boston, MA', url: 'https://boards.example.invalid/exampleunproven/jobs/1', own_crawl_proven: false }),
  row({ job_title: 'Software Intern', company: 'Example Aggregated', location: 'Boston, MA', url: 'https://app.careerpuck.com/job-board/exampleaggregated/job/1?gh_jid=1' }),
  ...['Seattle, WA', 'Atlanta, GA', 'Chicago, IL', 'Miami, FL'].map((loc, i) =>
    row({ job_title: 'Software Intern', company: 'Example Cloud', location: loc, url: `https://boards.example.invalid/examplecloud/jobs/4${i}`, first_captured_at: `2026-10-0${i + 1}T09:00:00Z` })),
];
writeFileSync(new URL('./feed_day1.json', import.meta.url), JSON.stringify({ exported_at: '2026-10-10T18:00:00Z', rows }, null, 1).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
console.log(rows.length, 'rows');
