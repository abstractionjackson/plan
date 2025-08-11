#!/usr/bin/env node

const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const {
  loadPlan,
  savePlan,
  deletePlan,
  listPlans,
  ensureStore,
} = require("../src/store");
const { validatePlan } = require("../src/validator");

const argv = yargs(hideBin(process.argv))
  .scriptName("plan")
  .usage("$0 <cmd> [args]")
  .command(
    "create <id> [file]",
    "Create a plan from JSON file or empty template",
    y =>
      y
        .positional("id", {
          describe: "Plan identifier (e.g., year or custom key)",
          type: "string",
        })
        .positional("file", {
          describe: "Path to JSON file to import",
          type: "string",
        }),
    async args => {
      await ensureStore();
      let plan;
      if (args.file) {
        plan = require(path.resolve(process.cwd(), args.file));
      } else {
        plan = {
          year: new Date().getFullYear(),
          quarters: [null, null, null, null],
        };
      }
      const { valid, errors } = validatePlan(plan);
      if (!valid) {
        console.error("Validation failed:", errors);
        process.exit(1);
      }
      await savePlan(args.id, plan);
      console.log(`Created plan ${args.id}`);
    }
  )
  .command(
    "read <id>",
    "Read a plan and print JSON",
    y => y.positional("id", { describe: "Plan identifier", type: "string" }),
    async args => {
      const plan = await loadPlan(args.id);
      if (!plan) {
        console.error(`Plan ${args.id} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(plan, null, 2));
    }
  )
  .command(
    "update <id> <file>",
    "Update a plan from a JSON file",
    y =>
      y
        .positional("id", { describe: "Plan identifier", type: "string" })
        .positional("file", {
          describe: "Path to JSON file to import",
          type: "string",
        }),
    async args => {
      await ensureStore();
      const plan = require(path.resolve(process.cwd(), args.file));
      const { valid, errors } = validatePlan(plan);
      if (!valid) {
        console.error("Validation failed:", errors);
        process.exit(1);
      }
      await savePlan(args.id, plan);
      console.log(`Updated plan ${args.id}`);
    }
  )
  .command(
    "delete <id>",
    "Delete a plan",
    y => y.positional("id", { describe: "Plan identifier", type: "string" }),
    async args => {
      const ok = await deletePlan(args.id);
      if (!ok) {
        console.error(`Plan ${args.id} not found`);
        process.exit(1);
      }
      console.log(`Deleted plan ${args.id}`);
    }
  )
  .command(
    "list",
    "List plans",
    () => {},
    async () => {
      const items = await listPlans();
      if (items.length === 0) {
        console.log("No plans");
        return;
      }
      for (const id of items) console.log(id);
    }
  )
  .command(
    "quarter [task] [action] [filter]",
    "Quarter operations: create/add/list/complete/delete todos (list accepts optional filter: todo|done)",
    y =>
      y
        .positional("task", {
          describe: "Task scope (create or todo)",
          type: "string",
          choices: ["create", "todo"],
          default: "create",
        })
        .positional("action", {
          describe: "Todo action (list, complete, delete)",
          type: "string",
          choices: ["list", "complete", "delete"],
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
        }),
    async args => {
      const ensureQuarter = async quarterOverride => {
        await ensureStore();
        const now = new Date();
        const year = now.getFullYear();
        const quarter = quarterOverride || Math.floor(now.getMonth() / 3) + 1;
        const idx = quarter - 1;
        const id = String(year);
        let plan = await loadPlan(id);
        if (!plan) plan = { year, quarters: [null, null, null, null] };
        if (!Array.isArray(plan.quarters))
          plan.quarters = [null, null, null, null];
        for (let i = 0; i < 4; i++)
          if (typeof plan.quarters[i] === "undefined") plan.quarters[i] = null;
        if (plan.quarters[idx] === null) {
          plan.quarters[idx] = { todos: [] };
          const { valid, errors } = validatePlan(plan);
          if (!valid) {
            console.error("Validation failed:", errors);
            process.exit(1);
          }
          await savePlan(id, plan);
          console.log(`Created Q${quarter} ${year} in plan ${id}.`);
        }
        return { plan, year, quarter, idx, id };
      };

      if (args.task === "create") {
        await ensureQuarter(args.number);
        return;
      }
      // task === todo
      if (!args.action) {
        const { plan, quarter, year, idx, id } = await ensureQuarter(
          args.number
        );
        const stdin = await new Promise(res => {
          let data = "";
          if (process.stdin.isTTY) return res("");
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", chunk => (data += chunk));
          process.stdin.on("end", () => res(data));
        });
        let title = stdin.trim();
        if (!title) {
          const readline = require("readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const question = q => new Promise(r => rl.question(q, ans => r(ans)));
          title = (await question("Title: ")).trim();
          rl.close();
        }
        if (!title) {
          console.error("Title is required.");
          process.exit(1);
        }
        const todos = Array.isArray(plan.quarters[idx].todos)
          ? plan.quarters[idx].todos
          : (plan.quarters[idx].todos = []);
        const nextId = todos.length
          ? Math.max(
              ...todos.map(t => (t && typeof t.id === "number" ? t.id : 0))
            ) + 1
          : 1;
        todos.push({ id: nextId, state: "TODO", title });
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
        const readline = require("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const question = q => new Promise(r => rl.question(q, ans => r(ans)));
        const answer = (await question("Enter id to complete: ")).trim();
        rl.close();
        const chosenId = Number(answer);
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
        const readline = require("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const question = q => new Promise(r => rl.question(q, ans => r(ans)));
        const answer = (await question("Enter id to delete: ")).trim();
        rl.close();
        const chosenId = Number(answer);
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
  )
  .option("store", {
    alias: "s",
    describe: "Directory for storing plans",
    type: "string",
    default: path.join(process.cwd(), "data"),
  })
  .middleware(args => {
    process.env.PLAN_STORE = args.store;
  })
  .demandCommand(1)
  .help()
  .version()
  .strict()
  .parse();
