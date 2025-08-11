const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

// Load schema lazily to avoid requiring from different cwd
const schemaPath = path.join(__dirname, "..", "schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

// Use the 2020-12 draft to match the schema's $schema
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function validatePlan(plan) {
  const valid = validate(plan);
  return { valid, errors: valid ? undefined : validate.errors };
}

module.exports = { validatePlan };
