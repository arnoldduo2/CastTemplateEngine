"use strict";
/**
 * Maps names used in views to files, with exactly the engine's rules (CastTemplateEngine\Compiler::resolve):
 *   <KpiCard>         => kpi-card, kpi_card, KpiCard, kpiCard  (+ the extension), first existing file wins
 *   <Form.TextInput>  => form/text-input ..., every segment tried in those four styles, dots are folders
 * Pure functions, no VS Code API. `fs` can be replaced in tests: {isFile(path), isDir(path)}.
 */
const nodeFs = require("node:fs");
const path = require("node:path");

const realFs = {
  isFile: (p) => {
    try {
      return nodeFs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
  isDir: (p) => {
    try {
      return nodeFs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
};

/** The four spellings of one name segment, in the engine's order. */
function variants(name) {
  const words = name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ").toLowerCase();
  const unique = [words.replace(/ /g, "-"), words.replace(/ /g, "_"), name, name.charAt(0).toLowerCase() + name.slice(1)];
  return [...new Set(unique)];
}

/**
 * @param {string} tag             e.g. "Btns.Button"
 * @param {string[]} componentDirs folders to look in, in order
 * @returns {{file: string|null, tried: string[]}}
 */
function resolveComponent(tag, componentDirs, ext = ".cast.php", fs = realFs) {
  const tried = [];
  for (const root of componentDirs) {
    const segments = tag.split(".");
    let dir = root;
    for (let i = 0; i < segments.length; i++) {
      const last = i === segments.length - 1;
      let found = null;
      for (const variant of variants(segments[i])) {
        const candidate = path.join(dir, variant + (last ? ext : ""));
        tried.push(candidate);
        if (last ? fs.isFile(candidate) : fs.isDir(candidate)) {
          found = last ? candidate : variant;
          break;
        }
      }
      if (found === null) break;   // not in this folder: try the next one
      if (last) return { file: found, tried };
      dir = path.join(dir, found);
    }
  }
  return { file: null, tried };
}

/** `Component('btns.add-new')`: dots are folders, the name is used as written, `.cast.php` first and then the plain `.php`. */
function resolveLegacyComponent(name, componentDirs, ext = ".cast.php", fs = realFs) {
  return firstFile(componentDirs.flatMap((dir) => [ext, ".php"].map((e) => path.join(dir, ...name.split(/[./]/)) + e)), fs);
}

/** `__includes('layouts.header')`, `views('home.home')`: dots (or slashes) are folders under the views folder. */
function resolveView(name, viewsDir, ext = ".cast.php", fs = realFs) {
  const base = path.join(viewsDir, ...name.split(/[./]/));
  return firstFile([base + ext, base + ".php"], fs);
}

/** `__modules('items.items', 'js')` => resources/js/items/items.module.js ; css => resources/css/items/items.css */
function resolveModule(name, type, resourcesDir, fs = realFs) {
  const base = path.join(resourcesDir, type === "css" ? "css" : "js", ...name.split(/[./]/));
  return firstFile([type === "css" ? base + ".css" : base + ".module.js"], fs);
}

function firstFile(candidates, fs) {
  const file = candidates.find((c) => fs.isFile(c)) || null;
  return { file, tried: candidates };
}

/** Prop names a component file reads: `$title ??= ...`, `@var ... $title`, `@param ... $title` (best effort, for the hover). */
function propsOf(source) {
  const names = new Set();
  const skip = new Set(["this", "data", "children", "slots", "GLOBALS"]);
  for (const re of [/\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=/g, /@(?:var|param|prop)\s+[^$\n]*\$([A-Za-z_][A-Za-z0-9_]*)/g]) {
    let m;
    while ((m = re.exec(source))) if (!skip.has(m[1])) names.add(m[1]);
  }
  return [...names];
}

module.exports = { variants, resolveComponent, resolveLegacyComponent, resolveView, resolveModule, propsOf, realFs };
