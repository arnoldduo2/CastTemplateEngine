"use strict";
/**
 * Compatibility facade over cast-language-core's component docblock parser: reads what a component file says
 * about itself (its docblocks, `$prop ??= default` lines, and @props{} blocks). The parsing itself lives in
 * editor/language-core/src/componentSpec so the LSP can share it (see docs/superpowers/specs/
 * 2026-10-17-cast-lsp-precedence-design.md). The PHP reader (src/Support/ComponentDocs.php) produces exactly the
 * same JSON; the fixtures in tests/fixtures/components are the contract between the two.
 */
// The require is guarded the same way lib/indent.js's is: cast-language-core is a file: dependency staged by the
// PHP installer rather than published to npm, so a failed npm install step or a VSIX packaged with
// --no-dependencies must not take the whole extension down at activation - every hover/completion/definition/
// diagnostic along with it, not just component docs. On failure, every export here degrades to a safe stand-in
// instead (camel is cheap enough to vendor inline; the rest return an inert "nothing documented" shape).
let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}

const fallbackCamel = (name) => name.replace(/[-_]+([A-Za-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());

module.exports = core
  ? {
      parseComponent: core.parseComponent,
      camel: core.camel,
      splitUnion: core.splitUnion,
      readType: core.readType,
      finish: core.finish,
      newProp: core.newProp,
    }
  : {
      parseComponent: () => ({ description: "", props: [], slots: [], examples: [], deprecated: false }),
      camel: fallbackCamel,
      splitUnion: (type) => (type ? [type] : []),
      readType: (text) => ({ type: null, rest: text }),
      finish: () => {},
      newProp: (name) => ({ name, type: null, description: "", required: false, default: null, values: [], kind: "other", deprecated: false, inferred: false }),
    };
