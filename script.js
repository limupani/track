/* ==========================================================================
   GPA CALCULATOR
   Mirrors the spreadsheet logic:
     att credit hrs   = prev att credit hrs + SUM(credit hrs where type = "new")
     adjusted grade    = expected grade - previous grade (0 unless retake)
     semester points   = SUM(adjusted grade * credit hrs)
     new cgpa          = (prev att credit hrs * prev cgpa + semester points) / att credit hrs
   Each semester's "prev credit hrs" / "prev cgpa" are the previous semester's
   results — only the very first semester reads from the "before tracking"
   fields.
   ========================================================================== */

const GRADE_SCALE = [
  { label: 'A',  value: 4.00 },
  { label: 'A-', value: 3.67 },
  { label: 'B+', value: 3.33 },
  { label: 'B',  value: 3.00 },
  { label: 'B-', value: 2.67 },
  { label: 'C+', value: 2.33 },
  { label: 'C',  value: 2.00 },
  { label: 'C-', value: 1.67 },
  { label: 'D+', value: 1.33 },
  { label: 'D',  value: 1.00 },
  { label: 'F',  value: 0.00 },
];

const TRASH_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;
const X_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

let idCounter = 0;
function nextId(prefix) { return `${prefix}-${++idCounter}`; }

function defaultCourse() {
  return { id: nextId('course'), type: 'new', course: '', creditHrs: 3, points: 4.00, prevPoints: 0 };
}

/* ---- seed state with the worked example from the spreadsheet, so the
   numbers can be checked against it on first load ---- */
let state = {
  startCredit: 96,
  startCGPA: 2.23,
  semesters: [
    {
      id: nextId('sem'),
      name: 'Semester 1',
      courses: [
        { id: nextId('course'), type: 'new',    course: 'AI',     creditHrs: 3, points: 1.67, prevPoints: 0 },
        { id: nextId('course'), type: 'new',    course: 'PDC',    creditHrs: 3, points: 0.00, prevPoints: 0 },
        { id: nextId('course'), type: 'new',    course: 'SE',     creditHrs: 3, points: 3.00, prevPoints: 0 },
        { id: nextId('course'), type: 'new',    course: 'ENT',    creditHrs: 3, points: 2.67, prevPoints: 0 },
        { id: nextId('course'), type: 'new',    course: 'AI Lab', creditHrs: 1, points: 3.67, prevPoints: 0 },
        { id: nextId('course'), type: 'retake', course: 'CN Lab', creditHrs: 1, points: 2.33, prevPoints: 0.00 },
      ],
    },
    {
      id: nextId('sem'),
      name: 'Semester 2',
      courses: [
        { id: nextId('course'), type: 'retake', course: 'PDC', creditHrs: 3, points: 4.00, prevPoints: 0.00 },
      ],
    },
  ],
};

/* ============================== rendering ============================== */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatNum(n) {
  return Number(n.toFixed(2)).toString();
}

function gradeOptionsHtml(selected) {
  return GRADE_SCALE.map(g => {
    const isSelected = Math.abs(g.value - selected) < 0.001;
    return `<option value="${g.value}" ${isSelected ? 'selected' : ''}>${g.label}  ${g.value.toFixed(2)}</option>`;
  }).join('');
}

function courseRowHtml(semId, c) {
  const isRetake = c.type === 'retake';
  return `
    <div class="course-row" data-role="course-row">
      <select class="type-select ${isRetake ? 'is-retake' : 'is-new'}" data-role="type" data-sem="${semId}" data-course="${c.id}">
        <option value="new" ${!isRetake ? 'selected' : ''}>new</option>
        <option value="retake" ${isRetake ? 'selected' : ''}>retake</option>
      </select>
      <input type="text" class="course-name" placeholder="Course name" value="${escapeHtml(c.course)}" data-role="course-name" data-sem="${semId}" data-course="${c.id}">
      <input type="number" class="credit-input" min="0" step="0.5" value="${c.creditHrs}" data-role="credit" data-sem="${semId}" data-course="${c.id}">
      <select class="grade-select" data-role="points" data-sem="${semId}" data-course="${c.id}">
        ${gradeOptionsHtml(c.points)}
      </select>
      <select class="grade-select prev-grade" data-role="prevPoints" data-sem="${semId}" data-course="${c.id}" ${isRetake ? '' : 'disabled'}>
        ${gradeOptionsHtml(c.prevPoints)}
      </select>
      <button class="icon-btn remove-course" data-role="remove-course" data-sem="${semId}" data-course="${c.id}" title="Remove course" aria-label="Remove course">${X_ICON}</button>
    </div>`;
}

