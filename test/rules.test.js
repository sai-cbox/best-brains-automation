'use strict';
const test = require('node:test'), assert = require('node:assert');
const { RULES, validateProposal, PROPOSAL_FIELDS } = require('../src/rules');
const { engine } = require('./helpers');

test('every example on the Rules page is exactly what the engine writes', () => {
  const e = engine(); let n = 0;
  for (const g of RULES) for (const r of g.items) {
    if (!r.example) continue; n++;
    const x = r.example, present = x.attendance !== 'absent';
    const out = e.generate([{ row: 2, student_name: 'x', last_week_log: x.cell, is_present: present, book_collected: present || !!x.book, new_header_date: x.date }])[0];
    assert.strictEqual(out.next_week_log, x.result, `${r.id}: ${JSON.stringify(x.cell)}`);
    if (x.cyan) assert.ok(out.needs_color, `${r.id} should be cyan`);
  }
  assert.ok(n >= 30, `expected many examples, got ${n}`);
});

test('rule ids are unique and every rule has when + then', () => {
  const ids = new Set();
  for (const g of RULES) for (const r of g.items) { assert.ok(r.when && r.then, r.id); assert.ok(!ids.has(r.id), `dup ${r.id}`); ids.add(r.id); }
});

test('proposal format: all required fields, attendance and date checked', () => {
  const ok = { title: 'T', group: '3. Attendance', when: 'w', then: 't', cell: 'E JrBg A', attendance: 'absent', date: '10/13/2026', expected: 'E JrBg A', by: 'Sai' };
  assert.ok(validateProposal(ok).ok);
  assert.ok(!validateProposal({ ...ok, attendance: 'maybe' }).ok);
  assert.ok(!validateProposal({ ...ok, date: '2026-10-13' }).ok);
  assert.ok(!validateProposal({ ...ok, expected: '' }).ok);
  assert.ok(!validateProposal({}).ok);
  assert.strictEqual(validateProposal({ ...ok, junk: 'x' }).clean.junk, undefined);
  assert.ok(PROPOSAL_FIELDS.every(f => f.label && f.help));
});
