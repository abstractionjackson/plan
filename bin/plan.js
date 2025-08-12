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

// Modular command imports
const rootTodo = require("../src/commands/rootTodo");
const dayCmd = require("../src/commands/day");
const weekCmd = require("../src/commands/week");
const quarterCmd = require("../src/commands/quarter");

let cli = yargs(hideBin(process.argv))
  .scriptName("plan")
  .usage("$0 <cmd> [args]");

cli = rootTodo(cli);
cli = dayCmd(cli);
cli = weekCmd(cli);
cli = quarterCmd(cli);

cli
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
  .option("store", {
    alias: "s",
    describe: "Directory for storing plans",
    type: "string",
    default: path.join(process.cwd(), "data"),
  })
  .middleware(args => {
    process.env.PLAN_STORE = args.store;
  })
  .command(
    "help [command]",
    "Show general help or help for a specific command",
    y =>
      y.positional("command", {
        describe: "Optional command name to show detailed help",
        type: "string",
      }),
    args => {
      if (args.command && args.command !== "help") {
        // Re-run the parser for the target command with --help
        cli.parse([args.command, "--help"], {}, () => {});
      } else {
        cli.showHelp();
      }
    }
  )
  .help("help")
  .alias("help", "h")
  .version();

cli.demandCommand(1).strict().parse();