function renderSemesterCard(sem) {
  const card = document.createElement('article');
  card.className = 'semester-card';
  card.dataset.semId = sem.id;

  const rowsHtml = sem.courses.length
    ? sem.courses.map(c => courseRowHtml(sem.id, c)).join('')
    : `<p class="empty-row">No courses yet — add one below.</p>`;

  card.innerHTML = `
    <header class="semester-head">
      <input type="text" class="semester-name" value="${escapeHtml(sem.name)}" data-role="semester-name" data-sem="${sem.id}" aria-label="Semester name">
      <button class="icon-btn" data-role="delete-semester" data-sem="${sem.id}" title="Remove semester" aria-label="Remove semester">${TRASH_ICON}</button>
    </header>
    <div class="course-table">
      <div class="course-row course-row--head">
        <span>Type</span><span>Course</span><span>Credit hrs</span><span>Grade</span><span>Prev grade</span><span></span>
      </div>
      <div class="course-rows" data-role="course-rows" data-sem="${sem.id}">${rowsHtml}</div>
    </div>
    <button class="add-course-btn" data-role="add-course" data-sem="${sem.id}" type="button">+ Add course</button>
    <footer class="semester-foot">
      <div class="foot-line"><span>Entering CGPA</span><span class="mono" data-role="entering-cgpa">0.00</span></div>
      <div class="foot-line"><span>Credit hrs added</span><span class="mono" data-role="credit-added">0</span></div>
      <div class="foot-line"><span>Total credit hrs</span><span class="mono" data-role="total-credit">0</span></div>
      <div class="foot-line foot-line--highlight"><span>New CGPA</span><span class="mono" data-role="new-cgpa">0.00</span></div>
    </footer>
  `;
  return card;
}

function renderAddTile() {
  const tile = document.createElement('button');
  tile.className = 'add-semester-tile';
  tile.id = 'addSemesterTile';
  tile.type = 'button';
  tile.innerHTML = `<span class="add-icon">+</span><span>Add semester</span>`;
  return tile;
}

function renderGrid() {
  const grid = document.getElementById('semestersGrid');
  grid.innerHTML = '';
  state.semesters.forEach(sem => grid.appendChild(renderSemesterCard(sem)));
  grid.appendChild(renderAddTile());
}

function rerenderCard(semId) {
  const sem = state.semesters.find(s => s.id === semId);
  const old = document.querySelector(`.semester-card[data-sem-id="${semId}"]`);
  if (sem && old) old.replaceWith(renderSemesterCard(sem));
}

/* ============================== calculation ============================== */

function updateComputed() {
  let prevCredit = Number(state.startCredit) || 0;
  let prevCGPA = Number(state.startCGPA) || 0;
  let totalCourses = 0;

  state.semesters.forEach(sem => {
    let newCreditAdded = 0;
    let pointsSum = 0;

    sem.courses.forEach(c => {
      const credit = Number(c.creditHrs) || 0;
      const points = Number(c.points) || 0;
      const prevPoints = c.type === 'retake' ? (Number(c.prevPoints) || 0) : 0;
      if (c.type === 'new') newCreditAdded += credit;
      pointsSum += (points - prevPoints) * credit;
      totalCourses += 1;
    });

    const attCreditHrs = prevCredit + newCreditAdded;
    const newCGPA = attCreditHrs > 0 ? ((prevCredit * prevCGPA) + pointsSum) / attCreditHrs : prevCGPA;

    const card = document.querySelector(`.semester-card[data-sem-id="${sem.id}"]`);
    if (card) {
      card.querySelector('[data-role="entering-cgpa"]').textContent = prevCGPA.toFixed(2);
      card.querySelector('[data-role="credit-added"]').textContent = formatNum(newCreditAdded);
      card.querySelector('[data-role="total-credit"]').textContent = formatNum(attCreditHrs);
      card.querySelector('[data-role="new-cgpa"]').textContent = newCGPA.toFixed(2);
    }

    prevCredit = attCreditHrs;
    prevCGPA = newCGPA;
  });

  document.getElementById('statCredits').textContent = formatNum(prevCredit);
  document.getElementById('statSemesters').textContent = state.semesters.length;
  document.getElementById('statCourses').textContent = totalCourses;
  document.getElementById('dialValue').textContent = prevCGPA.toFixed(2);

  const pct = Math.max(0, Math.min(1, prevCGPA / 4));
  const r = 82;
  const circumference = 2 * Math.PI * r;
  const dialFill = document.getElementById('dialFill');
  dialFill.style.strokeDasharray = `${circumference}`;
  dialFill.style.strokeDashoffset = `${circumference * (1 - pct)}`;
}

