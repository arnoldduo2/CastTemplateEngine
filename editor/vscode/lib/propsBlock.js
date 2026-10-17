"use strict";
/**
 * Compatibility facade over cast-language-core's @props{} parser. See lib/docblock.js's own facade comment and
 * docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md.
 */
const core = require("cast-language-core");

module.exports = {
  parsePropsBlock: core.parsePropsBlock,
  firstMarkupOffset: core.firstMarkupOffset,
};
