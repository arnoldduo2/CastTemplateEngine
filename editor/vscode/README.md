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
- **Indentation**: *Format Document*, *Format Selection* and **Cast: Fix indentation** re-indent a view, and `cast.autoIndent` (on by default) keeps it right while you type (Enter, and lines that become `</div>`, `<?php endif ?>`, `@endif`, `@else`). It understands HTML and component tags (also with attributes over several lines), PHP's `if (...): ... endif` syntax, multi-line `<?php ?>` blocks and the `@` directives together, and changes only leading whitespace; `<script>`, `<style>`, `<pre>`, comments and heredocs are left alone. Choose it as the formatter for `.cast.php` if another PHP formatter asks (*Format Document With...*).
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

A packaged `.vsix` (`npm run package`) can also be installed with *Extensions: Install from VSIX...*. A Marketplace release will follow.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `cast.componentsPath` | `resources/views/components` | Folder(s), relative to the workspace folder. `config/view.php` `'components' => 'ui'` is picked up automatically (relative to the views folder). |
| `cast.viewsPath` | `resources/views` | Where `__includes()` / `views()` names are looked up. |
| `cast.resourcesPath` | `resources` | Where `css/` and `js/` modules are. |
| `cast.extension` | `.cast.php` | The extension of view and component files. |
| `cast.autoIndent` | `true` | Keep the indentation right while typing in `.cast.php` files (after Enter; lines that become `</div>`, `<?php endif ?>`, `@endif`, `@else`). |
| `cast.diagnostics`, `cast.propCase` | `hint`, `camel` | Problems in component tags; how prop names are written when completed. |
| `cast.languageServer.enable` | `true` | Enable the `cast-language-server` client. |
| `cast.languageServer.path` | `""` | Absolute path to `cast-language-server`; empty auto-detects it on PATH. |

## Language Server Protocol & Architecture

Since v2.0.0, CastFramework integrates a dedicated TypeScript Language Server (`cast-language-server`).
The extension launches it automatically once it's installed (`php cast engine:editor-install lsp`) and
resolvable on PATH — see `cast.languageServer.enable`/`cast.languageServer.path` below to disable it or
point at a specific binary. Without it, every feature above still works; only the deeper PHP-aware
intelligence (via PHPactor) is unavailable. (A standalone Tree-sitter grammar, `tree-sitter-cast`, also
exists in the repo but isn't wired into the server yet.)

- **Strict-Typed `@props` Diagnostics**: Validates `@props { ... }` syntax, prop types, defaults, required parameters, and `extends::` inheritance targets in real time.
- **Diagnostics & Code Actions**: Sub-millisecond syntax error detection, unclosed or mismatched tags, unbalanced directives, and quick fixes.
- **Intelligent Autocompletion**: Component tags with automatically expanded prop snippets, slot completions, and typed attribute completions.
- **Embedded Language Intelligence Bridge**: Injects PHP, CSS, and JS into virtual documents (`cast-embedded:`) allowing full PHP docblocks, type checks, and completions inside echo holes `@{ ... }`, `@css(...)`, and `@script(...)`.

## Develop

```bash
npm install
node test/fetch-grammars.js      # VS Code's own PHP/HTML grammars, used by the tokenisation tests
npm test
```

The grammar is an injection into `text.html.php` (`syntaxes/cast-injection.tmLanguage.json`); the name-to-file rules are in `lib/resolve.js` and mirror `CastTemplateEngine\Compiler::resolve`.