/* ============================== state mutations ============================== */

function addSemester() {
  state.semesters.push({
    id: nextId('sem'),
    name: `Semester ${state.semesters.length + 1}`,
    courses: [defaultCourse()],
  });
  renderGrid();
  updateComputed();
}

function removeSemester(semId) {
  state.semesters = state.semesters.filter(s => s.id !== semId);
  renderGrid();
  updateComputed();
}

function addCourse(semId) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return;
  sem.courses.push(defaultCourse());
  rerenderCard(semId);
  updateComputed();
}

function removeCourse(semId, courseId) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return;
  sem.courses = sem.courses.filter(c => c.id !== courseId);
  rerenderCard(semId);
  updateComputed();
}

function resetAll() {
  state = { startCredit: 0, startCGPA: 0, semesters: [] };
  document.getElementById('startCredit').value = 0;
  document.getElementById('startCGPA').value = 0;
  renderGrid();
  updateComputed();
  showToast('Cleared. Starting from a blank slate.');
}

/* ==========================================================================
   TIMETABLE
   The university's sheet lists every room, every time slot, every section
   in the building — one tab per weekday. A single student only cares about
   a handful of (course, section) pairs out of that whole grid, so the flow
   is: parse the full grid -> let the student pick which pairs are theirs ->
   show just those, day by day.
   ========================================================================== */

const TT_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TT_SECTION_RE = /^[A-Z]{2,5}-\d[A-Z0-9().,]*$/i;
const TT_RESERVED_RE = /^reserved\b/i;

let ttState = {
  sessions: [],          // every class parsed out of the workbook, across the week
  selected: new Set(),   // "<courseCode>||<section>" keys the student has picked as theirs
  pickerQuery: '',
  activeDay: null,
  isEditingPicker: false,
};

function ttPickerKey(courseCode, section) { return `${courseCode}||${section}`; }

function ttTimeToMinutes(token, pmHint) {
  const m = String(token).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (pmHint && h < 12) h += 12;
  if (h === 24) h = 12;
  return h * 60 + min;
}

function ttFormatClock(mins) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* Reads the time-range header row (e.g. "08:00-8:55" ... "1:00-01:55") and
   works out AM/PM for each slot — once a slot's hour is 12, every slot after
   it (even ones that count back down from 1) is PM. */
function ttParseSlotHeaders(headerRow) {
  const slots = [];
  let crossedNoon = false;
  for (let c = 1; c < headerRow.length; c++) {
    const raw = headerRow[c];
    if (!raw) continue;
    const m = String(raw).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    let pmHint = crossedNoon;
    if (parseInt(m[1].split(':')[0], 10) === 12) { pmHint = true; crossedNoon = true; }
    slots.push({ col: c, start: ttTimeToMinutes(m[1], pmHint), end: ttTimeToMinutes(m[2], pmHint) });
  }
  return slots;
}

function ttFindHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    let hits = 0;
    row.forEach(cell => { if (cell && /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(String(cell))) hits++; });
    if (hits >= 2) return r;
  }
  return -1;
}

/* A filled cell looks like "DAA BCS-5C\n Anaum Hamid" — course code, a
   section token that looks like "BCS-5C", then the instructor on its own
   line. Rows like "Reserved for FSM" or a Jumma break aren't real classes,
   so they're skipped. */
function ttCellToSession(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || TT_RESERVED_RE.test(text)) return null;
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  const instructor = lines.slice(1).join(' ').trim();
  const tokens = firstLine.split(/\s+/);
  let section = null, codeTokens = tokens;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (TT_SECTION_RE.test(tokens[i])) { section = tokens[i]; codeTokens = tokens.slice(0, i); break; }
  }
  if (!section) return null;
  const courseCode = codeTokens.join(' ').trim() || firstLine;
  return { courseCode, section, instructor: instructor || '—' };
}

