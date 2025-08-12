const { normalizeTodos, parseMaybeDate, validatePlan } = require("./utils");
const { savePlan } = require("../../src/store");

function printTodo(scopeLabel, number, year, todo) {
  const header =
    scopeLabel === "Quarter"
      ? `Q${number} ${year} todo #${todo.id}`
      : `${scopeLabel} ${number} ${year} todo #${todo.id}`;
  console.log(header);
  console.log(`Title: ${todo.title}`);
  console.log(`State: ${todo.state}`);
  if (todo.createdAt) console.log(`Created: ${todo.createdAt}`);
  if (todo.scheduled) console.log(`Scheduled: ${todo.scheduled}`);
  if (todo.deadline) console.log(`Deadline: ${todo.deadline}`);
  if (Array.isArray(todo.subtasks) && todo.subtasks.length) {
    console.log("Subtasks:");
    todo.subtasks.forEach(st => {
      if (!st) return;
      const mark = st.state === "DONE" ? "✔" : " ";
      console.log(`  [${st.id}] ${mark} ${st.title}`);
    });
  }
}

async function interactiveEditTodo({ plan, todo, planId }) {
  const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = q => new Promise(r => rl.question(q, a => r(a)));
  const newTitle = (await ask(`Title [${todo.title}]: `)).trim();
  const newState = (await ask(`State (TODO/DONE) [${todo.state}]: `))
    .trim()
    .toUpperCase();
  const newDeadline = (
    await ask(`Deadline ISO (blank keep) [${todo.deadline || ""}]: `)
  ).trim();
  const newScheduled = (
    await ask(`Scheduled ISO (blank keep) [${todo.scheduled || ""}]: `)
  ).trim();
  if (newTitle) todo.title = newTitle;
  if (["TODO", "DONE"].includes(newState)) todo.state = newState;
  if (newDeadline) {
    const parsed = parseMaybeDate(newDeadline, "deadline");
    if (parsed) todo.deadline = parsed;
  }
  if (newScheduled) {
    const parsedS = parseMaybeDate(newScheduled, "scheduled");
    if (parsedS) todo.scheduled = parsedS;
  }
  normalizeTodos(plan);
  const { valid, errors } = validatePlan(plan);
  if (!valid) {
    rl.close();
    throw new Error("Validation failed after edit: " + JSON.stringify(errors));
  }
  await savePlan(planId, plan);
  rl.close();
  return true;
}

module.exports = { printTodo, interactiveEditTodo };
