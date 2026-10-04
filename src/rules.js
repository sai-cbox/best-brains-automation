'use strict';
// The rule book shown on the dashboard's Rules page: every condition the generator uses, in the order it checks them.
// Written from the engine code (src/engine.js). Tests, test weeks, novels, level order and holidays are NOT listed here:
// the page reads them from the curriculum sheet.
//
// FIXED FORMAT of one rule (the "Propose a rule" form on the page produces exactly this):
//   when     the condition, in plain words
//   then     what the generator writes / does
//   example  { cell, attendance: 'present'|'absent', book?: true, date, result }  (optional but strongly preferred)
//            cell   = this week's cell exactly as staff typed it (\n = new line)
//            date   = the date of the NEW column being generated (mm/dd/yyyy)
//            result = what the generator writes into the new column
//   status   'confirmed' settled by the Liberty Hill back test | 'default' applied, Sai has not decided | 'open' needs Sai's answer
//   differs  true when it intentionally behaves differently from the n8n Core Logic running today
// Every example here is run through the real engine by test/rules.test.js, so the page can never show an example the code would not produce.

const D = '10/13/2026';   // an ordinary class week: neither this date nor the next week is a holiday
const NOTE = { '08/31/2026': 'week before a holiday', '09/07/2026': 'holiday week' };   // plain words shown instead of the raw date
const ex = (cell, attendance, result, o = {}) => ({ cell, attendance, date: o.date || D, result, ...(NOTE[o.date] ? { note: NOTE[o.date] } : {}), ...(o.book ? { book: true } : {}) });
const PRESENT = 'present', ABSENT = 'absent';