function ttParseDaySheet(sheet, dayName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  const headerRowIdx = ttFindHeaderRow(rows);
  if (headerRowIdx === -1) return [];
  const slots = ttParseSlotHeaders(rows[headerRowIdx]);
  const slotByCol = new Map(slots.map(s => [s.col, s]));

  // Multi-slot blocks (labs that run 3 hours straight) are merged cells in
  // the sheet — expand each merge so the session's end time covers the
  // whole block instead of just its first slot.
  const merges = sheet['!merges'] || [];
  const mergeForCell = new Map();
  merges.forEach(m => {
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) mergeForCell.set(`${r},${c}`, m);
    }
  });

  const sessions = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const roomRaw = row[0];
    if (!roomRaw) continue;
    const label = String(roomRaw).trim();
    if (/^(classrooms?|labs?)$/i.test(label)) continue;
    const room = label.replace(/\s*\(\d+\)\s*$/, '').trim();

    const handledCols = new Set();
    for (let c = 1; c < row.length; c++) {
      if (handledCols.has(c)) continue;
      const startSlot = slotByCol.get(c);
      if (!startSlot) continue;
      const value = row[c];
      if (value == null || String(value).trim() === '') continue;

      let endCol = c;
      const merge = mergeForCell.get(`${r},${c}`);
      if (merge) {
        endCol = merge.e.c;
        for (let cc = merge.s.c; cc <= merge.e.c; cc++) handledCols.add(cc);
      }
      const endSlot = slotByCol.get(endCol) || startSlot;
      const parsed = ttCellToSession(value);
      if (!parsed) continue;

      sessions.push({
        day: dayName,
        room,
        courseCode: parsed.courseCode,
        section: parsed.section,
        instructor: parsed.instructor,
        startMin: startSlot.start,
        endMin: endSlot.end,
        isLab: /\blab\b/i.test(parsed.courseCode) || /\blab\b/i.test(room),
      });
    }
  }
  return sessions;
}

function ttParseWorkbook(workbook) {
  const sessions = [];
  workbook.SheetNames.forEach(sheetName => {
    const norm = sheetName.trim().toLowerCase();
    const match = TT_DAY_ORDER.find(d => norm.startsWith(d.toLowerCase()));
    if (!match) return; // skip non-day tabs like "Reserved Days" or campus notes
    sessions.push(...ttParseDaySheet(workbook.Sheets[sheetName], match));
  });
  return sessions;
}

function handleTimetableFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let sessions;
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      sessions = ttParseWorkbook(wb);
    } catch (err) {
      showToast("Couldn't read that file — is it the .xlsx export?");
      return;
    }
    if (!sessions.length) {
      showToast("Couldn't find a Monday–Friday time grid in that file.");
      return;
    }
    // Keep any picks that still exist in the freshly-imported sheet; drop the rest.
    const available = new Set(sessions.map(s => ttPickerKey(s.courseCode, s.section)));
    ttState.selected = new Set([...ttState.selected].filter(k => available.has(k)));
    ttState.sessions = sessions;
    if (!ttState.activeDay || !sessions.some(s => s.day === ttState.activeDay)) {
      ttState.activeDay = TT_DAY_ORDER.find(d => sessions.some(s => s.day === d)) || null;
    }
    renderPicker();
    renderDayTabs();
    renderClassGrid();
    updateTimetableVisibility();
    showToast(`Imported ${sessions.length} classes across the week.`);
  };
  reader.readAsArrayBuffer(file);
}

function ttGroupedRows() {
  const byKey = new Map();
  ttState.sessions.forEach(s => {
    const key = ttPickerKey(s.courseCode, s.section);
    if (!byKey.has(key)) {
      byKey.set(key, { courseCode: s.courseCode, section: s.section, instructors: new Set(), days: new Set() });
    }
    const entry = byKey.get(key);
    entry.instructors.add(s.instructor);
    entry.days.add(s.day);
  });
  return [...byKey.values()].sort((a, b) =>
    a.courseCode.localeCompare(b.courseCode) || a.section.localeCompare(b.section));
}

