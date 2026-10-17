"use strict";
/**
 * Compatibility facade over cast-language-core's component docblock parser: reads what a component file says
 * about itself (its docblocks, `$prop ??= default` lines, and @props{} blocks). The parsing itself lives in
 * editor/language-core/src/componentSpec so the LSP can share it (see docs/superpowers/specs/
 * 2026-10-17-cast-lsp-precedence-design.md). The PHP reader (src/Support/ComponentDocs.php) produces exactly the
 * same JSON; the fixtures in tests/fixtures/components are the contract between the two.
 */
const core = require("cast-language-core");

module.exports = {
  parseComponent: core.parseComponent,
  camel: core.camel,
  splitUnion: core.splitUnion,
  readType: core.readType,
  finish: core.finish,
  newProp: core.newProp,
};
