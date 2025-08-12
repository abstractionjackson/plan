const { loadPlan, savePlan, ensureStore } = require("../../src/store");
const {
  normalizeTodos,
  parseMaybeDate,
  startOfNextDay,
  generateNextId,
  validatePlan,
} = require("./utils");

function getCurrentDayOfYearBounded() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const msInDay = 24 * 60 * 60 * 1000;
  let d = Math.floor((now - start) / msInDay) + 1; // 1..366
  if (d < 1) d = 1;
  if (d > 365) d = 365; // schema caps at 365
  return d;
}

async function ensureDay(dayOverride) {
  await ensureStore();
  const now = new Date();
  const year = now.getFullYear();
  const day = dayOverride || getCurrentDayOfYearBounded();
  if (!Number.isInteger(day) || day < 1 || day > 365) {
    console.error("Day number must be between 1 and 365.");
    process.exit(1);
  }
  const idx = day - 1;
  const id = String(year);
  let plan = await loadPlan(id);
  if (!plan)
    plan = {
      year,
      quarters: [null, null, null, null],
      weeks: Array(52).fill(null),
      days: Array(365).fill(null),
    };
  if (!Array.isArray(plan.days)) plan.days = Array(365).fill(null);
  for (let i = 0; i < 365; i++)
    if (typeof plan.days[i] === "undefined") plan.days[i] = null;
  if (plan.days[idx] === null) {
    plan.days[idx] = { todos: [] };
    normalizeTodos(plan);
    const { valid, errors } = validatePlan(plan);
    if (!valid) {
      console.error("Validation failed:", errors);
      process.exit(1);
    }
    await savePlan(id, plan);
    console.log(`Created day ${day} ${year} in plan ${id}.`);
  }
  return { plan, year, day, idx, id };
}

