# plan

A values-based, lifestyle-centric day planner

# Plan CLI

A small Node.js command line app to create, read, update, delete (CRUD) Plan JSON files validated against `schema.json`.

## Install

- Requires Node.js 16+
- From the project root:

```
npm install
npm link # optional to expose the `plan` command globally in your shell
```

## Usage

```
plan --help
```

Commands:

- create <id> [file] Create a plan from JSON file or an empty template
- read <id> Print a plan as JSON
- update <id> <file> Replace a plan with JSON from file
- delete <id> Delete a plan
- list List plan ids
- quarter Create a plan for the current quarter if not exists
  -n, --number Quarter number (1–4) to create (defaults to current quarter)
- quarter todo Add a todo item to the current quarter (prompts for a title)
- quarter todo list [todo|done] List quarterly todos (optionally filter by state)
- quarter todo complete Mark a quarterly todo as DONE (interactive)
- quarter todo delete Delete a quarterly todo (interactive)

Options:

- --store, -s Directory to store JSON files (default: ./data)

Examples:

```
# create an empty plan for the current year
plan create 2025

# create from a file and custom store dir
plan create 2025 ./examples/plan-2025.json --store ./plans

# read it
plan read 2025 --store ./plans

# update from a file
plan update 2025 ./examples/plan-2025.json --store ./plans

# list
plan list --store ./plans

# delete
plan delete 2025 --store ./plans
```

## Validation

The CLI validates against `schema.json` at the repository root using Ajv. If validation fails, the command exits with code 1 and prints Ajv errors.
