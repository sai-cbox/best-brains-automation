'use strict';
// The rule book shown on the dashboard's Rules page. Descriptions are prose; every example is run through the
// real engine at request time, so the page shows what the code actually does with the current curriculum sheet.
// status: 'confirmed'  settled by the Liberty Hill back test
//         'default'    a default Sai has not decided yet (applied, easy to change)
//         'open'       needs Sai's answer
//         'new'        added from the Scenarios tabs / back test, not in n8n today
// differsFromN8n: the rebuilt rule intentionally behaves differently from the n8n Core Logic running today.

const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const prev = (c, n = 1) => L[Math.max(0, L.indexOf(c) - n)];
const mdy = d => { const [m, dd, y] = d.split('/').map(Number); return new Date(y, m - 1, dd); };
const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const shift = (s, days) => { const d = mdy(s); d.setDate(d.getDate() + days); return fmt(d); };

function build(cur) {
  const M = cur.levels.M, E = cur.levels.E;
  const lv = M.includes('2') ? '2' : M[2];
  const mt = cur.tests.find(t => t.Subject === 'M' && /^MT/i.test(t.Exam) && /^[A-Z]$/.test(t.Chapter) && t.Chapter > 'D');
  const ft = cur.tests.find(t => t.Subject === 'M' && /^FT/i.test(t.Exam) && t.Level === lv);
  const novel = cur.tests.find(t => t.Subject === 'E' && /novel/i.test(t.Exam) && t.Chapter.includes('-'));
  const teach = cur.tests.find(t => /teach/i.test(t.Exam) && /^[A-Z]$/.test(t.Chapter));
  const hol = cur.holidays[0];
  const day = '10/06/2026';
  const ex = (label, input, extra = {}) => ({ label, input, attendance: 'present', date: day, ...extra });
  const lastM = M[M.length - 1];

  return [
    // ---- reading last week's cell
    { id: 'pt-reset', cat: 'Reading last week\'s cell', title: 'A "PT" line is reset', status: 'confirmed', differsFromN8n: false,
      text: 'Any line starting with PT becomes just "PT" again. Yes / No / MKP / dates that staff added are cleared for the new week.',
      examples: [ex('PT line with notes', `M ${lv} E\nPT Yes`)] },
    { id: 'dropped-lines', cat: 'Reading last week\'s cell', title: 'Some lines are dropped', status: 'confirmed', differsFromN8n: false,
      text: 'Lines that say ALL DONE, ABSENT, or "collected book" (and common misspellings) are not copied to next week. A leading ** is ignored.',
      examples: [ex('ABSENT line', `M ${lv} E\nABSENT`), ex('** prefix', `** M ${lv} E`)] },
    { id: 'typo-o-for-0', cat: 'Reading last week\'s cell', title: 'Letter O typed for zero ("Ob" for "0b")', status: 'default', differsFromN8n: true,
      text: 'A level typed with the letter O instead of a zero is matched to the real level in the curriculum sheet and written back with the zero. Default applied; Sai has not decided.',
      examples: [ex('"Ob" typed for "0b"', 'M Ob E')] },
    { id: 'makeup', cat: 'Reading last week\'s cell', title: 'MKP (makeup) forces progress', status: 'confirmed', differsFromN8n: false,
      text: 'If MKP appears anywhere in the cell, the student counts as present and having collected the book, even on a yellow (absent) cell.',
      examples: [ex('Absent but MKP', `M ${lv} E MKP\nPT`, { attendance: 'absent' })] },

    // ---- attendance
    { id: 'absent-unchanged', cat: 'Attendance (cell colour)', title: 'Absent: the line stays the same', status: 'confirmed', differsFromN8n: false,
      text: 'A yellow (or light yellow) cell means absent. Absent with no collected book and not a holiday: the line is copied unchanged. Pink, orange, white and cyan all count as present.',
      examples: [ex('Absent (yellow)', `M ${lv} E\nPT`, { attendance: 'absent' })] },
    { id: 'collected-book', cat: 'Attendance (cell colour)', title: 'Absent but collected the book: moves on', status: 'confirmed', differsFromN8n: true,
      text: 'A "collected book" note (with the usual misspellings) counts as present, because the student did the work at home.',
      examples: [ex('Absent + collected book', `M ${lv} E\nCollected book`, { attendance: 'absent' })] },
    { id: 'absent-before-holiday', cat: 'Attendance (cell colour)', title: 'Absent before a holiday: two chapters', status: 'confirmed', differsFromN8n: true,
      text: 'An absent single-chapter line, when next week is a holiday, becomes "this chapter & next chapter" so nothing is lost.',
      examples: hol ? [ex('Next week is a holiday', `M ${lv} E`, { attendance: 'absent', date: shift(hol, -7) })] : [] },

    // ---- progression
    { id: 'next-chapter', cat: 'Progression', title: 'Next chapter', status: 'confirmed', differsFromN8n: false,
      text: 'The chapter letter moves to the next letter.', examples: [ex('Mid level', `M ${lv} B`), ex('English', 'E F1 B')] },
    { id: 'level-end', cat: 'Progression', title: 'End of a level: first chapter of the next level', status: 'confirmed', differsFromN8n: false,
      text: 'After chapter Z the student moves to chapter A of the next level. The order of levels comes from the curriculum sheet, not from the code.',
      examples: [ex('Z of a level', `M ${lv} Z`)] },
    { id: 'all-done', cat: 'Progression', title: 'Last level finished: ALL DONE', status: 'confirmed', differsFromN8n: false,
      text: 'Passing the final test of the last level in the sheet writes "ALL DONE".',
      examples: [ex('Last Maths level, final test passed', `M ${lastM} FT 45/50 PASS & Z`)] },
    { id: 'no-chapter', cat: 'Progression', title: 'No chapter found: copied as is', status: 'confirmed', differsFromN8n: false,
      text: 'If a line has no chapter letter, it is copied unchanged for staff to fix.', examples: [ex('Missing chapter', `M ${lv}`)] },

    // ---- tests (from the curriculum sheet)
    { id: 'test-week', cat: 'Tests (from the sheet)', title: 'Test week', status: 'confirmed', differsFromN8n: false,
      text: 'The tests, and the chapter each one falls on, come from the Maths and English tabs of the curriculum sheet. When next week\'s chapter has a test, the test is written in front: "TEST & chapter".',
      examples: mt ? [ex(`Chapter before ${mt.Exam} (level ${mt.Level})`, `M ${mt.Level} ${prev(mt.Chapter)}`)] : [] },
    { id: 'look-ahead', cat: 'Tests (from the sheet)', title: 'Look-ahead note', status: 'confirmed', differsFromN8n: false,
      text: 'If the test is the week after next, a note like "(MT1 NXT)" warns that it is coming.',
      examples: mt ? [ex('Two chapters before a test', `M ${mt.Level} ${prev(mt.Chapter, 2)}`)] : [] },
    { id: 'score-no-pass', cat: 'Tests (from the sheet)', title: 'Score without PASS: CNTNU', status: 'confirmed', differsFromN8n: false,
      text: 'A test with a score but no PASS stays attached with CNTNU (continue) while the student moves on.',
      examples: mt ? [ex('Failed test', `M ${mt.Level} ${mt.Exam} 20/31 & ${mt.Chapter}`)] : [] },
    { id: 'pass-moves-on', cat: 'Tests (from the sheet)', title: 'PASS: move on', status: 'confirmed', differsFromN8n: false,
      text: 'A passed test is dropped from the line and the student moves on.',
      examples: mt ? [ex('Passed test', `M ${mt.Level} ${mt.Exam} 31/31 PASS & ${mt.Chapter}`)] : [] },
    { id: 'ft-pass-z', cat: 'Tests (from the sheet)', title: 'Passed final test: go to the next level', status: 'confirmed', differsFromN8n: true,
      text: 'A passed final test (FT) counts as finishing the level, whatever chapter letter was written.',
      examples: ft ? [ex('Passed FT written at Y', `M ${lv} FT 45/50 PASS & Y`)] : [] },
    { id: 'novel', cat: 'Tests (from the sheet)', title: 'Novel', status: 'confirmed', differsFromN8n: false,
      text: 'A novel row in the English tab covers a chapter range. It is written once, at the first chapter of the range, as "(Novel name)", and flags the novel email.',
      examples: novel ? [ex(`Chapter before ${novel.Exam}`, `E ${novel.Level} ${prev(novel.Chapter.split('-')[0])}`)] : [] },
    { id: 'teach-concept', cat: 'Tests (from the sheet)', title: 'Teach concept note', status: 'confirmed', differsFromN8n: false,
      text: 'A "Teach cncpt" row in the sheet adds a Note line under the chapter.',
      examples: teach ? [ex('Chapter before a teach-concept row', `M ${teach.Level} ${prev(teach.Chapter)}`)] : [] },

    // ---- holidays and special cases
    { id: 'next-week-holiday', cat: 'Holidays and special cases', title: 'Next week is a holiday', status: 'confirmed', differsFromN8n: false,
      text: 'When the date a week later is in the Holidays tab, the student gets two chapters: "this & next".',
      examples: hol ? [ex(`Class the week before ${hol}`, `M ${lv} B`, { date: shift(hol, -7) })] : [] },
    { id: 'today-holiday', cat: 'Holidays and special cases', title: 'Class date is a holiday', status: 'confirmed', differsFromN8n: false,
      text: 'On a holiday date even an "absent" student moves on, because no class was missed.',
      examples: hol ? [ex(`Class on ${hol}`, `M ${lv} B`, { attendance: 'absent', date: hol })] : [] },
    { id: 'to-home', cat: 'Holidays and special cases', title: 'TO HOME keeps the last chapter', status: 'confirmed', differsFromN8n: true,
      text: 'A two-chapter line marked TO HOME (book sent home) keeps the second chapter instead of skipping ahead.',
      examples: [ex('Two chapters, to home', `M ${lv} C & D TO HOME`)] },
    { id: 'ht1', cat: 'Holidays and special cases', title: 'HT1: hold one week, then HT2', status: 'default', differsFromN8n: true,
      text: 'HT1 keeps the chapter for a week and adds HT2. In the Liberty Hill history 7 of 11 HT1 cells held; Sai has not decided whether it always holds.',
      examples: [ex('HT1', `M ${lv} E HT1`)] },
    { id: 'follow-nxt', cat: 'Holidays and special cases', title: 'Jump notes: "(NXT 3 B)"', status: 'confirmed', differsFromN8n: true,
      text: 'A note like "(NXT 3 B)" is a staff instruction to go to level 3 chapter B next. The rebuild follows it; n8n ignored it.',
      examples: [ex('Jump note', `M ${lv} E (NXT ${M[M.indexOf(lv) + 1]} B)`)] },

    // ---- flags
    { id: 'cyan', cat: 'Flags', title: 'Cyan flag for staff to check', status: 'confirmed', differsFromN8n: false,
      text: 'The new cell is coloured cyan when it carries a test name after "&" that staff must look at (a test that was started but has no score yet), or a review line with a score and no chain.',
      examples: mt ? [ex('Test written with no score yet', `M ${mt.Level} ${mt.Exam} & ${mt.Chapter}`)] : [] },
  ];
}

