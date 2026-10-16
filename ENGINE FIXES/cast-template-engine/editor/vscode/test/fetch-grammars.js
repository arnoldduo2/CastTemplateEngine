#!/usr/bin/env node
/**
 * Downloads the VS Code grammars the injection is tested against (PHP, HTML, CSS, JS) into test/.grammars/.
 * They are VS Code's own files (MIT licensed), fetched, not committed. Needs `curl`.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const base = "https://raw.githubusercontent.com/microsoft/vscode/main/extensions";
const files = {
  "php.tmLanguage.json": "php/syntaxes/php.tmLanguage.json",
  "html.tmLanguage.json": "php/syntaxes/html.tmLanguage.json",
  "html-basic.tmLanguage.json": "html/syntaxes/html.tmLanguage.json",
  "html-derivative.tmLanguage.json": "html/syntaxes/html-derivative.tmLanguage.json",
  "css.tmLanguage.json": "css/syntaxes/css.tmLanguage.json",
  "js.tmLanguage.json": "javascript/syntaxes/JavaScript.tmLanguage.json",
};

const dir = path.join(__dirname, ".grammars");
fs.mkdirSync(dir, { recursive: true });
for (const [name, remote] of Object.entries(files)) {
  const target = path.join(dir, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) continue;
  execFileSync("curl", ["-fsSL", "--retry", "3", "-o", target, `${base}/${remote}`], { stdio: "inherit" });
}
console.log("grammars ready in", dir);
