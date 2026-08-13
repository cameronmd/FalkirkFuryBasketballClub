/* Build the bundled fixtures dataset from the season spreadsheet.
 *
 *   node tools/build-data.js [path-to.xlsx]
 *
 * Reads the workbook with the same parser the browser uses, then writes
 * data/fixtures.json in the compact share.js format. The app loads that file
 * on first visit so the site is useful without anyone having to upload a file.
 * Re-run this whenever the season spreadsheet changes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const parser = require('../parser.js');
const share = require('../share.js');

const src = process.argv[2] || path.join(__dirname, '..', 'sample.xlsx');
if (!fs.existsSync(src)) {
  console.error('Spreadsheet not found:', src);
  console.error('Usage: node tools/build-data.js [path-to.xlsx]');
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer', cellDates: true });
const model = parser.parseWorkbook(wb);
const json = share.serialize(model);

const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'fixtures.json');
fs.writeFileSync(out, json + '\n');

const totalFixtures = model.teams.reduce((n, t) => n + t.fixtures.length, 0);
console.log('Wrote', path.relative(path.join(__dirname, '..'), out));
console.log('  season :', model.season);
console.log('  teams  :', model.teams.map(t => t.id).join(', '));
console.log('  fixtures:', totalFixtures);
