# Cast LSP Precedence Design

**Status:** Proposed — design drafted in conversation; implementation plan pending

## Goal

When both the `cast-language-server` LSP and the VS Code extension's own hand-rolled Cast-native providers are installed, the LSP is authoritative. The extension contributes nothing for the capabilities the LSP owns while the LSP is confirmed running, and falls back to its own engine automatically — with no user-visible gap — when the LSP isn't installed, fails to start, or later stops.

This is conditioned on a prerequisite that does not hold today: the LSP must actually be a superset of what the extension's own engine already does. It currently isn't, in most of the capability areas this design covers (document links are already at parity). Closing that gap is most of this design's scope; the precedence switch itself is comparatively small.

## Current problem

Both `editor/vscode/extension.js` and `editor/server/src/` independently implement Cast-native hover, go-to-definition, completion, and diagnostics-with-quick-fixes for the same `.cast.php` files. They are registered with VS Code simultaneously and unconditionally. For hover and completion this merely duplicates work (VS Code composes multiple providers' results). For diagnostics it means two collections of warnings can appear for the same problem. There is no mechanism today for one to defer to the other, and — found during this design's own research — the LSP side is missing substantial coverage the extension side already has, so a naive "just gate the extension off" would regress real, currently-working functionality the moment the LSP is active.

This is a continuation of the problem the `2026-10-17-cast-language-intelligence` plan (already shipped) solved for PHP/CSS/JS embedded regions: two independently-maintained descriptions of Cast behavior drift apart. That plan fixed the embedded-language and syntax-model side. This design fixes the Cast-native (component/directive/prop) side the same way, plus adds the precedence mechanism neither plan needed before now.

## Scope

### Included

- Porting every capability gap found between the extension's Cast-native engine and the LSP's equivalent, across hover, go-to-definition, completion, and diagnostics+quick-fixes, so the LSP becomes a verified superset.
- Moving the *portable* logic within those gaps into `cast-language-core`, shared by both the LSP and the extension's fallback engine, matching the precedent already set by `regions.ts`/`indent.ts`.
- **Moving component docblock parsing (`editor/vscode/lib/docblock.js`) into `cast-language-core` too**, and refactoring the LSP's `ComponentMetadata`/`PropDefinition` (`editor/server/src/types.ts`) and every consumer that depends on their current simpler shape (`hover.ts`, `completion.ts`, `documentLinks.ts`, `ProjectIndex`) onto the richer model `docblock.js` already produces (prop `values`/`kind`/`deprecated`/`inferred`/`default`/`description`, `slots` with descriptions, `examples`, component-level `deprecated`). Nearly every hover/completion/diagnostics gap below depends on fields the LSP's current model doesn't carry at all — this is confirmed necessary, not optional, once discovered; see Risks.
- Settings plumbing: the extension forwards `cast.propCase`, `cast.componentsPath`/`viewsPath`/`resourcesPath`/`extension`, and `cast.diagnostics` to the LSP (`workspace/configuration`, re-indexing/re-validating on `workspace/didChangeConfiguration`), so `propCase`-aware completion, custom component-folder discovery (including `config/view.php`'s override), and the diagnostics hint/warning/off switch all port with full fidelity rather than becoming a parity gap of their own.
- Reimplementing the *environment-bound* logic (legacy `Component()`/`view()`/module-path resolution; workspace-folder-aware project indexing) on the LSP side independently, matching the extension's existing behavior, since each host resolves paths differently and can't share that part.
- A precedence mechanism in the extension: once the LSP's initialize handshake completes, the extension's own Hover/Definition/Completion/Diagnostics-and-Fixes providers stop contributing; if the LSP later reports itself stopped (crash, manual disable), they resume.

### Excluded

- Deleting or deprecating the extension's hand-rolled Cast-native engine. It is the permanent fallback for installs without Node/the LSP server/Phpactor, not legacy code being phased out. This design keeps it correct via shared logic, not obsolete.
- Any change to PHP/CSS/JS embedded-region behavior (`EmbeddedHovers`, `EmbeddedCompletions`, `EmbeddedDefinitions`, `EmbeddedDiagnostics`, `EmbeddedInlayHints`) — these have no LSP equivalent by design (the client owns querying installed CSS/JS providers) and are never gated.
- **Builder-check correction:** `FunctionDirectiveHovers` (bridging `@route`/`@htchars`/`@cast`/`@csrf`/`@alerts`/`@modules` to the real PHP function's own docblock via VS Code's installed PHP hover provider) and the scope-aware embedded-variable definition inside `@foreach`/`@map` bodies are the same kind of client-side bridging as `Embedded*` above — they work by querying an installed VS Code language feature against a virtual document, which only the client can do. They are not Cast-native gaps to port into the LSP; both are excluded from the port list below and from gating, for the same reason `Embedded*` is. (This also narrows the Phpactor-dependency risk: none of the four *gated* capability groups depend on Phpactor at all — PHP delegation already has its own, separately-shipped precedence mechanism in `editor/server/src/server.ts`, unrelated to this design.)
- Formatting — already resolved in the language-intelligence plan's review fix pass (the extension's `Formatter` only registers when no LSP client started).
- The Tree-sitter grammar.
- A manual user-facing setting to force one engine over the other. Precedence is automatic, based on LSP health. (This is the author's call, not something discussed with the human partner; revisit if it turns out to matter.)

## Capability gaps found (LSP must close these before gating)

Found via direct comparison of `editor/vscode/extension.js` against `editor/server/src/features/*.ts`.

**Diagnostics** (`editor/server/src/diagnostics/diagnostics.ts` vs. `editor/vscode/lib/complete.js`'s `diagnose()`): the LSP only checks `missing-prop` (required prop) and whatever `CastParser` already surfaces structurally. Missing: `unknown` (typo'd prop name + suggestion), `value` (invalid enum value + suggestions), `deprecated`/`deprecated-prop`, `missing-key`, `mixed-echo-style`, `props-legacy-conflict`. **Builder-check correction:** quick fixes do *not* come for free as originally claimed here — `CodeActionsManager.getCodeActions` reads `doc.diagnostics` (the parser's own structural output), not `DiagnosticsManager.getFastDiagnostics()`'s result (a separate array that starts from `doc.diagnostics` and appends the computed ones, e.g. `missing-prop`) — so even today's one ported diagnostic's `.fix` never reaches a code action. Porting diagnostics must also rewire `CodeActionsManager` to consume the full computed diagnostic set. Separately, `CastDiagnostic.fix` is a single object, but the extension's `value` diagnostic offers one action *per* allowed value — `fix` likely needs to become `fix[]` (or the single-fix shape needs a documented reason to stay, dropping the alternatives) to port that case faithfully.

**Hover** (`HoverProvider` vs. `Hovers`/`ComponentHovers`/fluent-chain hover in `extension.js`): missing `BUILTIN_HOVERS` (`handleEvent`, `Cast.on`/`update`/`refresh`/`onLoad`, `@script`/`@js`/`@scripts`/`@styles`, `@map`/`@filter`, `return(...)`/`@render(...)`), `@{ }` echo-hole hover text, and fluent `.filter()/.map()` chain hover. (`FunctionDirectiveHovers` and call-wrapped named-argument hover are client-bridging, not a port gap — see Excluded.)

**Definition** (`DefinitionProvider` vs. `Definitions`/`PropDefinitions`): missing prop-attribute → declaration jump, legacy `Component('name')` call resolution, `view('name')` helper resolution, and module-reference resolution. (Scope-aware embedded-variable definition is client-bridging, not a port gap — see Excluded.)

**Completion** (`CompletionProvider` vs. `Completions`): missing slot-name completion (aware of the parent component's actually-declared slots, not a generic snippet), attribute-value completion for enum/bool props, `cast.propCase` (camel/kebab/snake)-aware attribute spelling, dedup of already-used attributes on the current tag, and prop-kind-aware (string vs. expression) snippet insertion for required props.

## Architecture

```text
cast-language-core (shared, portable)
  + existing: regions, indent, source maps, virtual documents
  + new: component docblock parsing (replaces lib/docblock.js's own
    copy), hover text/rules, fluent-chain scanning, propCase
    spelling, value-completion rules
        |
        +--> cast-language-server (editor/server)
        |      ComponentMetadata/PropDefinition (types.ts) adopt the
        |      shared docblock model; hover.ts/completion.ts/
        |      documentLinks.ts/ProjectIndex updated to match.
        |      ProjectIndex also gains legacy Component()/view()/
        |      module resolution (environment-bound, LSP-side only)
        |      and settings plumbing (workspace/configuration) for
        |      propCase/componentsPath/viewsPath/resourcesPath/
        |      extension/diagnostics
        |
        +--> VS Code extension (editor/vscode)
               lib/docblock.js becomes a thin re-export of the shared
               parser (same facade pattern as lib/indent.js today);
               lib/resolve.js, lib/components.js, etc. stay as the
               environment-bound fallback implementation
```

### Precedence mechanism

- `extension.js` tracks a module-level readiness flag, set from the LSP client's lifecycle, not assumed at registration time:
  - `false` until `client.start()`'s returned promise resolves (full initialize handshake, not just "binary found" — the same signal already proven insufficient for the formatter conflict in the prior plan's review).
  - Also wired to `client.onDidChangeState`, so a later `Stopped` transition (crash, manual stop) flips it back to `false` and the extension's own engine resumes without a reload.
- Each gated provider method (`Hovers.provideHover`, `ComponentHovers.provideHover`, `Definitions.provideDefinition`, `PropDefinitions.provideDefinition`, `Completions.provideCompletionItems`) checks the flag at call time and returns no contribution (`undefined`/`[]`) when the LSP is ready, rather than being conditionally registered once at `activate()` time — call-time checking is immune to the registration-vs-readiness timing race (the LSP takes longer than one event loop tick to become ready).
- **Builder-check addition:** `Links.provideDocumentLinks` gets the same treatment — the LSP already advertises `documentLinkProvider: true` (`server.ts`) and was missing from the original gating list, which would have left duplicate document links exactly like the diagnostics-duplication problem this design exists to fix.
- `publishDiagnostics` checks the flag before computing anything; when ready, it actively clears (`collection.set(uri, [])`) rather than leaving stale diagnostics from before readiness.
- `Fixes.provideCodeActions` naturally stops producing anything once `publishDiagnostics` stops attaching `.cast`-tagged diagnostic data — no separate gating needed there, but add the same explicit flag check for clarity and to guard against a future diagnostic source reusing the same shape.
- `EmbeddedHovers`, `EmbeddedCompletions`, `EmbeddedDefinitions`, `EmbeddedDiagnostics`, `EmbeddedInlayHints`, and the (already-conditional) `Formatter` are untouched by this flag.

## Risks and decisions

- Porting the capability gaps, unifying the docblock model, and adding settings plumbing together are the majority of this design's real cost; the precedence switch itself is cheap by comparison. Sequencing (which gap gets ported first, whether in one plan or several) is left to the implementation plan.
- The docblock-model unification is a confirmed-necessary refactor, not an optional nice-to-have: discovered during builder-check that nearly every hover/completion/diagnostics gap depends on fields (`values`, `kind`, `deprecated`, descriptions, `examples`) the LSP's current `ComponentMetadata`/`PropDefinition` don't carry. Every existing consumer of those types (`hover.ts`, `completion.ts`, `documentLinks.ts`, `ProjectIndex`) needs to be re-verified against the richer shape, not just the net-new gap code — size this as its own set of tasks in the plan, early, since everything else depends on it.
- Settings plumbing (`workspace/configuration`, re-index/re-validate on `workspace/didChangeConfiguration`) is new protocol surface the LSP doesn't have today; confirm the exact `vscode-languageclient`/`vscode-languageserver` APIs for pull-configuration and change notification before committing to a task breakdown.
- `vscode-languageclient` is pinned at `^8.1.0`; `client.start()` returns `Promise<void>` and `client.onDidChangeState` fires `{oldState, newState}` against a `State` enum (`Stopped`/`Starting`/`Running`) — confirm these exact shapes still hold for the installed version before relying on them.
- During the handshake window after a document opens but before the LSP is confirmed ready, both engines can briefly contribute. This is accepted as normal startup behavior, not a bug to engineer away.
- Legacy `Component()`/`view()`/module-path resolution requires extending the LSP's `ProjectIndex` to do workspace-folder-aware resolution the extension's `lib/resolve.js` already does; the two will necessarily remain separate implementations (see Scope/Excluded) but must be behaviorally verified against the same fixtures.