module.exports = function (yargs) {
  return yargs.command(
    "day [task] [action] [filter]",
    "Day operations: create/add/list/complete/delete daily todos (list accepts optional filter: todo|done)",
    y =>
      y
        .positional("task", {
          describe: "Task scope (create or todo)",
          type: "string",
          choices: ["create", "todo"],
          default: "create",
        })
        .positional("action", {
          describe: "Todo action (list, show, complete, delete)",
          type: "string",
          choices: ["list", "show", "complete", "delete"],
        })
        .positional("filter", {
          describe: "Optional filter for list (todo|done)",
          type: "string",
          choices: ["todo", "done"],
        })
        .option("number", {
          alias: "n",
          describe: "Day of year (1-365). Defaults to today.",
          type: "number",
        })
        .option("deadline", {
          describe: "Deadline date-time (ISO 8601 or parseable)",
          type: "string",
        })
        .option("scheduled", {
          describe:
            "Scheduled date-time (ISO 8601 or parseable; 'now' allowed)",
          type: "string",
        })
        .option("id", {
          describe: "Todo id for show action",
          type: "number",
        }),
    async args => {
      if (args.task === "create") {
        await ensureDay(args.number);
        return;
      }
      if (args.action === "show") {
        const { plan, day, year, idx } = await ensureDay(args.number);
        const todos = Array.isArray(plan.days[idx].todos)
          ? plan.days[idx].todos
          : [];
        if (!Number.isInteger(args.id)) {
          console.error("--id is required and must be a number for show.");
          process.exit(1);
        }
        const todo = todos.find(t => t && t.id === args.id);
        if (!todo) {
          console.error(`Todo id ${args.id} not found in day ${day} ${year}.`);
          process.exit(1);
        }
        console.log(`Day ${day} ${year} todo #${todo.id}`);
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
        return;
      }
      if (!args.action) {
        const { plan, day, year, idx, id } = await ensureDay(args.number);
        const stdin = await new Promise(res => {
          let data = "";
          if (process.stdin.isTTY) return res("");
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", c => (data += c));
          process.stdin.on("end", () => res(data));
        });
        let title = stdin.trim();
        if (!title) {
          const rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          title = await new Promise(r => rl.question("Title: ", a => r(a)));
          rl.close();
          title = title.trim();
        }
        if (!title) {
          console.error("Title is required.");
          process.exit(1);
        }
        let deadline = parseMaybeDate(args.deadline, "deadline");
        let scheduled = parseMaybeDate(args.scheduled, "scheduled");
        const todos = Array.isArray(plan.days[idx].todos)
          ? plan.days[idx].todos
          : (plan.days[idx].todos = []);
        const nextId = generateNextId(todos);
        const createdAt = new Date().toISOString();
        if (!deadline) deadline = startOfNextDay();
        if (!scheduled) scheduled = createdAt;
        const newTodo = {
          id: nextId,
          state: "TODO",
          title,
          createdAt,
          deadline,
          scheduled,
        };
        todos.push(newTodo);
        normalizeTodos(plan);
        const { valid, errors } = validatePlan(plan);
        if (!valid) {
          console.error("Validation failed:", errors);
          process.exit(1);
        }
        await savePlan(id, plan);
        console.log(`Added todo #${nextId} to day ${day} ${year}.`);
        return;
      }
      if (args.action === "list") {
        const { plan, day, year, idx } = await ensureDay(args.number);
        const todos = Array.isArray(plan.days[idx].todos)
          ? plan.days[idx].todos
          : [];
        if (!todos.length) {
          console.log(`No todos in day ${day} ${year}.`);
          return;
        }
        const filter = args.filter;
        let filtered = todos;
        if (filter === "todo")
          filtered = todos.filter(t => t && t.state !== "DONE");
        else if (filter === "done")
          filtered = todos.filter(t => t && t.state === "DONE");
        if (!filtered.length) {
          console.log(
            `No ${
              filter ? filter.toUpperCase() : ""
            } todos in day ${day} ${year}.`
          );
          return;
        }
        console.log(
          `Todos in day ${day} ${year}${
            filter ? ` (${filter.toUpperCase()})` : ""
          }:`
        );
        filtered.forEach(t => {
          if (!t) return;
          const mark = t.state === "DONE" ? "✔" : " ";
          console.log(`  [${t.id}] ${mark} ${t.title}`);
        });
        return;
      }
      if (args.action === "complete") {
        const { plan, day, year, idx, id } = await ensureDay(args.number);
        const todos = Array.isArray(plan.days[idx].todos)
          ? plan.days[idx].todos
          : [];
        if (!todos.length) {
          console.error(`No todos in day ${day} ${year}.`);
          process.exit(1);
        }
        console.log(`Todos in day ${day} ${year}:`);
        todos.forEach(t => {
          if (!t) return;
          console.log(
            `  [${t.id}] ${t.state === "DONE" ? "✔" : " "} ${t.title}`
          );
        });
        const rl = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise(r =>
          rl.question("Enter id to complete: ", a => r(a))
        );
        rl.close();
        const chosenId = Number(answer.trim());
        if (!Number.isInteger(chosenId)) {
          console.error("Invalid id.");
          process.exit(1);
        }
        const todo = todos.find(t => t && t.id === chosenId);
        if (!todo) {
          console.error(`Todo id ${chosenId} not found.`);
          process.exit(1);
        }
        if (todo.state === "DONE") {
          console.log(`Todo #${todo.id} already DONE.`);
          return;
        }
        todo.state = "DONE";
        normalizeTodos(plan);
        const { valid, errors } = validatePlan(plan);
        if (!valid) {
          console.error("Validation failed after update:", errors);
          process.exit(1);
        }
        await savePlan(id, plan);
        console.log(`Marked todo #${todo.id} as DONE in day ${day} ${year}.`);
        return;
      }
      if (args.action === "delete") {
        const { plan, day, year, idx, id } = await ensureDay(args.number);
        const todos = Array.isArray(plan.days[idx].todos)
          ? plan.days[idx].todos
          : [];
        if (!todos.length) {
          console.error(`No todos in day ${day} ${year}.`);
          process.exit(1);
        }
        console.log(`Todos in day ${day} ${year}:`);
        todos.forEach(t => {
          if (!t) return;
          console.log(
            `  [${t.id}] ${t.state === "DONE" ? "✔" : " "} ${t.title}`
          );
        });
        const rl = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise(r =>
          rl.question("Enter id to delete: ", a => r(a))
        );
        rl.close();
        const chosenId = Number(answer.trim());
        if (!Number.isInteger(chosenId)) {
          console.error("Invalid id.");
          process.exit(1);
        }
        const index = todos.findIndex(t => t && t.id === chosenId);
        if (index === -1) {
          console.error(`Todo id ${chosenId} not found.`);
          process.exit(1);
        }
        const [removed] = todos.splice(index, 1);
        normalizeTodos(plan);
        const { valid, errors } = validatePlan(plan);
        if (!valid) {
          console.error("Validation failed after delete:", errors);
          process.exit(1);
        }
        await savePlan(id, plan);
        console.log(`Deleted todo #${removed.id} from day ${day} ${year}.`);
        return;
      }
    }
  );
};
