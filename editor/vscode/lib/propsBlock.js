"use strict";
/**
 * Compatibility facade over cast-language-core's @props{} parser. See lib/docblock.js's own facade comment and
 * docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md.
 */
// Guarded the same way lib/docblock.js's require is - see that file's comment for why.
let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}

module.exports = core
  ? {
      parsePropsBlock: core.parsePropsBlock,
      firstMarkupOffset: core.firstMarkupOffset,
    }
  : {
      parsePropsBlock: () => ({ props: [], extends: null, start: null, end: null, markupBefore: null }),
      firstMarkupOffset: () => null,
    };