function renderPicker() {
  const list = document.getElementById('ttPickerList');
  const q = ttState.pickerQuery.trim().toLowerCase();
  const rows = ttGroupedRows().filter(r => {
    if (!q) return true;
    const haystack = `${r.courseCode} ${r.section} ${[...r.instructors].join(' ')}`.toLowerCase();
    return haystack.includes(q);
  });

  if (!rows.length) {
    list.innerHTML = `<p class="tt-picker-empty">No matches. Try a different course, section, or instructor.</p>`;
  } else {
    let lastCode = null;
    list.innerHTML = rows.map(r => {
      const key = ttPickerKey(r.courseCode, r.section);
      const checked = ttState.selected.has(key) ? 'checked' : '';
      const groupLabel = r.courseCode !== lastCode ? `<div class="tt-picker-group-label">${escapeHtml(r.courseCode)}</div>` : '';
      lastCode = r.courseCode;
      const dayCount = r.days.size;
      return `${groupLabel}<label class="tt-picker-row">
          <input type="checkbox" data-role="picker-check" data-key="${escapeHtml(key)}" ${checked}>
          <span class="tt-picker-row-text">
            <span class="tt-picker-row-title"><b>${escapeHtml(r.courseCode)}</b> · ${escapeHtml(r.section)}</span>
            <span class="tt-picker-row-meta">${escapeHtml([...r.instructors].join(', '))} · ${dayCount} day${dayCount > 1 ? 's' : ''}/week</span>
          </span>
        </label>`;
    }).join('');
  }

  document.getElementById('ttPickerCount').textContent = `${ttState.selected.size} selected`;
}

function renderDayTabs() {
  const wrap = document.getElementById('dayTabs');
  const days = TT_DAY_ORDER.filter(d => ttState.sessions.some(s => s.day === d));
  wrap.innerHTML = days.map(d => `
    <button class="day-tab ${d === ttState.activeDay ? 'is-active' : ''}" type="button" data-role="day-tab" data-day="${d}">${d.slice(0, 3)}</button>
  `).join('');
}

function renderClassGrid() {
  const grid = document.getElementById('classGrid');
  if (!grid) return;
  const now = new Date();
  const todayName = TT_DAY_ORDER[(now.getDay() + 6) % 7]; // Date#getDay is Sun-first; TT_DAY_ORDER is Mon-first
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todays = ttState.sessions
    .filter(s => s.day === ttState.activeDay && ttState.selected.has(ttPickerKey(s.courseCode, s.section)))
    .sort((a, b) => a.startMin - b.startMin);

  if (!todays.length) {
    grid.innerHTML = `<p class="class-grid-empty">Nothing on your schedule for ${ttState.activeDay || 'this day'}.</p>`;
    return;
  }

  grid.innerHTML = todays.map(s => {
    const isNow = ttState.activeDay === todayName && nowMin >= s.startMin && nowMin < s.endMin;
    const codeLabel = s.courseCode.replace(/\s*lab$/i, '');
    return `
      <article class="class-card ${isNow ? 'is-now' : ''}">
        ${isNow ? '<span class="now-badge">Now</span>' : ''}
        <div class="class-card-head">
          <span class="class-room">${escapeHtml(s.room)}</span>
          <span class="class-code">${escapeHtml(codeLabel)}${s.isLab ? '<span class="lab-tag">Lab</span>' : ''}</span>
        </div>
        <span class="class-section">${escapeHtml(s.section)}</span>
        <span class="class-time">${ttFormatClock(s.startMin)} – ${ttFormatClock(s.endMin)}</span>
        <span class="class-instructor">${escapeHtml(s.instructor)}</span>
      </article>`;
  }).join('');
}

function setActiveDay(day) {
  ttState.activeDay = day;
  renderDayTabs();
  renderClassGrid();
}

function updateTimetableVisibility() {
  const hasData = ttState.sessions.length > 0;
  const hasPicks = ttState.selected.size > 0;
  const showPicker = hasData && (ttState.isEditingPicker || !hasPicks);
  const showSchedule = hasData && hasPicks && !ttState.isEditingPicker;
  document.getElementById('ttEmpty').hidden = hasData;
  document.getElementById('ttPicker').hidden = !showPicker;
  document.getElementById('ttSchedule').hidden = !showSchedule;
  document.getElementById('clearTimetableBtn').hidden = !hasData;
}

function clearTimetable() {
  ttState = { sessions: [], selected: new Set(), pickerQuery: '', activeDay: null, isEditingPicker: false };
  const fileInput = document.getElementById('timetableFile');
  if (fileInput) fileInput.value = '';
  const searchInput = document.getElementById('ttPickerSearch');
  if (searchInput) searchInput.value = '';
  renderPicker();
  renderDayTabs();
  renderClassGrid();
  updateTimetableVisibility();
  showToast('Timetable cleared.');
}

function switchPage(pageKey) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== pageKey; });
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.toggle('is-active', n.dataset.page === pageKey); });
}

/* ============================== events ============================== */

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function findCourse(semId, courseId) {
  const sem = state.semesters.find(s => s.id === semId);
  if (!sem) return null;
  return sem.courses.find(c => c.id === courseId) || null;
}

