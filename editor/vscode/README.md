# CastFramework for VS Code

Highlighting and navigation for the views of a [CastFramework](https://github.com/arnoldduo2/CastFramework) app (`*.cast.php`).

- **Colours** for what the Cast engine adds to PHP + HTML: component tags (`<Card>`, `<Btns.Button />`, `</Card>`), `<Slot name="left">`, props
  (`title="Hi <?= $name ?>"`, `total={$p['qty'] + 1}`, `{...$data}`, bare `required`), and components inside `{ }` values (`left={<Badge />}`,
  `{$ok ? <Yes /> : <No />}`). The file stays a normal PHP file, so PHP IntelliSense (Intelephense and others), Emmet and the HTML features keep working.
- **Ctrl+click** (Cmd+click on macOS), **F12** and **hover** on
  - a component tag: opens its file, using the engine's own rules (`<Form.TextInput>` is `form/text-input`, `form/text_input`, `form/TextInput` or `form/textInput`, with `.cast.php`);
  - a view name: `__includes('layouts.header')`, `views('home.home')`, `$this->view('items.items')`;
  - a legacy component: `Component('btns.add-new')`;
  - a module: `__modules('app.app', 'js')` opens `resources/js/app/app.module.js`.

  Hover shows the file and the props the component reads (`$title ??= ...`); for a name with no file it lists the paths it looked for.

- **The engine's `@` syntax** (`@{ $x }`, `@foreach`, `@forelse`, `@if`, `@switch`, `@php` ... ) is coloured too, with the PHP inside its parentheses.
- **Indentation**: _Format Document_, _Format Selection_ and **Cast: Fix indentation** re-indent a view, and `cast.autoIndent` (on by default) keeps it right while you type (Enter, and lines that become `</div>`, `<?php endif ?>`, `@endif`, `@else`). It understands HTML and component tags (also with attributes over several lines), PHP's `if (...): ... endif` syntax, multi-line `<?php ?>` blocks and the `@` directives together, and changes only leading whitespace; `<script>`, `<style>`, `<pre>`, comments and heredocs are left alone. Choose it as the formatter for `.cast.php` if another PHP formatter asks (_Format Document With..._).
- **Snippets** (in PHP files): `aprops`, `apropsext`, `ccomp`, `ccomp1`, `cslot`, `cprop`, `cfor`, `cif`, `cpage`, `cinc`, `cmod`, and for the `@` syntax `aforeach`, `aforelse`, `aif`, `aifelse`, `afor`, `awhile`, `aswitch`, `aecho`; in JavaScript `cpagejs` (the `Cast.page({ mount, destroy })` lifecycle).

## Install

The extension ships inside the framework package. In your project, install both the extension
and the global `cast-language-server` (with a requirements check for Node.js, npm and PHPactor):

```bash
php cast engine:editor-install all
```

Or install just one of the two:

```bash
php cast engine:editor-install extension     # extension only, auto-detects installed editors
php cast engine:editor-install lsp           # global cast-language-server only
```

Pick a specific editor with a boolean flag instead of auto-detecting:

```bash
php cast engine:editor-install extension --cursor
php cast engine:editor-install extension --antigravity-ide --vscode   # multiple at once
```

`php cast engine:editor-update [all|extension|lsp]` and `php cast engine:editor-uninstall [all|extension|lsp]`
follow the same grammar. Reload the editor window afterwards.

`--yes`/`-y` auto-confirms the PHPactor download prompt (for CI/non-interactive use); `--no-phpactor` skips
it; `--dry-run` prints what would happen without changing anything.

The older, extension-only `php cast engine:editor install [--editor=<name>]` still works unchanged.

A packaged `.vsix` (`npm run package`) can also be installed with _Extensions: Install from VSIX..._. A Marketplace release will follow.

### What `engine:editor-install` does

1. **Requirements check**, always run first and printed as a report: PHP ≥ 8.1, Node.js ≥ 18 and npm (both on
   PATH), the required PHP extensions (`mbstring`, `tokenizer`, `phar`, `ctype`, `json`), whether PHPactor's
   phar is already present, and whether the server is already built.
2. **`--dry-run`** stops here and prints the plan instead of doing anything below.
3. **The one interactive question** (skipped for `extension`-only installs, or when PHPactor is already
   present): `Install PHPactor now? [Y/n]`. Blank or `y`/`yes` downloads a pinned, checksum-verified release
   (~4.8 MB) to `editor/server/bin/phpactor.phar`; anything else skips it. This is the only prompt in the
   whole command — everything else is a flag, not a question. It's skipped outright (never asked) when
   `--yes`/`-y` is passed (auto-confirms yes), `--no-phpactor` is passed, or stdin isn't a TTY (CI/non-interactive).
4. **Extension** (for `extension`/`all`): copies the extension into each target editor's extensions folder,
   stages `cast-language-core` as a sibling directory (the extension's `file:../language-core` dependency),
   then runs `npm ci --omit=dev` (or `npm install --omit=dev` with no lockfile) there for
   `vscode-languageclient` — a failure here is non-fatal and only disables live LSP features, not the
   extension's own hand-rolled engine.
5. **LSP** (for `lsp`/`all`, skipped with a warning if Node/npm failed step 1): `npm install`, `npm run build`,
   then `npm install -g` from `editor/server/` so `cast-language-server` resolves from any project afterward.
6. **Summary**: one ✔/!/✘ line per thing attempted.

## Settings

| Setting                             | Default                      |                                                                                                                                                  |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cast.componentsPath`               | `resources/views/components` | Folder(s), relative to the workspace folder. `config/view.php` `'components' => 'ui'` is picked up automatically (relative to the views folder). |
| `cast.viewsPath`                    | `resources/views`            | Where `__includes()` / `views()` names are looked up.                                                                                            |
| `cast.resourcesPath`                | `resources`                  | Where `css/` and `js/` modules are.                                                                                                              |
| `cast.extension`                    | `.cast.php`                  | The extension of view and component files.                                                                                                       |
| `cast.autoIndent`                   | `true`                       | Keep the indentation right while typing in `.cast.php` files (after Enter; lines that become `</div>`, `<?php endif ?>`, `@endif`, `@else`).     |
| `cast.diagnostics`, `cast.propCase` | `hint`, `camel`              | Problems in component tags; how prop names are written when completed.                                                                           |
| `cast.languageServer.enable`        | `true`                       | Enable the `cast-language-server` client.                                                                                                        |
| `cast.languageServer.path`          | `""`                         | Absolute path to `cast-language-server`; empty auto-detects it on PATH.                                                                          |

## Language Server Protocol & Architecture

Since v2.0.0, CastFramework integrates a dedicated TypeScript Language Server (`cast-language-server`).
The extension launches it automatically once it's installed (`php cast engine:editor-install lsp`) and
resolvable on PATH — see `cast.languageServer.enable`/`cast.languageServer.path` below to disable it or
point at a specific binary.

**Precedence (since v3.0.3):** when the LSP client confirms a successful `State.Running` handshake, this
extension's own hover, Go to Definition, completion, Document Links (the Ctrl+click/hover features
described above), and diagnostics-with-quick-fixes step aside and the LSP serves those instead — the two
are never both active for the same capability at once. If the LSP isn't installed, fails to start, or
later stops (crash, or `cast.languageServer.enable` turned off and the window reloaded), this extension's
own engine resumes automatically. The embedded PHP/CSS/JS bridge below, indentation/formatting, and
snippets are always this extension's own — they have no LSP equivalent.

The two share their core logic (component docblock parsing, name resolution, scanning, completion-context
detection) through `cast-language-core` (`editor/language-core/`), a dependency staged locally by the
installer rather than published to npm, instead of keeping two independent copies that could disagree.

- **Strict-Typed `@props` Diagnostics**: Validates `@props { ... }` syntax, prop types, defaults, required parameters, and `extends::` inheritance targets in real time.
- **Diagnostics & Code Actions**: Sub-millisecond syntax error detection, unclosed or mismatched tags, unbalanced directives, and quick fixes.
- **Hover & Go to Definition**: Component docs, prop types/defaults, slot declarations, directives, and the view/legacy-component/module references listed above.
- **Document Links**: Ctrl+click targets for component tags, `extends::` targets, and view/legacy-component/module references.
- **Intelligent Autocompletion**: Component tags with automatically expanded prop snippets, slot completions, and typed attribute completions.
- **Embedded Language Intelligence Bridge**: Injects PHP, CSS, and JS into virtual documents (`cast-embedded:`) allowing full PHP docblocks, type checks, and completions inside echo holes `@{ ... }`, `@css(...)`, and `@script(...)` — not gated by LSP precedence (see above).

## Develop

```bash
npm install
node test/fetch-grammars.js      # VS Code's own PHP/HTML grammars, used by the tokenisation tests
npm test
```

The grammar is an injection into `text.html.php` (`syntaxes/cast-injection.tmLanguage.json`); the name-to-file rules are in `lib/resolve.js` and mirror `CastTemplateEngine\Compiler::resolve`.
