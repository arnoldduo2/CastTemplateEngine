# CastTemplateEngine

React-style components on top of native PHP templates.

Your templates stay plain PHP: `<?php foreach ?>`, `<?php if ?>`, `<?= ?>` work exactly as they always did.
CastTemplateEngine only adds a few things on top: component tags, children, named slots, and
`{expression}` props, so views are shorter and easier to read.

```php
<Layouts.Main title="Invoices">
    <KpiCard title="Open" has_label>
        <?php foreach ($invoices as $inv): ?>
            <Form.TextInput name={"amount-{$inv['id']}"} value={$inv['amount']} required />
        <?php endforeach ?>
    </KpiCard>
</Layouts.Main>
```

- No dependencies. PHP 8.1 or newer.
- Templates compile to plain PHP once and are cached.
- Files that don't use the syntax are never touched.

## Contents

- [Install](#install)
- [Setup](#setup)
- [Writing components](#writing-components)
- [Declaring props with @props](#declaring-props-with-props)
- [Component Inheritance](#component-inheritance)
- [Syntax rules](#syntax-rules)
- [Reactive Scripts & Event Handling](#reactive-scripts--event-handling)
- [Scoped CSS & Dynamic Variables](#scoped-css--dynamic-variables)
- [Component Assets & Bundler](#component-assets--bundler)
- [Language Server & Tree-Sitter](#language-server--tree-sitter)
- [Escaping](#escaping)
- [Caching and errors](#caching-and-errors)
- [Terminal Commands & CLI](#terminal-commands--cli)
- [Documentation Snippets List](#documentation-snippets-list)
- [Limitations](#limitations)
- [Wiring it into an app](#wiring-it-into-an-app)
- [Coming from `useComponent()`](#coming-from-usecomponent)
- [Tests and versioning](#tests-and-versioning)

## Install

```bash
composer require anode/cast-template-engine
```

Until the package is listed on Packagist, install it straight from GitHub by adding this to your
`composer.json` first:

```json
"repositories": [
    { "type": "vcs", "url": "https://github.com/arnoldduo2/CastTemplateEngine" }
]
```

and then run `composer require anode/cast-template-engine:^2.0`.

## Setup

```php
use CastTemplateEngine\CastTemplate;

$cast = new CastTemplate(
    __DIR__ . '/views/components',   // 1. components folder
    '.cast.php',                     // 2. extension of files that can use the syntax (default)
    [                                // 3. options
        'viewsDir'      => __DIR__ . '/views',
        'cacheDir'      => __DIR__ . '/storage/cache',
        'checkModified' => true,
        'shared'        => ['assets' => '/public/assets'],
    ]
);

echo $cast->render('pages.invoice', ['invoice' => $invoice]);   // views/pages/invoice.cast.php
```

### Constructor arguments

| Argument | Default | Meaning |
| --- | --- | --- |
| `$componentsDir` | (required) | Folder with the component files. A relative path is resolved against `viewsDir`. |
| `$ext` | `.cast.php` | Extension of files that may use the engine syntax. It must start with a dot. Only files with this extension are compiled or looked up. A plain `foo.php` is never touched. |
| `$options` | `[]` | See below. An unknown key throws a `TemplateError`, so typos fail loudly. |

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `viewsDir` | none | Folder of the views you pass to `render()`. Required to call `render()`. |
| `cacheDir` | `<system temp>/cast-<hash>` | Where compiled files are written. Set it to a folder only your app can write: compiled files are PHP code. |
| `checkModified` | `true` | Recompile when the source file changed. Set `false` in production for slightly faster requests. Clear the cache folder when you deploy. |
| `shared` | `[]` | Variables available in every view and every component (a base URL, a user, ...). Explicit data and props win over shared values. Keys are used as written (not camelCased). |

### Rendering

`render($view, $data = [])` returns the HTML as a string. `$view` is relative to `viewsDir`,
without the extension. Dots or slashes both work: `pages.invoice` is `pages/invoice.cast.php`.

## Writing components

A component is a plain PHP file in the components folder, with the configured extension. Its props
arrive as variables:

```php
<?php // views/components/kpi-card.cast.php
$title ??= 'KPI';        // defaults are plain PHP
$hasLabel ??= false;
?>
<div class="kpi">
    <?php if ($hasLabel): ?><label><?= e($title) ?></label><?php endif ?>
    <div class="body"><?= $children ?></div>
</div>
```

- **Variables:** every prop is a variable (`$title`, `$hasLabel`). `$props` holds them all as an array.
- **`$children`:** the HTML written between the opening and closing tags (`''` if there is none).
- **Prop names are camelCased.** `has_label`, `has-label` and `hasLabel` all arrive as `$hasLabel`.
  This also applies to keys of a spread array. Use camelCase inside component files.
- **Echo or return:** a component can echo HTML or `return` a string. Both work. A component always
  renders to a string, so you never need a flag to get it "as a variable".
- **Scope:** each component runs in its own scope. Page variables are not visible inside it unless you
  pass them as props or through `shared`.

## Declaring props with @props

Components can declare strictly-typed props at the top of the file using `@props { ... }`:

```php
@props {
    string $title;
    ?int $count = 0;
    string|array $items = [];
    mixed $extra;
}

<div class="card">
    <h3>@{ $title }</h3>
    @if ($count > 0)
        <span>@{ $count } items</span>
    @endif
</div>
```

- **Strict types:** supported types include `string`, `int`, `float`, `bool`, `array`, `object`, `iterable`, `callable`, `mixed`.
- **Nullable & Unions:** `?string`, `int|string`, `?array`.
- **Defaults:** `$name = 'default';`. A prop without a default value is **required**; passing no value or omitting it results in a compile/runtime check.
- **Placement:** `@props` must appear before any HTML markup in the component file.
- **Terminator:** every entry ends with a semicolon `;`. Single-line `//` comments are permitted inside the block.

## Component Inheritance

Components can inherit and extend props from another component using `@props extends::...`:

```php
@props extends::Components.Cards.BaseCard {
    string $subtitle;
    bool $featured = false;
}
```

- The child component automatically receives all props defined in the base component.
- The child can override defaults or define additional props.
- Circular inheritance chains are detected and prevented at compile time.

## Syntax rules

### Component tags

A tag that starts with a capital letter is a component. Dots are folders. The file name can be written
in any of four styles, tried in this order:

| Tag | Files tried in the components folder |
| --- | --- |
| `<KpiCard>` | `kpi-card.cast.php`, `kpi_card.cast.php`, `KpiCard.cast.php`, `kpiCard.cast.php` |
| `<Form.TextInput>` | `form/text-input.cast.php`, `form/text_input.cast.php`, `form/TextInput.cast.php`, `form/textInput.cast.php` |
| `<Badge>` | `badge.cast.php`, `Badge.cast.php`, ... |

Folder names are matched the same way. A tag that looks like a component but has no file is a **compile
error** that lists every path tried. Lowercase tags (`<div>`, `<option>`) are plain HTML.

Tags must be closed: `<Card>...</Card>` or `<Card />`.

### Props

| Syntax | Value |
| --- | --- |
| `title="Sales"` | the string `Sales` |
| `title="Hi <?= $name ?>"` | a string with PHP echoed inside |
| `total={$total}` | any PHP expression: numbers, arrays, objects, closures |
| `name={"qty-{$p['qty']}"}` | a string built in PHP (interpolation) |
| `name={'qty-' . $p['qty']}` | a string built in PHP (concatenation) |
| `required` | `true` |
| `{...$data}` | spread an array of props |
| `left={<Badge text={$x} />}` | the HTML of another component |
| `left={$ok ? <Yes /> : <No />}` | components inside any expression |

Inside `{ }` the engine understands nested braces and PHP strings, so `{"a-{$x}"}` and `{['k' => 'v']}` are
safe. A component written **inside `{ }` must be self-closing** (`<Badge ... />`). For blocks that have
children, use `<Slot>`.

### Children

Anything between the opening and closing tag is rendered first and passed as `$children`. Native PHP
works inside:

```php
<Mobile.Cards.Card>
    <h5>Sales</h5>
    <?php foreach ($rows as $row): ?>
        <p><?= e($row['name']) ?></p>
    <?php endforeach ?>
</Mobile.Cards.Card>
```

### Slots: more than one block of HTML

`<Slot name="x">` is not printed. It takes the HTML written inside it and hands it to the enclosing component
as the prop `x`. Use it when a component needs several blocks of HTML.

```php
<SelectItem right={$p['type']}>
    <Slot name="left">
        <?php foreach ($p['tags'] as $tag): ?>
            <Badge text={$tag} />
        <?php endforeach ?>
    </Slot>
</SelectItem>
```

`select-item.cast.php` receives `$right = 'Stock'` and `$left = '<span...>...</span>'`.

Rules: a `<Slot>` must be placed directly inside a component, its `name` must be a literal string,
and it must have a closing tag. Whatever is outside the slots still becomes `$children`.

**How it works.** The tags compile to:

```php
<?php $this->open('select-item', ['right' => $p['type']]); ?>   // 1
<?php $this->slot('left'); ?>                                   // 2
    ...output of the foreach and Badge...
<?php $this->endSlot(); ?>                                      // 3
<?= $this->close() ?>                                           // 4
```

1. `open` puts the component on a stack and starts output buffering, so what follows is captured instead of printed.
2. `slot` starts a second buffer inside the first.
3. `endSlot` takes everything captured since step 2 and stores it as `props['left']` of the component on top of the stack.
4. `close` takes everything else captured since step 1 as `children`, removes the component from the stack and renders its file.

The stack is what makes nesting work: a slot always belongs to the nearest component around it.

### HTML attributes

On normal HTML tags, `attr={expression}` is written out **escaped**:

| Value | Output |
| --- | --- |
| string or number | `attr="escaped value"` |
| `true` | `attr` (bare attribute) |
| `false` or `null` | the attribute is removed |
| array or `JsonSerializable` | `attr="{json}"` |

This is what makes a component inside an attribute safe, whatever quotes it uses:

```php
<option value={$p['id']} selected={$p['id'] === $selected}
        data-html={<Badge text={$p['name']} right={$p['qty']} />}>
    <?= e($p['name']) ?>
</option>
```

Quoted attributes (`class="a <?= $b ?>"`) are plain HTML and are not changed. A component placed inside quotes
(`data-html="<Badge />"`) is a compile error that tells you to use the `{ }` form.

### What the compiler never touches

- `<?php ... ?>` and `<?= ... ?>`
- the content of `<script>` and `<style>`
- `<!-- ... -->` comments
- text, so `{{ }}` for Vue or Alpine is safe

## Escaping

`<?= ?>` stays native PHP, so it prints raw. The package adds one helper for user data:

```php
<?= e($user['name']) ?>
```

`e()` is `htmlspecialchars` with `ENT_QUOTES`, UTF-8. It is defined only if no function called `e` exists yet.
`attr={...}` on HTML tags is escaped automatically. Props passed to a component are raw values: the component
decides how to print them, so escape user data inside the component.

## Caching and errors

- Each template is compiled once and written to `cacheDir`. The write is atomic, so concurrent requests are safe.
- With `checkModified => true` a template is recompiled when its source file is newer than the compiled copy.
- **Compile errors** (unclosed or mismatched tags, unknown component, bad attribute, bad slot) throw
  `CastTemplateEngine\TemplateError` with the file and line number.
- **Runtime errors** keep your source line numbers: compiled code is padded so line `N` of the source is line `N`
  of the compiled file.
- If a template throws, open output buffers and the component stack are cleaned up before the exception continues.

## Limitations

- `<?= ?>` is raw. Escape user data with `e()`.
- Components inside `{ }` must be self-closing.
- `__DIR__` and `__FILE__` point to the cache folder inside compiled templates. Avoid them in `.cast.php` files.
- In a `{ }` expression, a constant written right after `<` (like `{$a <MAX}`) would be read as a component tag if a
  component file with that name exists. Put a space after `<` in comparisons.
- In plain HTML tags, `attr={...}` is the only extra syntax. Event handlers and similar attributes are written as usual.
- The engine does not sandbox templates. They are PHP code: only render templates you trust.

## Wiring it into an app

Create one `CastTemplate` for the whole app and render everything through it. A typical wrapper:

```php
final class View
{
    private static ?CastTemplate $cast = null;

    public static function render(string $view, array $data = []): string
    {
        self::$cast ??= new CastTemplate(
            ROOT . '/src/resources/views/components',
            '.cast.php',
            [
                'viewsDir'      => ROOT . '/src/resources/views',
                'cacheDir'      => ROOT . '/storage/cache/views',
                'checkModified' => APP_DEBUG,
                'shared'        => ['assets' => ASSETS, 'path' => ROOT_PATH],
            ]
        );

        return self::$cast->render($view, $data);
    }
}

echo View::render('pages.invoice', ['invoice' => $invoice]);
```

You can move to it one file at a time: rename a view or component to `.cast.php`, and nothing else changes.

## The `@` shorthand for PHP

Plain PHP works as before (`<?php ... ?>`, `<?= ... ?>`). For loops, conditions and printing there is a shorter form, handled before the component tags:

```php
@for ($i = 0; $i < 10; $i++):
    The current value is @{ $i }                 (same as <?= $i ?>)
@endfor

@foreach ($users as $user):
    <p>This is user @{ $user->id }</p>
@endforeach

@forelse ($users as $user):
    <li>@{ $user->name }</li>
@empty
    <p>No users</p>
@endforelse

@while ($row = next($rows))
    <p>@{ $row }</p>
@endwhile
```

| Write | Becomes |
| --- | --- |
| `@{ expr }` | `<?= expr ?>` (printed as it is, like `<?= ?>`: wrap user text in your escape function) |
| `@for (...):` `@endfor` | `for (...): ... endfor;` |
| `@foreach (...):` `@endforeach` | `foreach (...): ... endforeach;` |
| `@forelse ($list as $item):` `@empty` `@endforelse` | a `foreach` plus an "nothing was looped" block; works with arrays, iterators and generators |
| `@while (...)` `@endwhile` | `while (...): ... endwhile;` |
| `@if (...)` `@elseif (...)` `@else` `@endif` | `if (...): ... elseif (...): ... else: ... endif;` |
| `@unless (...)` `@endunless` | `if (!(...)):` |
| `@isset ($x)` `@endisset` | `if (isset($x)):` |
| `@switch ($n)` `@case (1)` `@default` `@endswitch` | `switch` (the gap between `@switch` and the first `@case` is allowed) |
| `@break` `@continue`, or with a condition `@break($done)` `@continue($skip)` | `break;` `continue;` `if ($done) break;` |
| `@php($n = 5)` and `@php ... @endphp` | one statement, or a block of plain PHP copied as it is |
| `@script(...)` or `@js(...)` | client-side reactive JavaScript captured for component |
| `@scripts` | outputs all collected component scripts and runtime before `</body>` |
| `@css(...)` | scoped component styles with dynamic `@{ ... }` CSS variables |
| `@styles` | outputs all collected component styles in `<head>` |
| `@children` | prints the component's captured body (`$children`), or the literal `empty content` when there was none |
| `@map($items, ($item, $i) => return(<Card key={$i}>...</Card>))` | loops over arrays or `stdClass` objects and renders markup |
| `@$items.map(($item, $i) => (<Card key={$i}>...</Card>))` | method-chaining shorthand on collections |
| `@filter($items, ($item) => condition)` | standalone in-place collection filtering |
| `@filter($items, predicate, mapCallback)` | filters and maps in one call |
| `@$items.filter(...).map(...)` | fluent filter-then-map chain on arrays / objects |
| `@{ $cond ? return(<p>Yes</p>) : @render(<p>No</p>) }` | inline conditional Cast markup inside expressions (`return(...)` and `@render(...)` are aliases) |
| `@@` | a literal `@` |

### Framework-helper directives

A curated whitelist of bare `@name(...)`/`@name` directives, each compiled as an echoed call to a real
function your host framework (not this package) is expected to supply — the same way `@route(...)` compiles
to `<?= route(...) ?>` and trusts Laravel's own `route()` helper. An actual typo still fails loudly at
compile time with "Unknown directive", the same safety `@map`/`@filter`/etc. have.

| Write | Calls |
| --- | --- |
| `@htchars(...)` | `htchars(...)` |
| `@route(...)` | `route(...)` |
| `@cast(...)` or `@cast` | `__cast(...)` / `__cast()` |
| `@csrf` | `__csrf()` |
| `@alerts` | `__getAlerts()` |
| `@modules(...)` | `__modules(...)` |
| `@includes(...)` | `__includes(...)` |

See `CastTemplateEngine\Directives::FUNCTION_DIRECTIVES` to add another framework helper this way.

### Keys and `data-el-key`

Every item rendered in a map or filter should provide a unique `key`:
```php
@map($items, ($item, $i) => return (
    <Card key={$item->id}>
        <p>@{ $item->name }: @{ $item->price }</p>
    </Card>
))
```
- **HTML tags:** `key={$val}` is compiled directly to `data-el-key="{$val}"`.
- **Components:** `key` is received as a prop and attached as `data-el-key` to the root HTML node.
- **Fallback:** If omitted, the engine falls back to `$i` (index) and the compiler/editor issues a diagnostic warning.

## Reactive Scripts & Event Handling

Components can define client-side interactivity directly using `@script(...)` or `@js(...)`. UI components do not need their own JavaScript files, but can pass their reactive logic directly into the view:

```php
<div class="product-item" data-id={$id} data-price={$price}>
    <h3>@{ $title }</h3>
    <button class="add-to-cart">Add to Cart</button>
</div>

@script(
    handleEvent('click', '.product-item .add-to-cart', (e, el) => {
        const item = el.closest('.product-item');
        alert('Added item #' + item.dataset.id + ' at $' + item.dataset.price);
    });
)
```

### Delegation via `handleEvent` & `Cast.on`

The global helper `handleEvent(event, selector, handler)` attaches delegated listeners directly to `document`:
- **Dynamic Elements:** Even when elements are added or replaced via AJAX/DOM mutations, the event handler continues to work without re-attaching listeners.
- **Handler Signature:** `(event, matchedElement) => { ... }` where `matchedElement` is the DOM node matching `selector`.
- **Runtime methods:**
  - `Cast.on(event, selector, handler)` — delegated event listener
  - `Cast.update(target, content)` — updates element/select options in-place
  - `Cast.refresh(target, url)` — fetches HTML fragment and replaces target container
  - `Cast.onLoad(callback)` — executes on DOMContentLoaded

### Emitting Scripts with `@scripts`

Place `@scripts` right before the closing `</body>` tag of your layout. It deduplicates and renders all scripts registered by components rendered during the request along with the zero-dependency `assets/cast.js` runtime.

> **Rule:** Never use PHP `@{ }` holes directly inside `@script(...)`. Pass server data via HTML attributes (`data-*`) and access them in JavaScript with `el.dataset`.

## Scoped CSS & Dynamic Variables

Components can encapsulate styles with `@css(...)`. The engine automatically scopes selectors to a deterministic component class (`.cast-<id>`) and transforms dynamic PHP expressions into CSS custom properties:

```php
<div class="user-badge" data-role={$role}>
    <span>@{ $name }</span>
</div>

@css(
    .user-badge {
        padding: 8px 12px;
        border-radius: 4px;
        border: 2px solid @{ $role === 'admin' ? '#0070f3' : '#e0e0e0' };
        background-color: @{ $isActive ? '#f0fdf4' : '#fff' };
    }
    .user-badge span {
        font-weight: 600;
    }
)
```

### Dynamic CSS Variables
Any `@{ ... }` expression inside `@css(...)` is converted into a CSS variable (`var(--cast-<id>-<n>)`). The computed PHP values are injected as an inline `style="..."` attribute onto the component container, leaving the stylesheet clean and static.

### Emitting Styles with `@styles`

Place `@styles` in the `<head>` of your layout to output all collected component stylesheets for the current request.

## Component Assets & Bundler

In addition to inline `@script` and `@css`, components can have dedicated asset files:
- `resources/css/components/<component-name>.css`
- `resources/js/components/<component-name>.js`

The engine automatically discovers and registers matching asset files whenever a component is rendered.

### Production Bundling (`engine:build`)

In development, assets can be loaded per-component. In production, run the engine bundler to minify and bundle all component assets into your application bundles:

```bash
php cast engine:build
# or with custom paths:
php cast engine:build --css=public/css/app.css --js=public/js/app.js --components=resources
```

The bundler:
1. Discovers all CSS and JS files in `resources/css/components/` and `resources/js/components/`.
2. Strips comments and minifies whitespace (dependency-free).
3. Injects or replaces the bundled code between safe marker comments in `app.css` and `app.js`:
   ```css
   /* cast:components:start */
   ...minified component styles...
   /* cast:components:end */
   ```

## Language Server & Tree-Sitter

CastTemplateEngine provides a dedicated Language Server Protocol (LSP) and Tree-sitter grammar:

- **`cast-language-server` (`editor/server/`):** Full TypeScript LSP server providing diagnostics with quick
  fixes, tag/attribute/slot/value completions, hover documentation, Go to Definition, Document Links, and
  formatting.
- **`cast-language-core` (`editor/language-core/`):** Shared TypeScript package carrying the host-independent
  logic both the LSP and the VS Code extension need (component docblock parsing, name resolution, scanning,
  completion-context detection) — the two consume one implementation instead of two that can drift apart.
- **LSP/extension precedence:** when both the LSP and the VS Code extension's own hand-rolled engine are
  installed, the extension defers entirely to the LSP once it reports a successful `State.Running` handshake
  for hover, Go to Definition, completion, Document Links, and diagnostics-with-quick-fixes — falling back
  to its own engine automatically if the LSP isn't installed, fails to start, or later stops. The two are
  never both active for the same capability at once.
- **`tree-sitter-cast` (`editor/tree-sitter-cast/`):** Standalone grammar with highlight, injection (PHP/CSS/JS), fold, and indent queries for Neovim (`nvim-treesitter`), Zed, Helix, and VS Code.
- **Specification (`editor/spec/cast-syntax.json`):** Machine-readable syntax specification dynamically generated from the engine's reflection metadata (`php bin/gen-syntax-spec.php`).
- **PHP Intelligence Bridge:** Injects PHP code inside echo holes `@{ ... }` and directives, mapping character positions to bundled Phpactor/PHP LSPs via bidirectional source maps.
- **Settings:** `cast.componentsPath` (including a `config/view.php` `'components'` override), `cast.viewsPath`, `cast.resourcesPath`, `cast.extension`, `cast.propCase`, and `cast.diagnostics` are read by both the extension's own engine and, when installed, the LSP.

## Terminal Commands & CLI

CastTemplateEngine includes a zero-dependency CLI runner:

```bash
php cast engine:check              # Scan and lint all .cast.php files for syntax errors & missing keys
php cast lint                      # Authoritative compiler check on all template files
php cast lint <file> --json        # Machine-readable JSON diagnostics for IDEs and AI coding agents
php cast engine:ast <file>         # Inspect AST, declared @props, components, and scoped CSS
php cast engine:compile            # Precompile all templates into the cache folder
php cast engine:build              # Minify & bundle component assets into app.css and app.js
php cast engine:clear              # Clear compiled template cache
php cast engine:editor install     # Install or update extension for all detected editors (VS Code, Antigravity IDE, Cursor, etc.)
php cast engine:editor --editor=antigravity-ide # Install specifically for Antigravity IDE
php cast engine:editor --editor=code            # Install specifically for VS Code

php cast engine:editor-install all              # Install the extension + the global cast-language-server, with a requirements check
php cast engine:editor-install lsp              # Install/update just the global cast-language-server
php cast engine:editor-install extension --cursor # Install just the extension, into Cursor only
php cast engine:editor-uninstall all            # Uninstall both
```

Commands can also be called with space syntax (`php cast engine check`, `php cast ast <file>`) and can be extended by CastFramework via `CastTemplateEngine\Console\CommandRegistry::register(...)`.

## Documentation Snippets List

The following snippet triggers are available in the editor:

| Prefix | Description | Expansion |
|---|---|---|
| `aprops` | Strictly-Typed Component Props | `@props { string $title; ?int $count = 0; }` |
| `apropsext` | Component Prop Inheritance | `@props extends::Components.BaseCard { ... }` |
| `ccomp` | Component with children | `<Card title="Header">$0</Card>` |
| `ccomp1` | Self-closing component | `<Btns.Soft label="Save" />` |
| `cslot` | Named Slot | `<Slot name="left">$0</Slot>` |
| `cprop` | Expression Prop | `total={$value}` |
| `aecho` | Print Expression | `@{ $variable }` |
| `amap` | Collection Map with Key | `@map($items, ($item, $i) => return(<Card key={$i}>...</Card>))` |
| `amapobj` | Object Map Shorthand | `@$items.map(($item, $i) => return(<Card key={$i}>...</Card>))` |
| `afilter` | Filter Collection | `@filter($items, ($item) => $item->quantity > 0)` |
| `achain` | Chained Filter and Map | `@$items.filter(($item) => condition).map(($item, $i) => return(...))` |
| `arender` | Conditional Inline Render | `@{ $cond ? @render(<p>Yes</p>) : @render(<p>No</p>) }` |
| `ascript` | Component Client Script | `@script(handleEvent('click', '.btn', (e, el) => { ... }))` |
| `ajs` | Component Script Alias | `@js(handleEvent('click', '.btn', (e, el) => { ... }))` |
| `acss` | Scoped Component Styles | `@css(li.active { color: @{ $color }; })` |
| `ascripts` | Render Component Scripts | `@scripts` |
| `astyles` | Render Component Styles | `@styles` |
| `aevent` | Delegated Event Listener | `handleEvent('click', '.selector', (e, el) => { ... })` |
| `aforeach` | Foreach Loop | `@foreach ($items as $item) ... @endforeach` |
| `aforelse` | Forelse with Empty | `@forelse ($items as $item) ... @empty ... @endforelse` |
| `aif` | If Condition | `@if ($condition) ... @endif` |
| `aifelse` | If / Else Condition | `@if ($cond) ... @else ... @endif` |
| `aswitch` | Switch Case Block | `@switch ($val) @case (1) ... @break @default ... @endswitch` |
| `aphp` | PHP Statement / Block | `@php($n = 1)` or `@php ... @endphp` |


## Coming from `useComponent()`

| Before | After |
| --- | --- |
| `<?= useComponent('form.input.input', ['name' => 'qty', 'required' => true]) ?>` | `<Form.Input.Input name="qty" required />` |
| `<?= useComponent('mobile.cards.card', ['cardData' => $html]) ?>` | `<Mobile.Cards.Card>...html...</Mobile.Cards.Card>` |
| `data-html="<?= useComponent('attributes.badge-item', [...], true) ?>"` | `data-html={<Attributes.BadgeItem ... />}` |
| `extract(array_merge(['label' => 'Input'], $data));` | `$label ??= 'Input';` (props are already variables) |
| `has_label` in the data array | `has_label`, `has-label` or `hasLabel` (all arrive as `$hasLabel`) |

## Tests and versioning

```bash
composer test        # or: php tests/run.php
```

The tests have no dependencies. The project follows [Semantic Versioning](https://semver.org). Everything in this
README is the public API: the constructor arguments and options, the tag, prop, slot and attribute syntax, the file
name resolution and the variables components receive. Changing any of them in a way that breaks existing templates
is a major version. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
