const { loadPlan, savePlan, ensureStore } = require("../../src/store");
const {
  normalizeTodos,
  parseMaybeDate,
  nextYearStart,
  generateNextId,
  validatePlan,
} = require("./utils");

module.exports = function (yargs) {
  return yargs.command(
    "todo [action]",
    "Root todo operations (create adds to today's day; list aggregates all)",
    y =>
      y
        .positional("action", {
          describe: "Action (create, list)",
          type: "string",
          choices: ["create", "list"],
        })
        .option("filter", {
          alias: "f",
          describe:
            "Repeatable filter (scope: quarterly|weekly|daily) or state: TODO|DONE. Combine e.g. --filter quarterly --filter DONE",
          type: "string",
          array: true,
        })
        .option("deadline", { describe: "Deadline date-time", type: "string" })
        .option("scheduled", {
          describe: "Scheduled date-time",
          type: "string",
        }),
    async args => {
      const dayOfYear = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        return Math.floor((now - start) / (24 * 60 * 60 * 1000)) + 1;
      };
      const ensureToday = async () => {
        await ensureStore();
        const year = new Date().getFullYear();
        const day = Math.min(Math.max(dayOfYear(), 1), 365);
        const id = String(year);
        let plan = await loadPlan(id);
        if (!plan) {
          plan = {
            year,
            quarters: [null, null, null, null],
            weeks: Array(52).fill(null),
            days: Array(365).fill(null),
          };
        }
        if (!Array.isArray(plan.days)) plan.days = Array(365).fill(null);
        const idx = day - 1;
        if (plan.days[idx] === null) {
          plan.days[idx] = { todos: [] };
          normalizeTodos(plan);
          const { valid, errors } = validatePlan(plan);
          if (!valid) {
            console.error("Validation failed:", errors);
            process.exit(1);
          }
          await savePlan(id, plan);
        }
        return { plan, year, id, day, idx };
      };

      if (!args.action || args.action === "create") {
        const { plan, year, id, day, idx } = await ensureToday();
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
        const todos = plan.days[idx].todos;
        const nextId = generateNextId(todos);
        const createdAt = new Date().toISOString();
        if (!deadline) {
          deadline = nextYearStart();
        }
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
        console.log(`Added daily todo #${nextId} (D${day}) in ${year}.`);
        return;
      }

      if (args.action === "list") {
        await ensureStore();
        const year = new Date().getFullYear();
        const id = String(year);
        const plan = await loadPlan(id);
        if (!plan) {
          console.log(`No plan for ${year}.`);
          return;
        }
        normalizeTodos(plan);
        const records = [];
        if (Array.isArray(plan.quarters))
          plan.quarters.forEach(
            (q, i) =>
              q &&
              Array.isArray(q.todos) &&
              q.todos.forEach(
                t =>
                  t &&
                  records.push({ scope: `Q${i + 1}`, level: "quarterly", ...t })
              )
          );
        if (Array.isArray(plan.weeks))
          plan.weeks.forEach(
            (w, i) =>
              w &&
              Array.isArray(w.todos) &&
              w.todos.forEach(
                t =>
                  t &&
                  records.push({ scope: `W${i + 1}`, level: "weekly", ...t })
              )
          );
        if (Array.isArray(plan.days))
          plan.days.forEach(
            (d, i) =>
              d &&
              Array.isArray(d.todos) &&
              d.todos.forEach(
                t =>
                  t &&
                  records.push({ scope: `D${i + 1}`, level: "daily", ...t })
              )
          );
        if (!records.length) {
          console.log(`No todos in ${year}.`);
          return;
        }
        const filters = Array.isArray(args.filter) ? args.filter : [];
        const scopeSet = new Set(["quarterly", "weekly", "daily"]);
        const scopeFilters = filters
          .map(f => f.toLowerCase())
          .filter(f => scopeSet.has(f));
        const stateFilters = filters
          .map(f => f.toUpperCase())
          .filter(f => ["TODO", "DONE"].includes(f));
        const unknown = filters.filter(
          f =>
            !scopeSet.has(f.toLowerCase()) &&
            !["TODO", "DONE", "todo", "done"].includes(f)
        );
        if (unknown.length) {
          console.error(
            `Unknown filter value(s): ${unknown.join(
              ", "
            )}. Allowed: quarterly|weekly|daily|TODO|DONE.`
          );
          process.exit(1);
        }
        let filtered = records;
        if (scopeFilters.length)
          filtered = filtered.filter(r => scopeFilters.includes(r.level));
        if (stateFilters.length)
          filtered = filtered.filter(r => stateFilters.includes(r.state));
        if (!filtered.length) {
          const labels = [];
          if (scopeFilters.length) labels.push(scopeFilters.join("+"));
          if (stateFilters.length) labels.push(stateFilters.join("+"));
          console.log(
            `No ${labels.length ? labels.join(" ") + " " : ""}todos in ${year}.`
          );
          return;
        }
        filtered.sort((a, b) =>
          (a.createdAt || "") < (b.createdAt || "")
            ? -1
            : (a.createdAt || "") > (b.createdAt || "")
            ? 1
            : 0
        );
        const labels = [];
        if (scopeFilters.length) labels.push(scopeFilters.join("+"));
        if (stateFilters.length) labels.push(stateFilters.join("+"));
        console.log(
          `Todos in ${year}${labels.length ? ` (${labels.join(" ")})` : ""}:`
        );
        filtered.forEach(r => {
          const mark = r.state === "DONE" ? "✔" : " ";
          console.log(`  [${r.scope}:${r.id}] ${mark} ${r.title}`);
        });
      }
    }
  );
};
