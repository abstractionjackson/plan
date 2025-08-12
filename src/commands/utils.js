// Shared utilities for command modules
const { validatePlan } = require("../../src/validator");

function normalizeTodos(plan) {
  const stamp = () => new Date().toISOString();
  const touchList = list => {
    if (!Array.isArray(list)) return;
    for (const t of list) {
      if (t && t.state && t.title && t.id != null && !t.createdAt)
        t.createdAt = stamp();
      if (t && Array.isArray(t.subtasks)) touchList(t.subtasks);
    }
  };
  if (Array.isArray(plan?.quarters))
    plan.quarters.forEach(
      q => q && Array.isArray(q.todos) && touchList(q.todos)
    );
  if (Array.isArray(plan?.weeks))
    plan.weeks.forEach(w => w && Array.isArray(w.todos) && touchList(w.todos));
  if (Array.isArray(plan?.days))
    plan.days.forEach(d => d && Array.isArray(d.todos) && touchList(d.todos));
}

function parseMaybeDate(val, label) {
  if (!val) return undefined;
  if (typeof val !== "string") return undefined;
  if (val.toLowerCase() === "now") return new Date().toISOString();
  const ms = Date.parse(val);
  if (isNaN(ms)) {
    console.error(`Invalid ${label} date-time: ${val}`);
    process.exit(1);
  }
  return new Date(ms).toISOString();
}

function nextYearStart() {
  const now = new Date();
  const nextYear = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  return nextYear.toISOString();
}

function startOfNextQuarter() {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3); // 0..3
  const nextQuarter = (currentQuarter + 1) % 4;
  const nextQuarterYear =
    currentQuarter === 3 ? now.getFullYear() + 1 : now.getFullYear();
  const nextQuarterMonth = nextQuarter * 3;
  return new Date(
    nextQuarterYear,
    nextQuarterMonth,
    1,
    0,
    0,
    0,
    0
  ).toISOString();
}

function startOfNextWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const daysUntilNextMonday = (8 - (day === 0 ? 7 : day)) % 7 || 7; // ensures at least 1 day
  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilNextMonday,
    0,
    0,
    0,
    0
  );
  return nextMonday.toISOString();
}

function startOfNextDay() {
  const base = new Date();
  const nextDay = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return nextDay.toISOString();
}

function generateNextId(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return 1;
  return (
    Math.max(...todos.map(t => (t && typeof t.id === "number" ? t.id : 0))) + 1
  );
}

module.exports = {
  normalizeTodos,
  parseMaybeDate,
  nextYearStart,
  startOfNextQuarter,
  startOfNextWeek,
  startOfNextDay,
  generateNextId,
  validatePlan,
};
