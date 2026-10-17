"use strict";
/**
 * Compatibility facade over cast-language-core's name-resolution helpers. See lib/docblock.js's own facade comment
 * and docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md.
 */
const core = require("cast-language-core");

module.exports = {
  variants: core.variants,
  resolveComponent: core.resolveComponent,
  resolveLegacyComponent: core.resolveLegacyComponent,
  resolveView: core.resolveView,
  resolveModule: core.resolveModule,
  propsOf: core.propsOf,
  realFs: core.realFs,
};
