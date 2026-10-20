"use strict";
/**
 * Compatibility facade over cast-language-core's indentation module: the extension's auto-indent and the
 * `indent.test.js` suite both call these names, but the structural scanning itself (and the multiline @php(...)
 * fix) lives in editor/language-core/src/indent.ts so the LSP's formatter can share it.
 *
 * The require is guarded: cast-language-core is a file: dependency staged by the PHP installer
 * (EngineEditorInstallCommand::stageLanguageCore) rather than published to npm, so a user whose npm install step
 * failed (offline, no npm on PATH, a locked file) or who installed a VSIX packaged with --no-dependencies would
 * otherwise lose the entire extension at activation - every hover/completion/definition/diagnostic along with it,
 * not just indentation. On failure, every export here is a safe no-op ("leave the line alone") instead.
 */
let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}

const noop = {
  computeIndents: (lines) => ({ depths: lines.map(() => null), after: lines.map(() => 0) }),
  formatCast: (text) => text,
  indentFor: () => null,
  indentPrefix: () => "",
  indentString: () => "",
};

module.exports = {
  computeIndents: core ? core.computeIndents : noop.computeIndents,
  formatText: core ? core.formatCast : noop.formatCast,
  indentFor: core ? core.indentFor : noop.indentFor,
  indentPrefix: core ? core.indentPrefix : noop.indentPrefix,
  indentString: core ? core.indentString : noop.indentString,
};
