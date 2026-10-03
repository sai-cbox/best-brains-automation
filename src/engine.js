'use strict';
/**
 * Weekly schedule rules engine ("Generate next week").
 * Rebuilt from n8n Core Logic V37 with the back-test corrections applied.
 * Pure function: no sheet, network or clock access. The curriculum (levels, level order, tests,
 * test weeks, novels, holidays) is passed in from the curriculum sheet.
 *
 * Defaults applied where Sai gave no preference (flagged in the design doc):
 *   - typed "Ob" is written back as "0b"
 *   - HT1 holds one week (chapter stays, " HT2" follows)
 */
function createEngine(CUR) {
const testData = CUR.tests;
const holidays = CUR.holidays;
const CHAPTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const STATUS_NOTES = ["CNTNU", "RVW", "THEN", "NXT", "U", "MKP", "HT1", "HT2"]; // note syntax used by staff, not curriculum

// --- Helpers ---
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[0] - 1, parts[1]);
}

function formatDate(dateObj) {
    if (!dateObj) return "";
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

function getNextChapter(ch) {
    if (!ch) return null;
    const idx = CHAPTERS.indexOf(String(ch).toUpperCase());
    if (idx === -1) return ch;
    return CHAPTERS[(idx + 1) % CHAPTERS.length];
}

function getLevelsArray(subject) {
    return CUR.levels[subject.toUpperCase().startsWith('M') ? 'M' : 'E'];
}

// Staff typos: letter O typed for zero ("Ob" for "0b"). Resolved against the sheet's own level list.
function resolveLevelToken(tok, levels) {
    const t = String(tok).trim();
    if (levels.includes(t)) return t;
    const alt = t.replace(/^[Oo]/, '0');
    return levels.find(l => l.toLowerCase() === alt.toLowerCase()) || null;
}

function getLevelAfter(currentLevel, subject) {
    const levels = getLevelsArray(subject);
    const idx = levels.indexOf(String(currentLevel).trim());
    if (idx === -1 || idx === levels.length - 1) return currentLevel;
    return levels[idx + 1];
}

// Subject-aware mapping
function getTestFromData(subject, level, chapter, testData) {
    if (!level || !chapter) return null;
    const searchCh = String(chapter).toUpperCase();
    const searchLv = String(level).trim();
    return testData.find(t => {
        if (t.Subject !== subject || String(t.Level).trim() !== searchLv) return false;
        const range = String(t.Chapter || '').toUpperCase().trim();
        if (range.includes("-")) {
            const parts = range.split("-");
            return searchCh >= parts[0].trim() && searchCh <= parts[1].trim();
        }
        return range === searchCh;
    });
}

function processLine(line, isPresent, bookCollected, testData, classDateStr, holidays) {
    let cleanLine = line.trim().replace(/(\S)\(/g,'$1 (').replace(/\s+/g,' ');
    { const w = cleanLine.split(' '); if (w.length > 1 && /^[ME]/i.test(w[0])) { const fixed = resolveLevelToken(w[1], getLevelsArray(w[0])); if (fixed && fixed !== w[1]) { w[1] = fixed; cleanLine = w.join(' '); } } }
    if (cleanLine.startsWith('**')) cleanLine = cleanLine.substring(2).trim();
    const upperLine = cleanLine.toUpperCase();
    
    // Safety exits - Reset PT line to a clean slate (Drops Yes/No/MKP)
    if (upperLine.startsWith('PT')) return "PT";
    if (!cleanLine || upperLine.includes("ALL DONE") || upperLine === "ABSENT" || /C(OLLECTED|LL?C?T?E?D)\s*BOOK/i.test(upperLine)) return null;

    const words = cleanLine.split(/\s+/).map(w => w.replace(/CNTNU/gi, ''));
    const subject = words[0].toUpperCase().startsWith('M') ? 'M' : 'E';
    const levelsArr = getLevelsArray(subject);
    let homeLevel = words.find(w => levelsArr.includes(String(w).trim())) || words[1];
    
    let rest = words.slice(words.indexOf(homeLevel) + 1).join(" ").trim();
    const hasPass = /PASS/i.test(rest);
    const isRvw = upperLine.includes("RVW");
    const hasHT1 = /\bHT1\b/.test(upperLine); const bareHT = hasHT1 && !upperLine.includes("(HT1)");
    const outsideParens = rest.replace(/\([^)]+\)/g, '');
    const chaptersInRest = [...outsideParens.matchAll(/\b([A-Z])\b/g)].map(m => m[1]);
    let progressChapter = chaptersInRest.length > 0 ? chaptersInRest[chaptersInRest.length - 1] : null;

    // --- HOLIDAY LOGIC (STRICT MATCH) ---
    const currentDateObj = parseDate(classDateStr);
    const todayStr = formatDate(currentDateObj);
    const nextWeekDateObj = currentDateObj ? new Date(currentDateObj.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    const nextWeekStr = formatDate(nextWeekDateObj);
    
    const isTodayHoliday = holidays.includes(todayStr);
    const isNextHoliday = holidays.includes(nextWeekStr); 

    let nextWeekChapter = "";
    let nextWeekLevel = homeLevel;
    let nxtChainText = ""; let dropTest = false;
    if (/\bFT\b[^\n]*\bPASS\b/i.test(rest) && !isRvw && progressChapter) progressChapter = 'Z';
    const scored = /\d+\/\d+/.test(rest) || hasPass;
    if (!(isRvw && scored) && !hasHT1 && (isPresent || bookCollected || isTodayHoliday)) {
      let items = null; const m1 = rest.match(/\(NXT\s+([^)]*)\)/i), m2 = rest.match(/\(([A-Z])\s+NXT\)/);
      if (m1) items = m1[1].split(/\s+then\s+/i).map(x=>x.trim()); else if (m2) items = [m2[1]];
      if (items) { const p = items[0].split(/\s+/); const lv = p.length >= 2 ? p[0] : homeLevel, ch = p[p.length-1];
        if (/^[A-Z]$/.test(ch) && (p.length < 2 || levelsArr.includes(lv))) { const restItems = items.slice(1);
          if (restItems.length) return `${subject} ${isRvw ? 'RVW ' : ''}${lv} ${ch} (NXT ${restItems.join(' then ')})`;
          return `${subject} ${lv} ${ch}`; } } }

    // --- PROGRESSION ---
    if (hasHT1) {
        nextWeekChapter = progressChapter;
    } 
    else if (isRvw && (rest.match(/\d+\/\d+/) || hasPass)) {
        let reviewLevel = homeLevel;
        const rvwIdx = words.findIndex(w => w.toUpperCase().includes("RVW"));
        if (rvwIdx !== -1 && words[rvwIdx + 1] && levelsArr.includes(words[rvwIdx + 1])) reviewLevel = words[rvwIdx + 1];

        if (chaptersInRest.length > 1) {
            nextWeekChapter = chaptersInRest[0]; dropTest = true;
            nextWeekLevel = reviewLevel;
            let retCh = (progressChapter === 'Z') ? 'A' : getNextChapter(progressChapter);
            let retLv = (progressChapter === 'Z') ? getLevelAfter(homeLevel, subject) : homeLevel;
            let chainItems = [...chaptersInRest.slice(1, -1).map(c => `${reviewLevel} ${c}`), `${retLv} ${retCh}`];
            nxtChainText = `(NXT ${chainItems.join(" then ")})`;
        } else {
            nextWeekLevel = (progressChapter === 'Z') ? getLevelAfter(homeLevel, subject) : homeLevel;
            nextWeekChapter = (progressChapter === 'Z') ? 'A' : getNextChapter(progressChapter);
        }
    }
    else {
        if (!isPresent && !bookCollected && !isTodayHoliday) { if (isNextHoliday && progressChapter && chaptersInRest.length === 1 && !/[()]/.test(rest)) return `${subject} ${homeLevel} ${progressChapter} & ${getNextChapter(progressChapter)}`; return cleanLine; }
        if (!progressChapter) return cleanLine;

        if (homeLevel === levelsArr[levelsArr.length - 1] && progressChapter === 'Z' && hasPass) return `${subject} ALL DONE`;

        if ((isTodayHoliday || /TO HOME/.test(upperLine)) && chaptersInRest.length > 1) {
            nextWeekChapter = progressChapter;
            nextWeekLevel = homeLevel;
        } else {
            nextWeekLevel = (progressChapter === 'Z') ? getLevelAfter(homeLevel, subject) : homeLevel;
            nextWeekChapter = (progressChapter === 'Z') ? 'A' : getNextChapter(progressChapter);

            if (isNextHoliday && !isRvw) {
                let holidayChapter = (nextWeekChapter === 'Z') ? 'A' : getNextChapter(nextWeekChapter);
                let holidayLevel = (nextWeekChapter === 'Z') ? getLevelAfter(nextWeekLevel, subject) : nextWeekLevel;
                nextWeekChapter = `${nextWeekChapter} & ${holidayChapter}`;
                nextWeekLevel = holidayLevel;
            }
        }
    }

    // --- TEST DETERMINATION & BULLETPROOF EXTRACTION ---
    let activeTestThisWeek = null;
    const chaptersToSearch = String(nextWeekChapter).split(" & ");
    for (let ch of chaptersToSearch) {
        let found = getTestFromData(subject, nextWeekLevel, ch, testData);
        if (found) {
            const testName = found.Exam.toUpperCase();
            if (testName.includes("NOVEL") && found.Chapter.includes("-")) {
                if (ch === found.Chapter.split("-")[0].trim()) activeTestThisWeek = found.Exam;
            } else { activeTestThisWeek = found.Exam; }
        }
        if (activeTestThisWeek) break;
    }

    let scoreMatch = rest.match(/\d+\/\d+/); if (dropTest) scoreMatch = null;
    const statusPattern = new RegExp("\\b(" + STATUS_NOTES.join("|") + ")\\b", "gi");
    const cleanActiveArea = outsideParens.replace(/&/g, '').replace(/PASS/i, '').replace(/\b[A-Z]\b/g, '').replace(/\d+\/\d+/g, '').replace(statusPattern, '').replace(/to home/i, '');
    
    // BULLETPROOF ZOMBIE FIX: Check leftover words strictly against the dictionary using homeLevel
    let activeTestLastWeek = null;
    const leftoverWords = cleanActiveArea.trim().split(/\s+/);
    for (let w of leftoverWords) {
        if (w.length > 1 && !STATUS_NOTES.includes(w.toUpperCase()) && !levelsArr.includes(String(w).trim())) {
            let matchedTest = testData.find(t => t.Subject === subject && t.Level === homeLevel && t.Exam.toUpperCase().includes(w.toUpperCase()));
            if (matchedTest) {
                activeTestLastWeek = matchedTest.Exam; 
                break;
            }
        }
    }
    
    if (dropTest) activeTestLastWeek = null;
    const promotedTestMatch = rest.match(/\(([^)]+)\s+NXT(.*?)\)/i);
    let promotedTest = null;
    if (promotedTestMatch) {
        let matchedPromoted = testData.find(t => t.Subject === subject && t.Level === nextWeekLevel && t.Exam.toUpperCase().includes(promotedTestMatch[1].trim().toUpperCase()));
        promotedTest = matchedPromoted ? matchedPromoted.Exam : promotedTestMatch[1].trim();
    }

    if (hasHT1) activeTestThisWeek = activeTestLastWeek;
    else if (!hasPass) activeTestThisWeek = promotedTest || activeTestLastWeek || activeTestThisWeek;
    else activeTestThisWeek = promotedTest || activeTestThisWeek;

    const rPrefix = isRvw && nxtChainText ? `RVW ${nextWeekLevel}` : `${nextWeekLevel}`;
    const isNovel = activeTestThisWeek && activeTestThisWeek.toUpperCase().includes("NOVEL");
    const isTeachCncpt = activeTestThisWeek && activeTestThisWeek.toUpperCase().includes("TEACH CNCPT");
    let output = "";

    if ((activeTestLastWeek || scoreMatch) && !hasPass && !isNovel && !isTeachCncpt) {
        let ts = `${activeTestLastWeek || ""} ${scoreMatch ? scoreMatch[0] : ""}`.trim();
        output = `${subject} ${rPrefix} ${nextWeekChapter} & ${ts} CNTNU`;
    } else if (isNovel) {
        output = `${subject} ${rPrefix} ${nextWeekChapter} (${activeTestThisWeek})`;
    } else if (isTeachCncpt) {
        output = `${subject} ${rPrefix} ${nextWeekChapter}\nNote: ${activeTestThisWeek}`;
    } else {
        output = activeTestThisWeek ? `${subject} ${rPrefix} ${activeTestThisWeek} & ${nextWeekChapter}` : `${subject} ${rPrefix} ${nextWeekChapter}`;
    }

    if (hasHT1) output += bareHT ? " HT2" : " (HT2)";
    if (nxtChainText) output += ` ${nxtChainText}`;

    // --- LOOK AHEAD WARNING ---
    if (!activeTestThisWeek && !isRvw && !nxtChainText && !((activeTestLastWeek || scoreMatch) && !hasPass)) {
        let lastCh = chaptersToSearch[chaptersToSearch.length - 1];
        let ln = (lastCh === 'Z') ? 'A' : getNextChapter(lastCh);
        let lv = (lastCh === 'Z') ? getLevelAfter(nextWeekLevel, subject) : nextWeekLevel;
        let ft = getTestFromData(subject, lv, ln, testData);
        if (ft && (ft.Exam.toUpperCase().includes("MT") || ft.Exam.toUpperCase().includes("FT"))) {
            output += ` (${ft.Exam} NXT)`;
        }
    }

    return output.replace(/ +/g, ' ').trim();
}


