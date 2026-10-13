"use strict";
/** Finds component files and reads their specs (docblocks), with a cache that follows the file's modification time. */
const fs = require("node:fs");
const path = require("node:path");
const { parseComponent, camel } = require("./docblock");
const { resolveComponent } = require("./resolve");

const cache = new Map(); // file => {mtime, spec}

function specOf(file) {
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = cache.get(file);
    if (hit && hit.mtime === mtime) return hit.spec;
    const spec = parseComponent(fs.readFileSync(file, "utf8"));
    cache.set(file, { mtime, spec });
    return spec;
  } catch {
    return null;
  }
}

/** @returns {{file: string, spec: object}|null} */
function lookup(tag, where) {
  const { file } = resolveComponent(tag, where.componentDirs, where.ext);
  if (!file) return null;
  const spec = specOf(file);
  return spec ? { file, spec } : null;
}

/** `add-new` / `add_new` / `addNew` => `AddNew` */
function pascal(segment) {
  return segment.replace(/[-_]+([A-Za-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Every component under the folders: [{tag, file}], the first folder wins for a tag. */
function listComponents(dirs, ext = ".cast.php") {
  const found = new Map();
  const walk = (root, dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(root, full);
      else if (entry.isFile() && entry.name.endsWith(ext)) {
        const relative = path.relative(root, full).slice(0, -ext.length);
        const tag = relative.split(path.sep).map(pascal).join(".");
        if (/^[A-Z][A-Za-z0-9_]*(\.[A-Z][A-Za-z0-9_]*)*$/.test(tag) && !found.has(tag)) found.set(tag, { tag, file: full });
      }
    }
  };
  for (const dir of dirs) walk(dir, dir);
  return [...found.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
function findProp(spec, attributeName) {
  const wanted = camel(attributeName);
  return spec.props.find((p) => p.name === attributeName || camel(p.name) === wanted) || null;
}

module.exports = { specOf, lookup, listComponents, findProp, pascal };