const RULES = [
  { cat: '1. Which cells it reads', blurb: 'How the generator decides what each student did last week.', items: [
    { id: 'R1.1', when: 'A schedule run starts', then: 'It reads the newest dated column as "this week". The new column is that date plus 7 days.', status: 'confirmed' },
    { id: 'R1.2', when: 'Cell colour is yellow or light yellow', then: 'Student is absent.', status: 'confirmed', example: ex('E JrBg A', ABSENT, 'E JrBg A') },
    { id: 'R1.3', when: 'Cell colour is pink, orange, white or cyan', then: 'Student is present. (Pink cells usually carry "PT Yes".)', status: 'confirmed', example: ex('E JrBg A', PRESENT, 'E JrBg B') },
    { id: 'R1.4', when: 'A cell has several lines', then: 'Each line (Maths, English, PT) is handled on its own. Blank lines are ignored.', status: 'confirmed', example: ex('E JrBg A\nPT Yes', PRESENT, 'E JrBg B\nPT') },
  ]},
  { cat: '2. Basics (the default)', blurb: 'What happens to a normal cell when nothing special is going on.', items: [
    { id: 'R2.1', when: 'Student was present and the line is a normal chapter', then: 'Move to the next letter of the alphabet.', status: 'confirmed', example: ex('E K1 D', PRESENT, 'E K1 E') },
    { id: 'R2.2', when: 'Student was absent', then: 'Repeat the same line, so the student does the same chapter again.', status: 'confirmed', example: ex('E K1 D', ABSENT, 'E K1 D') },
    { id: 'R2.3', when: 'The line starts with M', then: 'It is Maths. Any other line is English.', status: 'confirmed', example: ex('M 4 B', PRESENT, 'M 4 C') },
    { id: 'R2.4', when: 'The cell has Maths, English and PT lines', then: 'Each line moves on by itself. PT stays as just "PT".', status: 'confirmed', example: ex('M 4 B\nE K1 D\nPT YES', PRESENT, 'M 4 C\nE K1 E\nPT') },
    { id: 'R2.5', when: 'The subject is written out, like "Eng" or "Math"', then: 'Written back short: "E" or "M".', status: 'confirmed', example: ex('Eng K1 D', PRESENT, 'E K1 E') },
  ]},
  { cat: '3. Attendance', blurb: 'Who moves on and who repeats the same chapter.', items: [
    { id: 'R3.1', when: 'MKP (makeup) appears anywhere in the cell', then: 'Student counts as present and book collected, even on a yellow cell.', status: 'confirmed', example: ex('M 4 B MKP', ABSENT, 'M 4 C') },
    { id: 'R3.2', when: 'The cell says the book was collected (for example "CLLCTD Books" on the PT line)', then: 'Book counts as collected, so an absent student still moves on. If it is typed on the same line as the chapter, that line is dropped.', status: 'confirmed', differs: true, example: ex('M 4 B\nPT ABSENT CLLCTD Books', ABSENT, 'M 4 C\nPT') },
    { id: 'R3.3', when: 'Absent, no collected book, and the new column\'s date is not a holiday', then: 'The line is copied unchanged.', status: 'confirmed', example: ex('E JrBg B & C', ABSENT, 'E JrBg B & C') },
    { id: 'R3.4', when: 'Same, but the week after the new column is a holiday, the line has exactly one chapter and no brackets', then: 'Written as "this chapter & next chapter".', status: 'confirmed', differs: true, example: ex('E JrBg A', ABSENT, 'E JrBg A & B', { date: '08/31/2026' }) },
    { id: 'R3.5', when: 'Present, or book collected, or the new column\'s date is a holiday', then: 'The student moves on (rules 4 to 6).', status: 'confirmed', example: ex('E K1 D\nPT', PRESENT, 'E K1 E\nPT') },
  ]},
  { cat: '4. Moving to the next chapter', blurb: 'How the chapter letter and level advance.', items: [
    { id: 'R4.1', when: 'The line has more than one chapter, like "B & C"', then: 'The last single capital letter outside brackets is the chapter the student is on, so the next one is D.', status: 'confirmed', example: ex('M 4 B & C', PRESENT, 'M 4 D') },
    { id: 'R4.2', when: 'No chapter letter can be found (for example "M 3G")', then: 'The line is copied unchanged for staff to fix.', status: 'confirmed', example: ex('M 3G', PRESENT, 'M 3G') },
    { id: 'R4.3', when: 'Chapter is Z', then: 'Chapter A of the next level, in the order of the curriculum sheet.', status: 'confirmed', example: ex('E JrBg Z', PRESENT, 'E SrBg A') },
    { id: 'R4.4', when: 'On the last level in the sheet, chapter Z, and PASS', then: 'Written as "ALL DONE".', status: 'confirmed', example: ex('M 8 Z PASS', PRESENT, 'M ALL DONE') },
    { id: 'R4.5', when: 'Final test (FT) with PASS, and not a review', then: 'Counts as chapter Z, whatever letter was written, so the student goes to the next level.', status: 'confirmed', differs: true, example: ex('E JrBg C & FT PASS', PRESENT, 'E SrBg A') },
    { id: 'R4.6', when: 'Line contains HT1', then: 'The chapter stays for one week and HT2 is added ("(HT2)" if it was written "(HT1)").', status: 'default', differs: true, example: ex('E JrBg C (HT1)', PRESENT, 'E JrBg C (HT2)') },
    { id: 'R4.7', when: 'Two or more chapters, and the new column\'s date is a holiday or the line says TO HOME', then: 'Keeps the last chapter at the same level.', status: 'confirmed', differs: true, example: ex('M 4 B & C TO HOME\nPT', PRESENT, 'M 4 C\nPT') },
    { id: 'R4.8', when: 'The week after the new column is a holiday (and not a review)', then: 'Two chapters: "next & the one after", moving to the next level if it crosses Z.', status: 'confirmed', example: ex('E JrBg A', PRESENT, 'E JrBg B & C', { date: '08/31/2026' }) },
  ]},
  { cat: '5. Holidays', blurb: 'Read from the Holidays tab of the curriculum sheet.', items: [
    { id: 'R5.1', when: 'Holiday dates', then: 'Read from the Holidays tab of the curriculum sheet. Two dates are checked: the new column\'s date, and that date plus 7 days.', status: 'confirmed' },
    { id: 'R5.2', when: 'The new column\'s date is a holiday', then: 'Everyone moves on, even yellow (absent) cells, because no class was missed.', status: 'confirmed', example: ex('M JrBg D', ABSENT, 'M JrBg E', { date: '09/07/2026' }) },
    { id: 'R5.3', when: 'The new column\'s date plus 7 days is a holiday', then: 'Present students get two chapters; absent single-chapter lines get "this & next" (rule 3).', status: 'confirmed', example: ex('E JrBg A & B', PRESENT, 'E JrBg C & D', { date: '08/31/2026' }) },
  ]},
  { cat: '6. Jump notes and reviews', blurb: 'Notes staff add to send a student to a specific chapter.', items: [
    { id: 'R6.1', when: 'Note like "(NXT 3 B)", "(NXT B)" or "(B NXT)", and it is not HT1 and not a scored review', then: 'Goes straight to that level and chapter. Extra steps joined with "then" stay as a chain "(NXT … then …)". The RVW prefix is kept.', status: 'confirmed', differs: true, example: ex('E JrBg D (NXT B)', PRESENT, 'E JrBg B') },
    { id: 'R6.2', when: 'Review line (RVW) with a score or PASS, several chapters', then: 'Next week is the first chapter at the review level. A chain "(NXT …)" lists the remaining chapters, then returns to the home level\'s next chapter (Z goes to A of the next level). The old test score is dropped.', status: 'confirmed', differs: true, example: ex('M RVW 7 A & B 20/31\nPT', PRESENT, 'M RVW 7 A (NXT 7 C)\nPT') },
    { id: 'R6.3', when: 'Review line with a score or PASS, one chapter', then: 'Next chapter (Z goes to A of the next level).', status: 'confirmed', example: ex('M RVW 3 C PASS\nPT', PRESENT, 'M 3 D\nPT') },
  ]},
  { cat: '7. Tests (all from the curriculum sheet)', blurb: 'Which weeks carry a test, and how a test is written.', items: [
    { id: 'R7.1', when: 'The new chapter has a test in the sheet for that subject, level and chapter', then: 'Written as "TEST & chapter". On a two-chapter holiday week both chapters are checked and the first test found is used.', status: 'confirmed', example: ex('E JrBg M', PRESENT, 'E JrBg MT & N') },
    { id: 'R7.2', when: 'A sheet row covers a range of chapters (a novel, for example "G-M")', then: 'Used only at the first chapter of the range.', status: 'confirmed', example: ex('E L1 H', PRESENT, 'E L1 I') },
    { id: 'R7.3', when: 'The test is a novel', then: 'Written as "chapter (Novel title)" and the novel email flag is raised if last week\'s cell did not already have it.', status: 'confirmed', example: ex('E L1 F', PRESENT, 'E L1 G (Novel Out of My Mind)') },
    { id: 'R7.4', when: 'The row is a "Teach cncpt" row', then: 'Chapter, then a second line "Note: …" with the sheet\'s text.', status: 'confirmed', example: ex('M 0a L', PRESENT, 'M 0a M\nNote: Teach cncpt : <, > , = in page 0a M 3.5') },
    { id: 'R7.5', when: 'Last week\'s cell has a score (like 20/31) or a test name for its level, and no PASS (not a novel or teach row)', then: 'Moves on and keeps the test with "CNTNU": "chapter & TEST score CNTNU".', status: 'confirmed', example: ex('E JrBg N MT 20/31', PRESENT, 'E JrBg O & MT 20/31 CNTNU') },
    { id: 'R7.6', when: 'PASS is present', then: 'The old test is dropped and the student moves on.', status: 'confirmed', example: ex('E JrBg N MT PASS', PRESENT, 'E JrBg O') },
    { id: 'R7.7', when: 'Last week\'s cell has a note "(MT1 NXT)"', then: 'That test, at the new level, is used as this week\'s test.', status: 'confirmed', example: ex('E JrBg G (MT NXT)', PRESENT, 'E JrBg MT & H') },
    { id: 'R7.8', when: 'HT1 week', then: 'Keeps last week\'s test.', status: 'default', example: ex('M 4 K HT1 MT1 20/31\nPT', PRESENT, 'M 4 K & MT1 20/31 CNTNU HT2\nPT') },
    { id: 'R7.9', when: 'No test this week, not a review, no chain, no CNTNU, and the chapter after next has an MT or FT test', then: 'Adds a warning note, for example "(MT1 NXT)".', status: 'confirmed', example: ex('E JrBg L', PRESENT, 'E JrBg M (MT NXT)') },
  ]},
  { cat: '8. Cyan flag (staff to check)', blurb: 'Cells the generator colours cyan so staff look at them.', items: [
    { id: 'R8.1', when: 'The new line has a test name after "&" that is not a chapter or a level (for example "& MT1 CNTNU")', then: 'The new cell is coloured cyan.', status: 'confirmed', example: { ...ex('M 0a H & MT1 CNTNU', PRESENT, 'M 0a I & MT1 CNTNU'), cyan: true } },
    { id: 'R8.2', when: 'The new line has a score, is a review, and has no "(NXT" chain', then: 'The new cell is coloured cyan.', status: 'confirmed', example: { ...ex('M RVW 5b I 20/31\nPT', PRESENT, 'M RVW J & 20/31 CNTNU\nPT'), cyan: true } },
  ]},
  { cat: '9. What it never does', blurb: 'Safety rules.', items: [
    { id: 'R9.1', when: 'Dry run', then: 'Never writes to the schedule sheet or the portal. It only generates and compares with what n8n wrote.', status: 'confirmed' },
    { id: 'R9.2', when: 'A line it cannot read (no chapter, unknown shape)', then: 'Copied unchanged, never guessed.', status: 'confirmed' },
    { id: 'R9.3', when: 'A level, test, test week, novel or holiday', then: 'Never hard-coded. Always read from the curriculum sheet.', status: 'confirmed' },
  ]},
];