function handleFieldChange(e) {
  const t = e.target;
  const role = t.dataset.role;
  if (!role) return;

  if (role === 'semester-name') {
    const sem = state.semesters.find(s => s.id === t.dataset.sem);
    if (sem) sem.name = t.value;
    return;
  }

  if (role === 'course-name') {
    const c = findCourse(t.dataset.sem, t.dataset.course);
    if (c) c.course = t.value;
    return;
  }

  if (role === 'credit') {
    const c = findCourse(t.dataset.sem, t.dataset.course);
    if (c) { c.creditHrs = parseFloat(t.value) || 0; updateComputed(); }
    return;
  }

  if (role === 'points') {
    const c = findCourse(t.dataset.sem, t.dataset.course);
    if (c) { c.points = parseFloat(t.value); updateComputed(); }
    return;
  }

  if (role === 'prevPoints') {
    const c = findCourse(t.dataset.sem, t.dataset.course);
    if (c) { c.prevPoints = parseFloat(t.value); updateComputed(); }
    return;
  }

  if (role === 'type') {
    const c = findCourse(t.dataset.sem, t.dataset.course);
    if (!c) return;
    c.type = t.value;
    const row = t.closest('.course-row');
    const prevSelect = row.querySelector('[data-role="prevPoints"]');
    t.classList.remove('is-new', 'is-retake');
    if (c.type === 'retake') {
      prevSelect.disabled = false;
      t.classList.add('is-retake');
    } else {
      c.prevPoints = 0;
      prevSelect.value = '0';
      prevSelect.disabled = true;
      t.classList.add('is-new');
    }
    updateComputed();
    return;
  }

  if (role === 'picker-search') {
    ttState.pickerQuery = t.value;
    renderPicker();
    return;
  }

  if (role === 'picker-check') {
    const key = t.dataset.key;
    if (t.checked) ttState.selected.add(key); else ttState.selected.delete(key);
    document.getElementById('ttPickerCount').textContent = `${ttState.selected.size} selected`;
    return;
  }
}

function handleClick(e) {
  const roleEl = e.target.closest('[data-role]');
  if (roleEl) {
    const role = roleEl.dataset.role;
    if (role === 'add-course') return addCourse(roleEl.dataset.sem);
    if (role === 'remove-course') return removeCourse(roleEl.dataset.sem, roleEl.dataset.course);
    if (role === 'delete-semester') return removeSemester(roleEl.dataset.sem);
    if (role === 'import-timetable') {
      document.getElementById('timetableFile').click();
      return;
    }
    if (role === 'clear-timetable') return clearTimetable();
    if (role === 'picker-done') {
      ttState.isEditingPicker = false;
      renderDayTabs();
      renderClassGrid();
      updateTimetableVisibility();
      return;
    }
    if (role === 'edit-classes') {
      ttState.isEditingPicker = true;
      renderPicker();
      updateTimetableVisibility();
      return;
    }
    if (role === 'day-tab') {
      setActiveDay(roleEl.dataset.day);
      return;
    }
  }

  if (e.target.closest('#addSemesterTile')) return addSemester();

  const navItem = e.target.closest('.nav-item');
  if (navItem) {
    e.preventDefault();
    const pageKey = navItem.dataset.page;
    if (pageKey === 'gpa' || pageKey === 'timetable') {
      switchPage(pageKey);
    } else {
      showToast(`"${navItem.textContent.trim()}" isn't built yet.`);
    }
  }
}

function init() {
  document.getElementById('startCredit').addEventListener('input', (e) => {
    state.startCredit = parseFloat(e.target.value) || 0;
    updateComputed();
  });
  document.getElementById('startCGPA').addEventListener('input', (e) => {
    state.startCGPA = parseFloat(e.target.value) || 0;
    updateComputed();
  });
  document.getElementById('resetBtn').addEventListener('click', resetAll);

  const timetableFile = document.getElementById('timetableFile');
  if (timetableFile) {
    timetableFile.addEventListener('change', (e) => handleTimetableFile(e.target.files && e.target.files[0]));
  }

  document.addEventListener('input', handleFieldChange);
  document.addEventListener('change', handleFieldChange);
  document.addEventListener('click', handleClick);

  renderGrid();
  renderPicker();
  renderDayTabs();
  renderClassGrid();
  updateTimetableVisibility();
  updateComputed();
}

document.addEventListener('DOMContentLoaded', init);
