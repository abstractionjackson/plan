const { loadPlan, savePlan, ensureStore } = require("../../src/store");
const {
  normalizeTodos,
  parseMaybeDate,
  startOfNextQuarter,
  generateNextId,
  validatePlan,
} = require("./utils");

async function ensureQuarter(quarterOverride) {
  await ensureStore();
  const now = new Date();
  const year = now.getFullYear();
  const quarter = quarterOverride || Math.floor(now.getMonth() / 3) + 1;
  const idx = quarter - 1;
  const id = String(year);
  let plan = await loadPlan(id);
  if (!plan) plan = { year, quarters: [null, null, null, null] };
  if (!Array.isArray(plan.quarters)) plan.quarters = [null, null, null, null];
  for (let i = 0; i < 4; i++)
    if (typeof plan.quarters[i] === "undefined") plan.quarters[i] = null;
  if (plan.quarters[idx] === null) {
    plan.quarters[idx] = { todos: [] };
    normalizeTodos(plan);
    const { valid, errors } = validatePlan(plan);
    if (!valid) {
      console.error("Validation failed:", errors);
      process.exit(1);
    }
    await savePlan(id, plan);
    console.log(`Created Q${quarter} ${year} in plan ${id}.`);
  }
  return { plan, year, quarter, idx, id };
}

module.exports = function (yargs) {
  return yargs.command(
    "quarter [task] [action] [filter]",
    "Quarter operations: create/add/list/show/edit/complete/delete todos (list accepts optional filter: todo|done)",
    y =>
      y
        .positional("task", {
          describe: "Task scope (create or todo)",
          type: "string",
          choices: ["create", "todo"],
          default: "create",
        })
        .positional("action", {
          describe: "Todo action (list, show, edit, complete, delete)",
          type: "string",
          choices: ["list", "show", "edit", "complete", "delete"],
        })
        .positional("filter", {
          describe: "Optional filter for list (todo|done)",
          type: "string",
          choices: ["todo", "done"],
        })
        .option("number", {
          alias: "n",
          describe: "Quarter number (1-4). Defaults to current quarter.",
          type: "number",
          choices: [1, 2, 3, 4],
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
          describe: "Todo id for show/edit action",
          type: "number",
        }),
    async args => {
      if (args.task === "create") {
        await ensureQuarter(args.number);
        return;
      }
      if (args.action === "show") {
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : [];
        if (!Number.isInteger(args.id)) {
          console.error("--id is required and must be a number for show.");
          process.exit(1);
        }
        const todo = todos.find(t => t && t.id === args.id);
        if (!todo) {
          console.error(`Todo id ${args.id} not found in Q${quarter} ${year}.`);
          process.exit(1);
        }
        const { printTodo } = require("./editUtils");
        printTodo("Quarter", quarter, year, todo);
        return;
      }
      if (args.action === "edit") {
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : [];
        if (!Number.isInteger(args.id)) {
          console.error("--id is required and must be a number for edit.");
          process.exit(1);
        }
        const todo = todos.find(t => t && t.id === args.id);
        if (!todo) {
          console.error(`Todo id ${args.id} not found in Q${quarter} ${year}.`);
          process.exit(1);
        }
        const { interactiveEditTodo, printTodo } = require("./editUtils");
        printTodo("Quarter", quarter, year, todo);
        try {
          await interactiveEditTodo({ plan, todo, planId: id });
          console.log("Updated todo.");
        } catch (e) {
          console.error(e.message);
          process.exit(1);
        }
        return;
      }
      if (!args.action) {
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
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
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : (plan.quarters[idx].todos = []);
        const nextId = generateNextId(todos);
        const createdAt = new Date().toISOString();
        let deadline = parseMaybeDate(args.deadline, "deadline");
        let scheduled = parseMaybeDate(args.scheduled, "scheduled");
        let finalDeadline = deadline || startOfNextQuarter();
        let finalScheduled = scheduled || createdAt;
        const newTodo = {
          id: nextId,
          state: "TODO",
          title,
          createdAt,
          deadline: finalDeadline,
          scheduled: finalScheduled,
        };
        todos.push(newTodo);
        normalizeTodos(plan);
        const { valid, errors } = validatePlan(plan);
        if (!valid) {
          console.error("Validation failed:", errors);
          process.exit(1);
        }
        await savePlan(id, plan);
        console.log(`Added todo #${nextId} to Q${quarter} ${year}.`);
        return;
      }
      if (args.action === "list") {
        const { plan, quarter, year, idx } = await ensureQuarter(args.number);
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : [];
        if (!todos.length) {
          console.log(`No todos in Q${quarter} ${year}.`);
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
            } todos in Q${quarter} ${year}.`
          );
          return;
        }
        console.log(
          `Todos in Q${quarter} ${year}${
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
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : [];
        if (!todos.length) {
          console.error(`No todos in Q${quarter} ${year}.`);
          process.exit(1);
        }
        console.log(`Todos in Q${quarter} ${year}:`);
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
        console.log(`Marked todo #${todo.id} as DONE in Q${quarter} ${year}.`);
        return;
      }
      if (args.action === "delete") {
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : [];
        if (!todos.length) {
          console.error(`No todos in Q${quarter} ${year}.`);
          process.exit(1);
        }
        console.log(`Todos in Q${quarter} ${year}:`);
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
        console.log(`Deleted todo #${removed.id} from Q${quarter} ${year}.`);
        return;
      }
    }
  );
};