const OPEN_QUESTIONS = [
  'Should a typed "Ob" be written back as "0b"? (default: yes)',
  'Should HT1 always hold the chapter for one week? (default: yes; 7 of 11 held in the history)',
  'Case 12 on the Scenarios tab: is skipping level 6b correct?',
  'What is the true intent of a plain "M 4 A & B" line with no test or holiday?',
  'Several more rows of the 20-row rules table in the requirements doc still need your answer.',
];

// What the "Propose a rule" form asks for (fixed format). Every field is plain text.
const PROPOSAL_FIELDS = [
  { key: 'title',    label: 'Short name', required: true,  max: 80,  help: 'A few words, e.g. "Absent on the week before spring break".' },
  { key: 'group',    label: 'Where it belongs', required: true, max: 60, help: 'One of the groups above, or "new group".' },
  { key: 'when',     label: 'WHEN (the condition)', required: true, max: 400, help: 'Plain words, one situation. e.g. "Student is absent and next week is a holiday".' },
  { key: 'then',     label: 'THEN (what to write)', required: true, max: 400, help: 'Exactly what should appear in the new cell.' },
  { key: 'cell',     label: 'Example: this week\'s cell', required: true, max: 300, help: 'Exactly as staff typed it, e.g. "E JrBg A". Use a new line for a second line.' },
  { key: 'attendance', label: 'Example: attendance', required: true, max: 20, help: 'present or absent.', options: ['present', 'absent'] },
  { key: 'date',     label: 'Example: new column date', required: true, max: 10, help: 'mm/dd/yyyy of the column being generated, e.g. 10/13/2026.' },
  { key: 'expected', label: 'Example: what next week should say', required: true, max: 300, help: 'The correct result. Claude turns this into an automatic test.' },
  { key: 'why',      label: 'Why (optional)', required: false, max: 400, help: 'Anything that helps explain the rule.' },
  { key: 'by',       label: 'Your name', required: true, max: 40, help: 'So Claude knows who to ask.' },
];

