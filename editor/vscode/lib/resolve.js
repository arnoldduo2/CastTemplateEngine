"use strict";
/**
 * Compatibility facade over cast-language-core's name-resolution helpers. See lib/docblock.js's own facade comment
 * and docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md.
 */
// Guarded the same way lib/docblock.js's require is - see that file's comment for why.
let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}

const notFound = () => ({ file: null, tried: [] });

module.exports = core
  ? {
      variants: core.variants,
      resolveComponent: core.resolveComponent,
      resolveLegacyComponent: core.resolveLegacyComponent,
      resolveView: core.resolveView,
      resolveModule: core.resolveModule,
      propsOf: core.propsOf,
      realFs: core.realFs,
    }
  : {
      variants: (name) => [name],
      resolveComponent: notFound,
      resolveLegacyComponent: notFound,
      resolveView: notFound,
      resolveModule: notFound,
      propsOf: () => [],
      realFs: { isFile: () => false, isDir: () => false },
    };
