"use strict";
/**
 * Compatibility facade over cast-language-core's indentation module: the extension's auto-indent and the
 * `indent.test.js` suite both call these names, but the structural scanning itself (and the multiline @php(...)
 * fix) lives in editor/language-core/src/indent.ts so the LSP's formatter can share it.
 */
const core = require("cast-language-core");

module.exports = {
  computeIndents: core.computeIndents,
  formatText: core.formatCast,
  indentFor: core.indentFor,
  indentString: core.indentString,
};
