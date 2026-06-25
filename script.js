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
}

function handleClick(e) {
  const roleEl = e.target.closest('[data-role]');
  if (roleEl) {
    const role = roleEl.dataset.role;
    if (role === 'add-course') return addCourse(roleEl.dataset.sem);
    if (role === 'remove-course') return removeCourse(roleEl.dataset.sem, roleEl.dataset.course);
    if (role === 'delete-semester') return removeSemester(roleEl.dataset.sem);
  }

  if (e.target.closest('#addSemesterTile')) return addSemester();

  const navItem = e.target.closest('.nav-item');
  if (navItem) {
    e.preventDefault();
    if (!navItem.classList.contains('is-active')) {
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

  document.addEventListener('input', handleFieldChange);
  document.addEventListener('change', handleFieldChange);
  document.addEventListener('click', handleClick);

  renderGrid();
  updateComputed();
}

document.addEventListener('DOMContentLoaded', init);
