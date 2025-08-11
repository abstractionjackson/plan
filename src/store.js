const fs = require("fs/promises");
const path = require("path");

const storeDirFromEnv = () => {
  // Allow CLI option via process.env.PLAN_STORE set by bin/plan.js if needed later
  return process.env.PLAN_STORE || path.join(process.cwd(), "data");
};

async function ensureStore(dir = storeDirFromEnv()) {
  await fs.mkdir(dir, { recursive: true });
}

async function planPath(id, dir = storeDirFromEnv()) {
  return path.join(dir, `${id}.json`);
}

async function savePlan(id, plan, dir = storeDirFromEnv()) {
  const p = await planPath(id, dir);
  await fs.writeFile(p, JSON.stringify(plan, null, 2), "utf8");
}

async function loadPlan(id, dir = storeDirFromEnv()) {
  try {
    const p = await planPath(id, dir);
    const data = await fs.readFile(p, "utf8");
    return JSON.parse(data);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function deletePlan(id, dir = storeDirFromEnv()) {
  try {
    const p = await planPath(id, dir);
    await fs.unlink(p);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}

async function listPlans(dir = storeDirFromEnv()) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith(".json"))
      .map(e => path.basename(e.name, ".json"))
      .sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

module.exports = { ensureStore, savePlan, loadPlan, deletePlan, listPlans };
