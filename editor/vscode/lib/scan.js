"use strict";
/**
 * Finds the things in a .cast.php source that point to other files, the same way the engine's compiler reads it
 * (CastTemplateEngine\Compiler): component tags in HTML, and inside `{ ... }` attribute values, but never inside
 * `<?php ?>`, `<!-- -->`, `<script>`, `<style>` or quoted attribute values.
 *
 * Pure functions on a string, no VS Code API: offsets are returned (start inclusive, end exclusive).
 *
 * scanComponents/scanHelpers/scanChainCalls are all a compatibility facade over cast-language-core now (see
 * lib/docblock.js's own facade comment and docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md).
 * scanComponents moved there as part of Task 8 (editor/language-core/src/completionContext.ts), once contextAt
 * needed the exact same scan the LSP's own CompletionProvider uses - this file no longer carries its own copy.
 * The require is guarded the same way lib/docblock.js's is: on failure, every export here is a safe empty result,
 * not a crash.
 */
const NAME = "[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*";

let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}
const scanComponents = core ? core.scanComponents : () => [];
const scanHelpers = core ? core.scanHelpers : () => [];
const scanChainCalls = core ? core.scanChainCalls : () => [];

module.exports = { scanComponents, scanHelpers, scanChainCalls, NAME };