function curriculumSummary(cur) {
  const tests = {};
  for (const t of cur.tests) (tests[`${t.Subject === 'M' ? 'Maths' : 'English'} ${t.Level}`] ||= []).push({ exam: t.Exam, week: t.Chapter });
  return { levels: { Maths: cur.levels.M, English: cur.levels.E }, tests, holidays: cur.holidays };
}

/** Checks one proposal body against PROPOSAL_FIELDS. Returns { ok, errors, clean }. */
function validateProposal(body) {
  const errors = [], clean = {};
  for (const f of PROPOSAL_FIELDS) {
    const v = typeof body?.[f.key] === 'string' ? body[f.key].replace(/\r/g, '').trim() : '';
    if (f.required && !v) errors.push(`${f.label} is required`);
    if (v.length > f.max) errors.push(`${f.label} is too long (max ${f.max})`);
    if (f.options && v && !f.options.includes(v)) errors.push(`${f.label} must be ${f.options.join(' or ')}`);
    clean[f.key] = v;
  }
  // optional: the proposal is a change to an existing rule
  const rid = typeof body?.ruleId === 'string' ? body.ruleId.trim() : '';
  if (rid) { if (!/^R\d+\.\d+$/.test(rid)) errors.push('ruleId looks wrong'); else clean.ruleId = rid; }
  if (clean.date && !/^\d{2}\/\d{2}\/\d{4}$/.test(clean.date)) errors.push('Example date must look like 10/13/2026');
  return { ok: !errors.length, errors, clean };
}

module.exports = { RULES, OPEN_QUESTIONS, PROPOSAL_FIELDS, curriculumSummary, validateProposal };
