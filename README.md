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
- [Syntax rules](#syntax-rules)
- [Escaping](#escaping)
- [Caching and errors](#caching-and-errors)
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

and then run `composer require anode/cast-template-engine:^1.0`.

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
| `@@` | a literal `@` |

The colon after the parentheses is optional. Any PHP works inside the parentheses (nested calls, arrays, strings with brackets). Left alone: `<?php ?>` blocks, CSS `@media` / `@import` and everything else inside `<style>` except `@{ }`, an `@` right after a letter, digit, dot or underscore (e-mail addresses), and words that are not directives. A directive never adds or removes a line, so errors still point at the right line of your template. Mistakes (`@endfor` with no `@for`, a `@foreach` that is never closed, `@break` outside a loop) are reported with the template and line.

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
