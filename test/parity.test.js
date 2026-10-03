'use strict';
// The rebuilt, curriculum-driven engine must give the same answers as the corrected n8n Core Logic.
const test = require('node:test'), assert = require('node:assert');
const { engine, reference } = require('./helpers');

let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const M = ['JrBg','SrBg','0a','0b','1','2','3','4','5','6','6b','7','8'], E = ['JrBg','SrBg','JrR','SrR','MrR','F1','G1','H1','I1','J1','K1','L1','M1','N1','O1'];
const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
function line() {
  const s = pick(['M', 'E']), lv = pick(s === 'M' ? M : E), ch = pick(CH), ch2 = pick(CH);
  const bits = [`${s} ${lv} ${ch}`];
  const r = rnd();
  if (r < .1) bits.push('& ' + ch2);
  else if (r < .2) bits.push(`${pick(['MT1', 'MT2', 'FT', 'MT'])} ${pick(['12/30', '30/31', '47/47', '39/57'])} ${pick(['PASS', 'CNTNU', ''])}`);
  else if (r < .3) bits.push('(' + pick(['MT1 NXT', 'FT NXT', 'NXT ' + lv + ' ' + ch2, 'HT2']) + ')');
  else if (r < .36) bits.push('HT1');
  if (rnd() < .08) bits.splice(1, 0, 'RVW');
  if (rnd() < .05) bits.push('TO HOME');
  return bits.filter(Boolean).join(' ');
}
const dates = ['10/06/2026', '09/01/2026', '09/08/2026', '11/19/2026', '11/20/2026', '12/14/2026', '12/15/2026', '12/18/2026'];
const students = Array.from({ length: 3000 }, (_, i) => ({
  student_name: 'S' + i,
  last_week_log: line() + (rnd() < .5 ? '\nPT' : '') + (rnd() < .2 ? '\n' + line() : ''),
  is_present: rnd() < .8, book_collected: rnd() < .8, new_header_date: pick(dates),
}));
students.push(
  { student_name: 'ob', last_week_log: 'M Ob E\nPT', is_present: true, book_collected: true, new_header_date: '10/06/2026' },
  { student_name: 'colls', last_week_log: 'M 2 E\nCollected book', is_present: false, book_collected: false, new_header_date: '10/06/2026' });

test('3000 generated cells match the reference engine', () => {
  const got = engine().generate(students), want = reference(students);
  const bad = [];
  got.forEach((g, i) => { if (JSON.stringify(g) !== JSON.stringify(want[i])) bad.push({ in: students[i].last_week_log, g: g.next_week_log, w: want[i].next_week_log }); });
  assert.deepStrictEqual(bad.slice(0, 5), [], `${bad.length} differences`);
});
