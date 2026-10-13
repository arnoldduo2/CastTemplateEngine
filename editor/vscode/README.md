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
- **Snippets** (in PHP files): `ccomp`, `ccomp1`, `cslot`, `cprop`, `cfor`, `cif`, `cpage`, `cinc`, `cmod`, and for the `@` syntax `aforeach`, `aforelse`, `aif`, `aifelse`, `afor`, `awhile`, `aswitch`, `aecho`; in JavaScript `cpagejs` (the `Cast.page({ mount, destroy })` lifecycle).

## Install

The extension ships inside the framework package. In your project:

```bash
php cast editor:install
```

It copies the extension into the extensions folder of every VS Code family editor it finds (VS Code, Insiders, VSCodium, Cursor, Antigravity, Windsurf). Reload the window afterwards.
`--editor=code|insiders|vscodium|cursor|antigravity|windsurf` picks one, `--dir=PATH` installs into any extensions folder, `--uninstall` removes it.
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

## What it does not do (yet)

No diagnostics (an unknown component is not flagged: it may be registered elsewhere), no prop completion, no rename or find-all-usages. Those need a small language server and are planned.

## Develop

```bash
npm install
node test/fetch-grammars.js      # VS Code's own PHP/HTML grammars, used by the tokenisation tests
npm test
```

The grammar is an injection into `text.html.php` (`syntaxes/cast-injection.tmLanguage.json`); the name-to-file rules are in `lib/resolve.js` and mirror `CastTemplateEngine\Compiler::resolve`.
