# About this list

## What it is

A list of internships and new graduate jobs in the United States, built from job boards that employers publish themselves. It is made by a program from a file of rows, the same way every time: the same file gives the same list.

## Where the data comes from

Rows come from the YouxAI job feed. Only rows from four kinds of employer careers boards are used: Greenhouse, Lever, Ashby and Workday. The feed's own crawl is the only source. Other public job lists are never read or copied.

A row is kept only when the export proves our own crawler stamped it in its latest read of that employer's board (the export marks it `own_crawl_proven`; the export query is not part of this repository). Rows first found through a community list, rows the list reader touched after our last read, and rows with no board source are left out. The generator refuses an export that lacks this mark.

A row is kept when:

- the title says it is an internship, a co-op with a season or year, or a new graduate or early career role (for example "new grad", "new graduate", "university graduate", "early careers", "class of 2027"). A manager word before "intern" is fine ("Product Manager Intern"); after it the role is a manager of interns and is left out;
- the posting was seen on the employer's board in the last 48 hours and has not passed its end date;
- for Workday, the employer's tenant does not disallow its career site in its robots.txt (checked per tenant);
- the link is a plain web address that looks usable and is not a third-party board or aggregator (for example careerpuck, LinkedIn, Indeed);
- the location shows it is in the United States;
- it is not a talent pool, a general application, a role for a season that is over or has already started (a Fall 2026 internship is left out from September 2026), or a role first seen more than 120 days ago;
- it does not ask for three or more years of experience in the data we hold.

The same role in several cities is one row with the cities joined. The same role posted twice is one row. Text that holds an email address, a phone number or a web address is dropped, and every cell is escaped so employer text cannot change the layout.

## How often it refreshes

Daily is the aim: the export is taken, the generator runs, and the result is committed. If the export is more than 26 hours old, or the list shrinks by more than 30%, or fewer than 20 jobs from 5 employers are left, the run stops and the last good list stays. After 72 hours without a good run the only change is a banner saying updates are paused.

## What is not covered

- A list (internships, or new graduate) is shown only when it has at least 20 rows from at least 5 employers. The generator withholds a smaller one and shows it once it reaches the minimum.
- Whether a posting is still taking applications. A listed posting was live at export time and may have closed since: a plain page fetch cannot see "applications closed" on pages that draw themselves in the browser (Workday, some Ashby and Greenhouse boards). The list shows what the crawl saw, not a promise.
- Employers whose boards we do not read. The section at the bottom of the list links the careers pages of some large employers with their own sites; those pages were checked by hand and the links are not rows.
- Roles outside the United States.
- Pay, visa wording and job descriptions. Version 1 shows none of them, so no cell guesses.
- Roles whose title does not say intern, co-op or new graduate. A graduate role titled only "Software Engineer" is missed.
- A role that left the list is shown for 7 days as "left the list". We cannot always tell a closed posting from one we did not see this time, so the list does not say "closed".
- Some locations are free text. If we cannot see a United States place in the text, the row is left out.

Known weak spots: a state code that is also a country code (for example "CA" for California or Canada) can be misread; the field sections (Software, Data and ML, Hardware, Product, Finance, Other) are guessed from the title only.

## Wrong or closed rows

Open an issue with the link. Rows are removed on request.

## For contributors

```
npm test                     run the tests
npm run generate -- --input exports/feed.json --out .
```

The export is a JSON file of feed rows; its query is not part of this repository. `fixtures/` holds an invented sample (all companies are fake). Golden outputs are in `test/golden/`; after an intended change run `UPDATE_GOLDEN=1 npm test` and read the diff. Add a careers page only after fetching it with a plain HTTP GET and getting a good answer.

The rules live in `src/rules.mjs` (titles, locations, text safety) and `src/build.mjs` (filters, merging, guards).
