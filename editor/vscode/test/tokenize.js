"use strict";
// Tokenises a .cast.php source with VS Code's own PHP/HTML grammars plus the Cast injection grammar.
const fs = require("node:fs");
const path = require("node:path");
const vsctm = require("vscode-textmate");
const oniguruma = require("vscode-oniguruma");

const grammars = path.join(__dirname, ".grammars");
const files = {
  "text.html.php": path.join(grammars, "html.tmLanguage.json"),
  "source.php": path.join(grammars, "php.tmLanguage.json"),
  "text.html.basic": path.join(grammars, "html-basic.tmLanguage.json"),
  "text.html.derivative": path.join(grammars, "html-derivative.tmLanguage.json"),
  "source.css": path.join(grammars, "css.tmLanguage.json"),
  "source.js": path.join(grammars, "js.tmLanguage.json"),
  "cast.injection": path.join(__dirname, "..", "syntaxes", "cast-injection.tmLanguage.json"),
  "cast.injection.echo": path.join(__dirname, "..", "syntaxes", "cast-echo.tmLanguage.json"),
};

function available() {
  return Object.values(files).every((f) => fs.existsSync(f));
}

let registryPromise;
function registry(withCast = true) {
  const wasm = fs.readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer;
  const onigLib = oniguruma.loadWASM(wasm).then(() => ({
    createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
    createOnigString: (s) => new oniguruma.OnigString(s),
  }));
  return new vsctm.Registry({
    onigLib,
    loadGrammar: async (scopeName) => {
      if (scopeName.startsWith("cast.injection") && !withCast) return null;
      const file = files[scopeName];
      if (!file || !fs.existsSync(file)) return null;
      return vsctm.parseRawGrammar(fs.readFileSync(file, "utf8"), file);
    },
    getInjections: (scopeName) => (withCast && scopeName === "text.html.php" ? ["cast.injection", "cast.injection.echo"] : undefined),
  });
}

/** @returns {Promise<Array<{line:number, text:string, scopes:string[]}>>} one entry per token */
async function tokenize(source, { cast = true } = {}) {
  const grammar = await registry(cast).loadGrammar("text.html.php");
  const out = [];
  let state = vsctm.INITIAL;
  source.split("\n").forEach((line, i) => {
    const result = grammar.tokenizeLine(line, state);
    for (const t of result.tokens) out.push({ line: i, text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });
    state = result.ruleStack;
  });
  return out;
}

/** Tokens whose text equals `text` (trimmed), with the scopes after the root. */
function find(tokens, text) {
  return tokens.filter((t) => t.text.trim() === text).map((t) => t.scopes.slice(1));
}

module.exports = { tokenize, find, available };
