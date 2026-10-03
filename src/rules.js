'use strict';
// The rule book shown on the dashboard's Rules page: every condition the generator uses, in the order it checks them.
// Written from the engine code (src/engine.js). Tests, test weeks, novels, level order and holidays are NOT listed here:
// the page reads them from the curriculum sheet.
// status: 'confirmed' settled by the Liberty Hill back test | 'default' applied, Sai has not decided | 'open' needs Sai's answer
// differs: intentionally behaves differently from the n8n Core Logic running today

const RULES = [
  { cat: '1. Which cells it reads', items: [
    { when: 'A schedule run starts', then: 'It reads the newest dated column as "this week". The new column is that date plus 7 days.', status: 'confirmed' },
    { when: 'Cell colour is yellow or light yellow', then: 'Student is absent.', status: 'confirmed' },
    { when: 'Cell colour is pink, orange, white or cyan', then: 'Student is present. (Pink cells usually carry "PT Yes".)', status: 'confirmed' },
    { when: 'A cell has several lines', then: 'Each line (Maths, English, PT) is handled on its own. Blank lines are ignored.', status: 'confirmed' },
  ]},
  { cat: '2. Cleaning each line', items: [
    { when: 'Line starts with PT', then: 'Written as just "PT". Yes / No / MKP / dates staff added are cleared.', status: 'confirmed' },
    { when: 'Line says ALL DONE, ABSENT, or "collected book" (including common misspellings)', then: 'The line is not carried to next week.', status: 'confirmed' },
    { when: 'Line starts with **', then: 'The ** is ignored.', status: 'confirmed' },
    { when: 'No space before a bracket, for example "E(MT1 NXT)"', then: 'A space is added.', status: 'confirmed' },
    { when: 'Level typed with the letter O instead of zero ("Ob" for "0b")', then: 'Matched to the real level in the curriculum sheet and written with the zero.', status: 'default', differs: true },
    { when: 'Line starts with M', then: 'Maths. Anything else is English.', status: 'confirmed' },
    { when: 'Reading the level', then: 'The first word that is a level in the curriculum sheet for that subject. If none matches, the second word.', status: 'confirmed' },
    { when: 'The word CNTNU appears in the line', then: 'It is ignored while reading the line (it is added back when needed).', status: 'confirmed' },
  ]},
  { cat: '3. Attendance', items: [
    { when: 'MKP (makeup) appears anywhere in the cell', then: 'Student counts as present and book collected, even on a yellow cell.', status: 'confirmed' },
    { when: '"Collected book" appears anywhere in the cell', then: 'Book counts as collected, so an absent student still moves on.', status: 'confirmed', differs: true },
    { when: 'Absent, no collected book, and the class date is not a holiday', then: 'The line is copied unchanged.', status: 'confirmed' },
    { when: 'Same, but next week\'s class date is a holiday, the line has exactly one chapter and no brackets', then: 'Written as "this chapter & next chapter".', status: 'confirmed', differs: true },
    { when: 'Present, or book collected, or the class date is a holiday', then: 'The student moves on (rules 4 to 6).', status: 'confirmed' },
  ]},
  { cat: '4. Moving to the next chapter', items: [
    { when: 'The chapter is the last single capital letter outside brackets', then: 'That is the chapter the student is on. If there is none, the line is copied unchanged for staff to fix.', status: 'confirmed' },
    { when: 'Normal line', then: 'Next letter of the alphabet.', status: 'confirmed' },
    { when: 'Chapter is Z', then: 'Chapter A of the next level, in the order of the curriculum sheet.', status: 'confirmed' },
    { when: 'On the last level in the sheet, chapter Z, and PASS', then: 'Written as "ALL DONE".', status: 'confirmed' },
    { when: 'Final test (FT) with PASS, and not a review', then: 'Counts as chapter Z, whatever letter was written, so the student goes to the next level.', status: 'confirmed', differs: true },
    { when: 'Line contains HT1', then: 'The chapter stays for one week and HT2 is added ("(HT2)" if it was written "(HT1)").', status: 'default', differs: true },
    { when: 'Two or more chapters, and the class date is a holiday or the line says TO HOME', then: 'Keeps the last chapter at the same level.', status: 'confirmed', differs: true },
    { when: 'Next week\'s class date is a holiday (and not a review)', then: 'Two chapters: "next & the one after", moving to the next level if it crosses Z.', status: 'confirmed' },
  ]},
  { cat: '5. Holidays', items: [
    { when: 'Holiday dates', then: 'Read from the Holidays tab of the curriculum sheet. Dates are compared as the class date and the class date plus 7 days.', status: 'confirmed' },
    { when: 'Class date is a holiday', then: 'Everyone moves on, even yellow (absent) cells, because no class was missed.', status: 'confirmed' },
    { when: 'Class date plus 7 days is a holiday', then: 'Present students get two chapters; absent single-chapter lines get "this & next" (rule 3).', status: 'confirmed' },
  ]},
  { cat: '6. Jump notes and reviews', items: [
    { when: 'Note like "(NXT 3 B)", "(NXT B)" or "(B NXT)", and it is not HT1 and not a scored review', then: 'Goes straight to that level and chapter. Extra steps joined with "then" stay as a chain "(NXT … then …)". The RVW prefix is kept.', status: 'confirmed', differs: true },
    { when: 'Review line (RVW) with a score or PASS, several chapters', then: 'Next week is the first chapter at the review level. A chain "(NXT …)" lists the remaining chapters, then returns to the home level\'s next chapter (Z goes to A of the next level). The old test score is dropped.', status: 'confirmed', differs: true },
    { when: 'Review line with a score or PASS, one chapter', then: 'Next chapter (Z goes to A of the next level).', status: 'confirmed' },
  ]},
  { cat: '7. Tests (all from the curriculum sheet)', items: [
    { when: 'The new chapter has a test in the sheet for that subject, level and chapter', then: 'Written as "TEST & chapter". On a two-chapter holiday week both chapters are checked and the first test found is used.', status: 'confirmed' },
    { when: 'A sheet row covers a range of chapters (a novel, for example "G-M")', then: 'Used only at the first chapter of the range.', status: 'confirmed' },
    { when: 'The test is a novel', then: 'Written as "chapter (Novel title)" and the novel email flag is raised if last week\'s cell did not already have it.', status: 'confirmed' },
    { when: 'The row is a "Teach cncpt" row', then: 'Chapter, then a second line "Note: …" with the sheet\'s text.', status: 'confirmed' },
    { when: 'Last week\'s cell has a score (like 20/31) or a test name for its level, and no PASS (not a novel or teach row)', then: 'Moves on and keeps the test with "CNTNU": "chapter & TEST score CNTNU".', status: 'confirmed' },
    { when: 'PASS is present', then: 'The old test is dropped and the student moves on.', status: 'confirmed' },
    { when: 'Last week\'s cell has a note "(MT1 NXT)"', then: 'That test, at the new level, is used as this week\'s test.', status: 'confirmed' },
    { when: 'HT1 week', then: 'Keeps last week\'s test.', status: 'default' },
    { when: 'No test this week, not a review, no chain, no CNTNU, and the chapter after next has an MT or FT test', then: 'Adds a warning note, for example "(MT1 NXT)".', status: 'confirmed' },
  ]},
  { cat: '8. Cyan flag (staff to check)', items: [
    { when: 'The new line has a test name after "&" that is not a chapter or a level (for example "& MT1 CNTNU")', then: 'The new cell is coloured cyan.', status: 'confirmed' },
    { when: 'The new line has a score, is a review, and has no "(NXT" chain', then: 'The new cell is coloured cyan.', status: 'confirmed' },
  ]},
  { cat: '9. What it never does', items: [
    { when: 'Dry run', then: 'Never writes to the schedule sheet or the portal. It only generates and compares with what n8n wrote.', status: 'confirmed' },
    { when: 'A line it cannot read (no chapter, unknown shape)', then: 'Copied unchanged, never guessed.', status: 'confirmed' },
    { when: 'A level, test, test week, novel or holiday', then: 'Never hard-coded. Always read from the curriculum sheet.', status: 'confirmed' },
  ]},
];

const OPEN_QUESTIONS = [
  'Should a typed "Ob" be written back as "0b"? (default: yes)',
  'Should HT1 always hold the chapter for one week? (default: yes; 7 of 11 held in the history)',
  'Case 12 on the Scenarios tab: is skipping level 6b correct?',
  'What is the true intent of a plain "M 4 A & B" line with no test or holiday?',
  'Several more rows of the 20-row rules table in the requirements doc still need your answer.',
];

function curriculumSummary(cur) {
  const tests = {};
  for (const t of cur.tests) (tests[`${t.Subject === 'M' ? 'Maths' : 'English'} ${t.Level}`] ||= []).push({ exam: t.Exam, week: t.Chapter });
  return { levels: { Maths: cur.levels.M, English: cur.levels.E }, tests, holidays: cur.holidays };
}

module.exports = { RULES, OPEN_QUESTIONS, curriculumSummary };