const OPEN_QUESTIONS = [
  'Should a typed "Ob" be written back as "0b"? (default: yes)',
  'Should HT1 always hold the chapter for one week? (default: yes; 7 of 11 held in the history)',
  'Case 12 on the Scenarios tab: is skipping level 6b correct?',
  'What is the true intent of a plain "M 4 A & B" line with no test or holiday?',
  'Several more rows of the 20-row rules table in the requirements doc still need your answer.',
];

function evaluate(engine, cur) {
  return build(cur).map(rule => ({
    ...rule,
    examples: rule.examples.map(e => {
      const [out] = engine.generate([{ student_name: 'x', last_week_log: e.input, is_present: e.attendance !== 'absent', book_collected: e.attendance !== 'absent', new_header_date: e.date }]);
      return { ...e, output: out.next_week_log, flagCyan: out.needs_color, novelMail: out.send_novel_mail };
    }),
  }));
}

function curriculumSummary(cur) {
  const tests = {};
  for (const t of cur.tests) (tests[`${t.Subject === 'M' ? 'Maths' : 'English'} ${t.Level}`] ||= []).push({ exam: t.Exam, week: t.Chapter });
  return { levels: { Maths: cur.levels.M, English: cur.levels.E }, tests, holidays: cur.holidays };
}

module.exports = { build, evaluate, curriculumSummary, OPEN_QUESTIONS };