function generate(students) {
  return students.map(student => {
    const lastLog = student.last_week_log || '';
    const isMakeup = lastLog.toUpperCase().includes("MKP");
    const effectivePresent = student.is_present || isMakeup;
    const effectiveCollected = student.book_collected || /C(OLLECTED|LL?C?T?E?D)\s*BOOK/i.test(lastLog) || isMakeup;
    const nextWeekLines = lastLog.split('\n').map(l =>
      processLine(l, effectivePresent, effectiveCollected, testData, student.new_header_date, holidays)
    ).filter(l => l !== null);
    const nextLog = nextWeekLines.join('\n');
    const needsColor = nextWeekLines.some(line => {
      const up = line.toUpperCase(), hasScore = /\d+\/\d+/.test(up);
      if (hasScore) return up.includes("RVW") && !up.includes("(NXT");
      if (!up.includes("&")) return false;
      const testArea = up.split("&")[1].split("CNTNU")[0].split("(")[0].trim();
      const known = [...CUR.levels.M, ...CUR.levels.E].map(l => l.toUpperCase());
      return testArea.length > 1 && !CHAPTERS.includes(testArea) && !known.includes(testArea);
    });
    return {
      student_name: student.student_name,
      next_week_log: nextLog.trim(),
      send_novel_mail: (nextLog.toUpperCase().includes("NOVEL") && !lastLog.toUpperCase().includes("NOVEL")),
      needs_color: needsColor
    };
  });
}

return { generate, processLine };
}

module.exports = { createEngine };
