# Cast LSP Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the LSP a verified superset of the VS Code extension's hand-rolled Cast-native hover, definition, completion, document-links, and diagnostics-with-quick-fixes, then make the extension defer to the LSP for those capabilities whenever it is confirmed running, falling back to its own engine automatically otherwise.

**Architecture:** Portable logic (component docblock parsing, name-resolution helpers, fluent-chain/helper-call scanning, attribute-completion context detection, hover text) moves into `cast-language-core`, shared by both the LSP and the extension's permanent fallback engine. Environment-bound settings (`cast.propCase`, component/view/resource paths, diagnostic severity) are forwarded from the extension to the LSP over the LSP protocol so both hosts resolve identically. Once every gap is closed and tested, the extension tracks the LSP client's lifecycle and gates its own Cast-native providers behind it.

**Tech Stack:** TypeScript 5.7 (`cast-language-core`, `cast-language-server`), plain CommonJS JavaScript (`editor/vscode` extension), `vscode-languageserver`/`vscode-languageclient` 8.1.0, Node 18+.

**Spec:** docs/superpowers/specs/2026-10-17-cast-lsp-precedence-design.md

## Global Constraints

- The extension's hand-rolled engine is never deleted; it is the permanent fallback for installs without Node/the LSP server/Phpactor.
- `EmbeddedHovers`, `EmbeddedCompletions`, `EmbeddedDefinitions`, `EmbeddedDiagnostics`, `EmbeddedInlayHints`, and `Formatter` are never gated by this plan.
- `FunctionDirectiveHovers` and scope-aware embedded-variable definition are client-only VS Code provider bridging; they are excluded from the LSP port entirely, not gated.
- No manual user-facing setting to force one engine over the other; precedence is automatic, based on LSP health.
- `vscode-languageclient` is pinned at `^8.1.0`; `client.start()` returns `Promise<void>`; `client.onDidChangeState` fires `{oldState, newState}` against a `State` enum (`Stopped`/`Starting`/`Running`).
- Portable logic moves into `cast-language-core`; the extension's existing `lib/*.js` files become thin facades over it, the same pattern already established by `lib/indent.js`.
- Settings the LSP needs (`cast.propCase`, `cast.componentsPath`/`viewsPath`/`resourcesPath`/`extension`, `cast.diagnostics`) must be read by the LSP itself via `workspace/configuration`, not hardcoded or assumed.

## Review Focus

- A component with no docblock and no `@props{}` block (plain legacy `$x ??= default` only) must still infer props correctly (`inferred: true`), exactly matching current behavior through the TypeScript port.
- A prop declared in both a docblock and `@props{}`: `@props{}`'s type/required/default/kind must win, but the docblock's own description must survive if `@props{}` didn't supply one.
- `cast.diagnostics: "off"` must fully silence the LSP's newly-ported diagnostics too, not just the extension's — the regression the design's builder-check specifically flagged.
- A docblock prop description listing more than 20 example values must not produce a useless giant completion list (`valuesFromDescription`'s existing `<= 20` cutoff).
- The LSP becoming ready while an extension-engine request is already in flight: the readiness flag must be read fresh per request, never cached across a request's lifetime, so an in-flight extension request never races a mid-flight readiness flip.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| editor/language-core/src/componentSpec/propHelpers.ts | `readType`, `finish`, `newProp`, `splitUnion`, `kindOf`, `stripQuotes`, `camel`, `spell` — pure prop-spec primitives. |
| editor/language-core/src/componentSpec/propsBlock.ts | `parsePropsBlock` for `@props{}`/`@props extends::`, reusing `regions.ts`'s existing `firstMarkupOffset`. |
| editor/language-core/src/componentSpec/docblock.ts | `parseComponent` — docblocks + legacy `??=` + `@props{}`, merged. |
| editor/language-core/src/resolve.ts | `variants`, `resolveComponent`, `resolveLegacyComponent`, `resolveView`, `resolveModule`, `propsOf`, `realFs` — ported from `lib/resolve.js` verbatim (already `fs`-injectable and Node-`fs`-based, usable unchanged by both hosts). |
| editor/language-core/src/scan.ts | `scanHelpers`, `scanChainCalls` — ported from `lib/scan.js`. |
| editor/language-core/src/completionContext.ts | `contextAt` — tag/slot/attribute/value position detection, ported from `lib/complete.js`. |
| editor/language-core/src/hoverText.ts | `BUILTIN_HOVERS`, `ECHO_HOLE_HOVER`, `CHAIN_HOVER` — shared hover markdown. |
| editor/server/src/types.ts | `PropDefinition`/`ComponentMetadata`/`CastDiagnostic` gain fields; new `CastSettings`. |
| editor/server/src/index/projectIndex.ts | Adopts the shared docblock model and resolution helpers; gains settings awareness and legacy/view/module resolution. |
| editor/server/src/diagnostics/diagnostics.ts | Gains the ported diagnostic kinds. |
| editor/server/src/codeActions/codeActions.ts | Rewired to consume the full computed diagnostic set; `fix` becomes `fix[]`. |
| editor/server/src/features/hover.ts | Gains `BUILTIN_HOVERS`/echo-hole/chain hover. |
| editor/server/src/features/definition.ts | Gains prop-declaration jump, legacy/view/module resolution. |
| editor/server/src/features/documentLinks.ts | Gains legacy/view/module link resolution (same gap as Definition — see Task 7). |
| editor/server/src/features/completion.ts | Gains slot/attribute-value/propCase/dedup/prop-kind completion. |
| editor/server/src/server.ts | Settings plumbing (`workspace/configuration`, `workspace/didChangeConfiguration`); passes settings to `ProjectIndex`/providers. |
| editor/vscode/lib/docblock.js, lib/resolve.js, lib/scan.js, lib/complete.js | Become thin facades re-exporting the compiled `cast-language-core` modules, same pattern as `lib/indent.js`. |
| editor/vscode/extension.js | Precedence flag, lifecycle wiring, gating of `Hovers`/`ComponentHovers`/`Definitions`/`PropDefinitions`/`Completions`/`Links`/`publishDiagnostics`/`Fixes`. |

### Task 1: Shared component docblock model

**Files:**
- Create: editor/language-core/src/componentSpec/propHelpers.ts
- Create: editor/language-core/src/componentSpec/propsBlock.ts
- Create: editor/language-core/src/componentSpec/docblock.ts
- Create: editor/language-core/src/test/componentSpec.test.ts
- Modify: editor/language-core/src/index.ts
- Modify: editor/vscode/lib/docblock.js
- Modify: editor/vscode/lib/propsBlock.js (deleted; folded into the shared module — see Step 5)

**Interfaces:**
- `PropSpec`: `{ name: string; type: string | null; description: string; required: boolean; default: string | null; values: string[]; kind: 'bool' | 'number' | 'string' | 'other'; deprecated: boolean | string; inferred: boolean }`
- `SlotSpec`: `{ name: string; description: string }`
- `ComponentSpec`: `{ description: string; props: PropSpec[]; slots: SlotSpec[]; examples: string[]; deprecated: boolean | string; extends?: string }`
- `parseComponent(source: string): ComponentSpec`
- `camel(name: string): string`
- `spell(name: string, style: 'camel' | 'kebab' | 'snake'): string`

- [ ] **Step 1: Write failing parity tests against the existing JS fixtures**

```ts
import { parseComponent, camel, spell } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('matches the legacy lib/docblock.js output on every tests/fixtures/components case', () => {
  const dir = path.join(__dirname, '../../../../tests/fixtures/components');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.cast.php'))) {
    const expected = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.cast.php', '.expected.json')), 'utf8'));
    assert.deepEqual(parseComponent(fs.readFileSync(path.join(dir, file), 'utf8')), expected);
  }
});

test('camel/spell match the existing engine camelCasing rules', () => {
  assert.equal(camel('has-label'), 'hasLabel');
  assert.equal(spell('hasLabel', 'kebab'), 'has-label');
  assert.equal(spell('hasLabel', 'snake'), 'has_label');
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/language-core test`
Expected: FAIL — `componentSpec.test.ts` has no module to import yet.

- [ ] **Step 3: Implement `propHelpers.ts`**

Port `readType`, `finish`, `newProp`, `splitUnion`, `stripQuotes`, `kindOf` from `editor/vscode/lib/docblock.js` verbatim (pure functions, no `vscode` or filesystem dependency). Port `camel` from the same file and `spell` from `editor/vscode/extension.js:564-569`.

- [ ] **Step 4: Implement `propsBlock.ts`**

Port `parsePropsBlock`, `closingBrace`, `parseEntries`, `splitEntries` from `editor/vscode/lib/propsBlock.js`. Replace its local `firstMarkupOffset` with the one already exported from `../regions.js` (same algorithm; do not keep a third copy). Import `readType`/`finish`/`newProp` from `propHelpers.ts`.

- [ ] **Step 5: Implement `docblock.ts`**

Port `parseComponent`, `docblocks`, `propFromTag`, `defaults`, `expressionEnd`, `valuesFromDescription` from `editor/vscode/lib/docblock.js`. Import `parsePropsBlock` from `propsBlock.ts` directly (a normal top-level import; the original file used a lazy `require` only to avoid a true circular dependency that no longer exists once `propsBlock.ts` depends on `propHelpers.ts` instead of `docblock.ts`).

- [ ] **Step 6: Export and build**

Add `export { parseComponent, camel, spell } from './componentSpec/docblock.js';` (and the `spell`/`camel` export path, whichever module ends up owning them) to `editor/language-core/src/index.ts`. Run `npm --prefix editor/language-core run build`.

- [ ] **Step 7: Verify parity tests pass**

Run: `npm --prefix editor/language-core test`
Expected: PASS.

- [ ] **Step 8: Make `lib/docblock.js` a thin facade**

Replace its body with `module.exports = require("cast-language-core")` (re-exporting `parseComponent`, `camel`; drop the now-redundant local `splitUnion`/`readType`/`finish`/`newProp` exports only if nothing outside `propsBlock.js` imports them — check call sites first). Delete `editor/vscode/lib/propsBlock.js`'s own parsing body the same way, or delete the file entirely if `docblock.js`'s facade already covers every export `propsBlock.js` provided; update any direct importers of `lib/propsBlock.js` to import from `lib/docblock.js` (or `cast-language-core` directly) instead.

- [ ] **Step 9: Verify and commit**

Run: `npm --prefix editor/language-core test; npm --prefix editor/vscode test`
Expected: all pass, including every existing docblock/propsBlock test unchanged.

```
git add editor/language-core editor/vscode/lib/docblock.js editor/vscode/lib/propsBlock.js
git commit -m "feat(editor): share component docblock parsing via language-core"
```

### Task 2: Shared name-resolution and scanning helpers

**Files:**
- Create: editor/language-core/src/resolve.ts
- Create: editor/language-core/src/scan.ts
- Create: editor/language-core/src/test/resolve.test.ts
- Create: editor/language-core/src/test/scan.test.ts
- Modify: editor/language-core/src/index.ts
- Modify: editor/vscode/lib/resolve.js
- Modify: editor/vscode/lib/scan.js

**Interfaces:**
- `FsLike`: `{ isFile(path: string): boolean; isDir(path: string): boolean }`; `realFs: FsLike`
- `variants(name: string): string[]`
- `resolveComponent(tag: string, componentDirs: string[], ext?: string, fs?: FsLike): { file: string | null; tried: string[] }`
- `resolveLegacyComponent(name: string, componentDirs: string[], ext?: string, fs?: FsLike): { file: string | null; tried: string[] }`
- `resolveView(name: string, viewsDir: string, ext?: string, fs?: FsLike): { file: string | null; tried: string[] }`
- `resolveModule(name: string, type: 'css' | 'js', resourcesDir: string, fs?: FsLike): { file: string | null; tried: string[] }`
- `HelperRef`: `{ kind: 'view' | 'legacy-component' | 'module'; name: string; start: number; end: number; type?: 'css' | 'js' }`; `scanHelpers(src: string): HelperRef[]`
- `ChainRef`: `{ kind: 'chain'; method: 'filter' | 'map'; start: number; end: number }`; `scanChainCalls(src: string): ChainRef[]`

- [ ] **Step 1: Write failing parity tests against the existing `lib/resolve.test.js`/`lib/scan.test.js` cases**

Port the representative assertions already in `editor/vscode/test/*.test.js` for `resolveComponent`/`resolveLegacyComponent`/`resolveView`/`resolveModule`/`scanHelpers`/`scanChainCalls` as `node:test` cases here, using an in-memory fake `FsLike` (no real filesystem) for `resolve.test.ts`.

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/language-core test`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `resolve.ts` and `scan.ts`**

Port `editor/vscode/lib/resolve.js` and the `scanHelpers`/`scanChainCalls` portion of `editor/vscode/lib/scan.js` verbatim (both already pure aside from `node:fs`/`node:path`, which both the LSP's and the extension's Node process provide identically). Do not port `scanComponents` — the LSP already has its own component-tag detection via `CastParser`, and the extension's copy stays extension-only (no consumer needs it shared).

- [ ] **Step 4: Export and build; verify parity tests pass**

Run: `npm --prefix editor/language-core run build; npm --prefix editor/language-core test`
Expected: PASS.

- [ ] **Step 5: Make `lib/resolve.js` and the `scanHelpers`/`scanChainCalls` exports of `lib/scan.js` thin facades**

`lib/resolve.js`: re-export from `cast-language-core`. `lib/scan.js`: keep its own `scanComponents`/`NAME` as-is; re-export `scanHelpers`/`scanChainCalls` from `cast-language-core` instead of keeping a second copy.

- [ ] **Step 6: Verify and commit**

Run: `npm --prefix editor/language-core test; npm --prefix editor/vscode test`
Expected: all pass unchanged.

```
git add editor/language-core editor/vscode/lib/resolve.js editor/vscode/lib/scan.js
git commit -m "feat(editor): share name-resolution and scanning helpers via language-core"
```

### Task 3: LSP settings plumbing

**Files:**
- Create: editor/server/src/settings.ts
- Create: editor/server/src/test/settings.test.ts
- Modify: editor/server/src/server.ts
- Modify: editor/server/src/types.ts
- Modify: editor/vscode/extension.js (`clientOptions`)

**Interfaces:**
- `CastSettings`: `{ propCase: 'camel' | 'kebab' | 'snake'; componentsPath: string[]; viewsPath: string; resourcesPath: string; extension: string; diagnostics: 'hint' | 'warning' | 'off' }`
- `DEFAULT_SETTINGS: CastSettings` (mirrors the extension's own defaults: `propCase: 'camel'`, `componentsPath: ['resources/views/components']`, `viewsPath: 'resources/views'`, `resourcesPath: 'resources'`, `extension: '.cast.php'`, `diagnostics: 'hint'`)
- `resolveSettings(raw: Partial<CastSettings> | undefined): CastSettings` — fills in defaults for any missing key

- [ ] **Step 1: Write failing test**

```ts
test('resolveSettings fills in every default the extension itself uses', () => {
  assert.deepEqual(resolveSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(resolveSettings({ propCase: 'kebab' }), { ...DEFAULT_SETTINGS, propCase: 'kebab' });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; node --test dist/test/settings.test.js`
Expected: FAIL — `settings.ts` doesn't exist.

- [ ] **Step 3: Implement `settings.ts`**

- [ ] **Step 4: Wire `clientOptions.synchronize` in `extension.js`**

Add `configurationSection: 'cast'` (or the client's standard `synchronize: { configurationSection: 'cast' }`) to `clientOptions` in `startLanguageClient` so the LSP receives `workspace/didChangeConfiguration` notifications, and `initializationOptions` carrying the current `cast.*` values read via `vscode.workspace.getConfiguration('cast')` at startup.

- [ ] **Step 5: Wire `connection.onInitialize`/`onDidChangeConfiguration` in `server.ts`**

On `onInitialize`, call `resolveSettings(params.initializationOptions)` and store the result. On `onDidChangeConfiguration`, call `connection.workspace.getConfiguration('cast')`, re-resolve, store, and re-run `projectIndex.indexAll()` plus re-validate open documents (existing diagnostics-refresh path) so a changed `componentsPath`/`propCase` takes effect without a window reload.

- [ ] **Step 6: Verify and commit**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test; npm --prefix editor/vscode test`
Expected: PASS.

```
git add editor/server/src/settings.ts editor/server/src/test/settings.test.ts editor/server/src/server.ts editor/server/src/types.ts editor/vscode/extension.js
git commit -m "feat(lsp): read cast.* settings over the LSP protocol"
```

### Task 4: ProjectIndex adopts the shared model

**Files:**
- Modify: editor/server/src/types.ts
- Modify: editor/server/src/index/projectIndex.ts
- Modify: editor/server/src/test/projectIndex.test.ts (create if it doesn't already exist as a standalone file)
- Modify: editor/server/src/features/hover.ts

**Interfaces:**
- `PropDefinition` gains, additively: `values?: string[]; kind?: 'bool' | 'number' | 'string' | 'other'; deprecated?: boolean | string; inferred?: boolean`. Existing `isNullable`/`isRequired`/`defaultValue`/`description`/`range` fields and their meaning are unchanged.
- `ComponentMetadata.slots` changes type from `string[]` to `SlotSpec[]` (`{ name: string; description: string }`, from `cast-language-core`). `ComponentMetadata` gains `deprecated?: boolean | string; examples?: string[]`.
- `ProjectIndex` gains `resolveLegacyComponent(name: string): { file: string | null; tried: string[] }`, `resolveView(name: string): { file: string | null; tried: string[] }`, `resolveModule(name: string, type: 'css' | 'js'): { file: string | null; tried: string[] }`, backed by Task 2's helpers and Task 3's settings (`componentDirs`, `viewsDir` = settings.viewsPath resolved per workspace root, `resourcesDir` = settings.resourcesPath resolved per workspace root).

- [ ] **Step 1: Write failing tests**

```ts
test('indexFile uses the shared parseComponent, not an ad-hoc regex, and keeps the richer docblock fields', () => {
  const index = new ProjectIndex([fixtureRoot]);
  const meta = index.indexFile(fixtureRoot, path.join(fixtureRoot, 'resources/views/components/btns/button.cast.php'), false)!;
  const label = meta.props.get('variant')!;
  assert.deepEqual(label.values, ['primary', 'secondary', 'ghost']); // from the existing Button fixture's docblock
  assert.equal(meta.slots.some(s => s.name === 'icon'), true); // SlotSpec, not a bare string
});

test('ProjectIndex.resolveLegacyComponent/resolveView/resolveModule resolve against the configured settings', () => {
  const index = new ProjectIndex([fixtureRoot]);
  index.setSettings(resolveSettings({ componentsPath: ['resources/views/components'] }));
  const { file } = index.resolveLegacyComponent('btns.add-new');
  assert.ok(file && file.endsWith('add-new.cast.php'));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: FAIL — `values` is `undefined`, `slots` entries are plain strings, `resolveLegacyComponent` doesn't exist.

- [ ] **Step 3: Replace `indexFile`'s docblock extraction (lines 99-128 today) with a call to `parseComponent`**

Map `ComponentSpec` → `ComponentMetadata`/`PropDefinition`: `description`→`description`, `props[].required`→`isRequired`, `props[].default`→`defaultValue`, `props[].type` plus `optionalType` logic (or simply: `isNullable = (type ?? '').startsWith('?') || splitUnion(type).some(t => /^null$/i.test(t))`) →`isNullable`, and copy `values`/`kind`/`deprecated`/`inferred` straight across. Keep the existing `doc.propsBlock` merge path (it already wins over docblock-only data per the engine's own rule) but make its `isRequired`/`description` interplay match `parseComponent`'s own documented merge rule (Task 1's Review Focus item) exactly, rather than two independently-drifted merge rules.

- [ ] **Step 4: Replace `slots` extraction with `parseComponent`'s own `spec.slots`**

Drop the hand-rolled `<Slot name="...">` tag scan (lines 130-138 today); it duplicates what `@slot` docblock tags already give `parseComponent`, and the Slot *tags* in the component's own body aren't the same thing as its *documented* slots (the extension's `Completions` class already treats them as distinct, per the design's Completion gap list).

- [ ] **Step 5: Add `setSettings`/`resolveLegacyComponent`/`resolveView`/`resolveModule` to `ProjectIndex`**

`setSettings(settings: CastSettings): void` stores it and triggers re-index (same as `onDidChangeConfiguration`'s call in Task 3). The three resolve methods compute `componentDirs`/`viewsDir`/`resourcesDir` per workspace root from `this.workspaceRoots` + the stored settings, and delegate to Task 2's `resolveLegacyComponent`/`resolveView`/`resolveModule`.

- [ ] **Step 6: Fix the one `hover.ts` consumer of the now-changed `slots` type**

`editor/server/src/features/hover.ts`'s `getComponentHover` loop (`for (const slot of meta.slots) ... <Slot name="${slot}">`) becomes `for (const slot of meta.slots) ... <Slot name="${slot.name}">`.

- [ ] **Step 7: Verify and commit**

Run: `npm --prefix editor/language-core test; npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: PASS.

```
git add editor/server/src/types.ts editor/server/src/index/projectIndex.ts editor/server/src/features/hover.ts editor/server/src/test
git commit -m "feat(lsp): ProjectIndex adopts the shared docblock and resolution model"
```

### Task 5: Diagnostics parity and quick-fix rewiring

**Files:**
- Modify: editor/server/src/types.ts
- Modify: editor/server/src/diagnostics/diagnostics.ts
- Modify: editor/server/src/codeActions/codeActions.ts
- Modify: editor/server/src/test/diagnostics.test.ts (create if none exists)

**Interfaces:**
- `CastDiagnostic.fix` changes from a single object to `fix?: { title: string; newText: string; range: Range }[]`.
- `DiagnosticsManager.getFastDiagnostics(doc: CastDocument, settings: CastSettings): CastDiagnostic[]` (gains the `settings` parameter for `diagnostics: 'off'`/severity).
- `CodeActionsManager.getCodeActions(doc: CastDocument, params: CodeActionParams, diagnostics: CastDiagnostic[]): CodeAction[]` (gains the `diagnostics` parameter — the full computed set, not `doc.diagnostics`).

- [ ] **Step 1: Write failing tests, one per ported kind plus the settings/rewiring fixes**

```ts
test('diagnostics: "off" silences every LSP-computed diagnostic, not just parser errors', () => {
  const diagnostics = manager.getFastDiagnostics(docWithMissingProp, { ...DEFAULT_SETTINGS, diagnostics: 'off' });
  assert.deepEqual(diagnostics, []);
});

test('unknown prop name gets a suggestion and a quick fix that renames it', () => {
  const diagnostics = manager.getFastDiagnostics(docWithTypoedProp, DEFAULT_SETTINGS);
  const d = diagnostics.find(d => d.code === 'unknown-prop')!;
  assert.match(d.message, /did you mean/i);
  assert.equal(d.fix![0].newText, 'label'); // suggested spelling
});

test('invalid enum value gets one quick fix per allowed value', () => {
  const diagnostics = manager.getFastDiagnostics(docWithBadValue, DEFAULT_SETTINGS);
  const d = diagnostics.find(d => d.code === 'invalid-value')!;
  assert.equal(d.fix!.length, 3); // matches the prop's declared `values.length`
});

test('CodeActionsManager offers a fix for a diagnostic getFastDiagnostics computed, not just one CastParser already had', () => {
  const diagnostics = manager.getFastDiagnostics(docWithMissingProp, DEFAULT_SETTINGS);
  const actions = codeActions.getCodeActions(doc, paramsAt(diagnostics[0].range), diagnostics);
  assert.ok(actions.length > 0);
});
```

Add one test per remaining ported kind (`deprecated`, `deprecated-prop`, `missing-key`, `mixed-echo-style`, `props-legacy-conflict`), each asserting the exact message/code/fix shape the extension's `editor/vscode/lib/complete.js` `diagnose()` already produces for the same input (reuse its fixtures as the source of truth).

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: FAIL for every new kind; `fix` type errors on the array assertions.

- [ ] **Step 3: Port each diagnostic kind from `lib/complete.js`'s `diagnose()` into `getFastDiagnostics`**

Each kind's detection logic ports directly (it's pure text/AST analysis over `doc`/`CastDocument`, already available on the LSP side); only the diagnostic *construction* changes shape (`CastDiagnostic` fields instead of the extension's own `{start, end, kind, severity, ...}` shape). Add the `settings` parameter; when `settings.diagnostics === 'off'`, return `[]` immediately; otherwise map `settings.diagnostics` (`hint`/`warning`) onto the severity of kinds the extension currently treats as hints (component-tag issues), leaving parser-sourced structural errors at their existing `Error` severity unconditionally (matches the extension's own `SEVERITY` map, which only ever downgrades component-tag diagnostics, never structural ones).

- [ ] **Step 4: Rewire `CodeActionsManager.getCodeActions`**

Change its loop from `doc.diagnostics` to the new `diagnostics` parameter, and from `diag.fix && ...` to `for (const fix of diag.fix ?? [])`, emitting one `CodeAction` per fix. Update `server.ts`'s `connection.onCodeAction` handler to compute (or reuse already-computed) diagnostics for the document and pass them through.

- [ ] **Step 5: Verify and commit**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: PASS.

```
git add editor/server/src/types.ts editor/server/src/diagnostics editor/server/src/codeActions editor/server/src/server.ts editor/server/src/test
git commit -m "feat(lsp): port remaining Cast diagnostics and fix quick-action wiring"
```

### Task 6: Hover parity

**Files:**
- Modify: editor/server/src/features/hover.ts
- Modify: editor/server/src/test/features.test.ts
- Modify: editor/vscode/extension.js (`Hovers` reads from the shared table instead of its own literal)

**Interfaces:**
- `HoverProvider.getHover` gains three checks, each returning the shared markdown from `cast-language-core`'s `hoverText.ts`: an exact-word match against `BUILTIN_HOVERS`, a `@{` immediately followed by `{` check against `ECHO_HOLE_HOVER`, and a `scanChainCalls` match against `CHAIN_HOVER.filter`/`CHAIN_HOVER.map`.

- [ ] **Step 1: Create `hoverText.ts` and write failing tests**

Copy `BUILTIN_HOVERS`, the `@{ }` hover string, and the two chain-hover strings verbatim from `editor/vscode/extension.js:109-124,147,154-156` into `editor/language-core/src/hoverText.ts`.

```ts
test('hover on a builtin like handleEvent returns the shared markdown', () => {
  const doc = parser.parse('file:///view.cast.php', '@script(handleEvent("click", ".btn", () => {}))');
  const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'handleEvent'));
  assert.match((hover!.contents as any).value, /Registers a delegated event listener/);
});

test('hover on a fluent .map() in a chain explains the chain, not a generic directive', () => {
  const doc = parser.parse('file:///view.cast.php', '<p>@$items.filter(($i) => $i.active).map(($i) => $i.name)</p>');
  const hover = hoverProvider.getHover(doc, positionOfWord(doc.text, 'map'));
  assert.match((hover!.contents as any).value, /fluent chain/);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; node --test dist/test/features.test.js`
Expected: FAIL — `HoverProvider.getHover` returns `null` for both.

- [ ] **Step 3: Implement the three checks in `HoverProvider.getHover`**

Insert them before the existing directive/component/props checks (same ordering `Hovers.provideHover` in `extension.js` already uses: builtin word → echo-hole → chain → existing lookups), using `scanChainCalls` from Task 2 for the chain check.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: PASS.

```
git add editor/language-core/src/hoverText.ts editor/server/src/features/hover.ts editor/server/src/test editor/vscode/extension.js
git commit -m "feat(lsp): port builtin, echo-hole, and fluent-chain hover"
```

### Task 7: Definition and Document Links parity

**Files:**
- Modify: editor/server/src/features/definition.ts
- Modify: editor/server/src/features/documentLinks.ts
- Modify: editor/server/src/test/features.test.ts

**Interfaces:**
- `DefinitionProvider.getDefinition` gains: prop-attribute → declaration-line jump (using `ComponentMetadata.props.get(name)?.range`, already populated where available), and legacy `Component()`/`view()`/module reference resolution via the `ProjectIndex` methods Task 4 added.
- `DocumentLinksProvider.getDocumentLinks` gains the same legacy `Component()`/`view()`/module reference resolution — this closes a gap the design doc did not originally list (discovered while implementing Task 4/5's shared resolution path: document links was never actually at full parity with the extension's `references()`, only with its component-tag and `extends::` subset).
- Both providers share one new private helper, `nonComponentReferences(doc: CastDocument): { kind: 'legacy-component' | 'view' | 'module'; range: Range; file: string | null }[]`, built from `scanHelpers` (Task 2) + `ProjectIndex`'s new resolve methods (Task 4), placed in a small shared module (e.g. `editor/server/src/index/references.ts`) both providers import — do not duplicate the scan-and-resolve loop in both files.

- [ ] **Step 1: Write failing tests**

```ts
test('go-to-definition on a component attribute jumps to its declaration line, not the component file start', () => {
  const doc = parser.parse('file:///view.cast.php', '<Button variant="primary" />');
  const def = definitionProvider.getDefinition(doc, positionOfWord(doc.text, 'variant'))!;
  assert.notDeepEqual((def as Location).range, Range.create(0, 0, 0, 0));
});

test('go-to-definition resolves a legacy Component() call', () => {
  const doc = parser.parse('file:///view.cast.php', "<?= Component('btns.add-new') ?>");
  const def = definitionProvider.getDefinition(doc, positionOfWord(doc.text, 'btns.add-new'));
  assert.ok(def);
});

test('document links include a legacy Component()/view()/module reference, same as a component tag', () => {
  const doc = parser.parse('file:///view.cast.php', "<?php __includes('layouts.header'); ?>");
  const links = documentLinksProvider.getDocumentLinks(doc);
  assert.equal(links.length, 1);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; node --test dist/test/features.test.js`
Expected: FAIL — attribute definition still returns `(0,0)`; legacy/view/module cases return nothing.

- [ ] **Step 3: Implement `references.ts`, then wire both providers**

`nonComponentReferences` runs `scanHelpers` over `doc.text`, resolves each via the matching `ProjectIndex` method, and returns ranges computed from each ref's `start`/`end` offsets. `DefinitionProvider.getDefinition` adds a branch finding the attribute under the cursor and returning `Location.create(meta.fsPath, prop.range)` when it has one, then a branch consulting `nonComponentReferences`. `DocumentLinksProvider.getDocumentLinks` appends `nonComponentReferences`' resolved entries as `DocumentLink`s, same tooltip convention as its existing ones.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: PASS.

```
git add editor/server/src/index/references.ts editor/server/src/features/definition.ts editor/server/src/features/documentLinks.ts editor/server/src/test
git commit -m "feat(lsp): port prop-declaration, legacy/view/module definition and document links"
```

### Task 8: Completion parity

**Files:**
- Modify: editor/server/src/features/completion.ts
- Modify: editor/server/src/test/features.test.ts

**Interfaces:**
- `CompletionProvider.getCompletions` routes through `contextAt` (Task 2, ported from `lib/complete.js`) for component-tag-adjacent positions (`tag`/`slot`/`attribute`/`value`), replacing `findComponentTagContext`'s line-span heuristic.
- Slot completion lists `parent.slots` (now `SlotSpec[]`, Task 4) instead of the generic `<Slot name="...">` snippet.
- Attribute completion reads `settings.propCase` (Task 3) via a `CastSettings` now passed into `CompletionProvider`'s constructor or `getCompletions`, dedupes against attributes already on the tag (from `context.used`, mirroring `contextAt`'s existing `usedNames` computation), and branches on `prop.kind` for bool/string/other snippet shape exactly as `extension.js:664-680` does.
- Value completion (new `context.type === 'value'` branch) offers `prop.values` (or `['true','false']` for `kind === 'bool'`) as `CompletionItemKind.EnumMember` items, quoting matched to `context.quoted`.

- [ ] **Step 1: Write failing tests**

```ts
test('slot completion inside a known parent component lists only its declared slots, with descriptions', () => {
  const doc = parser.parse('file:///view.cast.php', '<Card><Slot name="|" /></Card>'); // | = cursor
  const items = completionProvider.getCompletions(doc, cursorPosition);
  assert.deepEqual(items.map(i => i.label), ['icon', 'title']); // Card's actual declared slots
});

test('attribute completion skips an attribute already written on the tag', () => {
  const doc = parser.parse('file:///view.cast.php', '<Button variant="primary" |');
  const items = completionProvider.getCompletions(doc, cursorPosition);
  assert.equal(items.some(i => i.label === 'variant'), false);
});

test('attribute completion spells the name per cast.propCase and snippets by prop kind', () => {
  completionProvider.setSettings({ ...DEFAULT_SETTINGS, propCase: 'kebab' });
  const items = completionProvider.getCompletions(docWithHasLabelProp, cursorPosition);
  const item = items.find(i => i.label === 'has-label')!;
  assert.match((item.insertText as SnippetString).value, /^has-label$/); // bool prop: no value placeholder
});

test('value completion inside an attribute offers the prop\'s declared enum values', () => {
  const doc = parser.parse('file:///view.cast.php', '<Button variant="|" />');
  const items = completionProvider.getCompletions(doc, cursorPosition);
  assert.deepEqual(items.map(i => i.label), ['primary', 'secondary', 'ghost']);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm --prefix editor/server run build; node --test dist/test/features.test.js`
Expected: FAIL — slot completion still generic; used attributes not excluded; propCase ignored; no value-completion branch exists.

- [ ] **Step 3: Implement**

Replace the component-tag-adjacent branch of `getCompletions` with a `contextAt(doc.text, offset)` call; handle its four context types as `extension.js:634-700` does, substituting `ProjectIndex.getComponent`/`CastSettings.propCase`/`spell` (Task 1) for the extension's `lookup`/`config.get("propCase")`/`spell`.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix editor/server run build; npm --prefix editor/server test`
Expected: PASS.

```
git add editor/server/src/features/completion.ts editor/server/src/test
git commit -m "feat(lsp): port slot, attribute-value, propCase, and dedup completion"
```

### Task 9: Precedence switch

**Files:**
- Modify: editor/vscode/extension.js
- Modify: editor/vscode/test/extension.test.js
- Modify: editor/vscode/test/mock-vscode.js

**Interfaces:**
- Module-level `let lspReady = false;` in `extension.js`, exported for tests as part of `module.exports` (or a getter, to avoid tests reaching into module internals — implementer's call).
- `Hovers.provideHover`, `ComponentHovers.provideHover`, `Definitions.provideDefinition`, `PropDefinitions.provideDefinition`, `Completions.provideCompletionItems`, `Links.provideDocumentLinks` each gain a leading `if (lspReady) return undefined;` (or `[]` where that's the provider's empty-result shape).
- `publishDiagnostics` gains a leading `if (lspReady) { collection.set(document.uri, []); return; }`.
- `Fixes.provideCodeActions` gains the same leading check, returning `[]`.

- [ ] **Step 1: Extend `mock-vscode.js` with `State` and a controllable `onDidChangeState`**

Add `State: { Stopped: 1, Starting: 2, Running: 3 }` to the mock's exported `vscode-languageclient`-shaped surface (check how `project()`'s `Module._load` interception currently handles `require("vscode-languageclient/node")` failing outright — per this session's own prior finding, it throws inside the real `vscode-languageclient` package against this mock's incomplete `vscode` surface, so `client` is always falsy in every existing test). Add a seam the tests can use to simulate a constructed, started client: a test-only mock for `vscode-languageclient/node` (e.g. `editor/vscode/test/mock-languageclient.js`, intercepted via the same `Module._load` pattern already used for `vscode` itself) exporting a fake `LanguageClient` whose `start()` returns a controllable promise and whose `onDidChangeState` the test can fire manually.

- [ ] **Step 2: Write failing tests**

```ts
test('the extension\'s own Hovers/Definitions/Completions/Links/diagnostics go quiet once the LSP reports Running', async () => {
  const { providers, vscode, fireLspState } = projectWithFakeLanguageClient({});
  await fireLspState('Running');
  const doc = document('/p/' + VIEW, '@if ($a)\n<p>x</p>\n@endif');
  assert.equal(providers.hover.provideHover(doc, somePosition), undefined);
  assert.equal(providers.definition.provideDefinition(doc, somePosition), undefined);
  assert.deepEqual(providers.completion.provideCompletionItems(doc, somePosition), undefined);
});

test('the extension\'s own engine resumes once the LSP reports Stopped after being Running', async () => {
  const { providers, fireLspState } = projectWithFakeLanguageClient({});
  await fireLspState('Running');
  await fireLspState('Stopped');
  const doc = document('/p/' + VIEW, '@if ($a)\n<p>x</p>\n@endif');
  assert.notEqual(providers.hover.provideHover(doc, somePosition), undefined);
});
```

- [ ] **Step 3: Verify failure**

Run: `node --test editor/vscode/test/extension.test.js`
Expected: FAIL — every gated provider still contributes regardless of LSP state (the flag doesn't exist yet).

- [ ] **Step 4: Implement the flag and gate every listed provider method**

Wire `client.onDidChangeState` in `startLanguageClient` (alongside the existing construction) to set `lspReady = e.newState === State.Running`. Add the leading checks from this task's Interfaces block to each listed method.

- [ ] **Step 5: Verify and commit**

Run: `npm --prefix editor/vscode test`
Expected: PASS, including every test from Tasks 1-8's `editor/server` suite re-run once more as a whole-plan sanity check (`npm --prefix editor/language-core test; npm --prefix editor/server run build; npm --prefix editor/server test; npm --prefix editor/vscode test`).

```
git add editor/vscode/extension.js editor/vscode/test
git commit -m "feat(editor): defer to the LSP for Cast-native capabilities once it is confirmed running"
```

## Plan Self-Review

### Spec coverage

- Shared docblock model: Task 1. Shared resolution/scanning helpers: Task 2. Settings plumbing: Task 3. ProjectIndex adoption: Task 4. Diagnostics parity + quick-fix rewiring: Task 5. Hover parity: Task 6. Definition + Document Links parity: Task 7 (also closes the design doc's own documentLinks.ts over-claim, corrected here). Completion parity: Task 8. Precedence switch: Task 9.

### Type consistency

`PropSpec`/`SlotSpec`/`ComponentSpec` (Task 1), `FsLike`/resolve signatures (Task 2), `CastSettings` (Task 3), `PropDefinition`/`ComponentMetadata`/`CastDiagnostic.fix[]` (Tasks 4-5) are each introduced once and consumed with the same names and shapes by every later task that touches them.

### Review-focus coverage

The five Review Focus cases are covered by Tasks 1, 1, 5, 1 (`valuesFromDescription`'s cutoff ports verbatim), and 9, respectively.
