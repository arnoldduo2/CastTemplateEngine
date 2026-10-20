/**
 * Shared hover markdown for things that aren't Cast directives but still show up in a .cast.php file: built-in
 * JS runtime helpers, the `@{ }` echo hole, and fluent `.filter()/.map()` chain segments. Ported verbatim from
 * editor/vscode/extension.js so the LSP and the extension's own fallback engine never disagree about this text.
 */

export const BUILTIN_HOVERS: Record<string, string> = {
  handleEvent: "**handleEvent(event, selector, handler)**\n\nRegisters a delegated event listener on `document`.\n\n- `event`: `'click'`, `'change'`, `'input'`, etc.\n- `selector`: CSS selector (e.g. `'.product_item'`)\n- `handler`: `(e, el) => void` where `el` is the matched element\n\n```js\nhandleEvent('click', '.btn', (e, el) => {\n  console.log('Clicked', el.dataset.id);\n});\n```",
  "Cast.on": "**Cast.on(event, selector, handler)**\n\nDelegated event listener on `document`.\n\n- `handler`: `(e, el) => void` where `el` is the matched element",
  "Cast.update": "**Cast.update(selector, data)**\n\nIn-place reactive update for elements or `<select>` options.\n\n```js\nCast.update('#ship_address', optionsList);\n```",
  "Cast.refresh": "**Cast.refresh(selector, endpoint, options)**\n\nFetches updated component HTML fragment and swaps target in DOM.\n\n```js\nCast.refresh('#card', '/_cast/component/card?id=' + id);\n```",
  "Cast.onLoad": "**Cast.onLoad(callback)**\n\nLifecycle hook triggered on DOMContentLoaded and after DOM fragment refreshes.",
  "@script": "**@script( ... )**\n\nComponent script block. Wrapped in an IIFE and registered once per component. Printed by `@scripts`.",
  "@js": "**@js( ... )**\n\nAlias for `@script(...)`. Component script block wrapped in an IIFE.",
  "@css": "**@css( ... )**\n\nComponent stylesheet block. Scoped to the component and supports dynamic `@{ expr }` CSS variables.\n\n```css\n@css(\n  li.active { border-color: @{ props['role'] === 'admin' ? '#fff' : '#666' }; }\n)\n```",
  "@scripts": "**@scripts**\n\nOutputs all collected component scripts and the `cast.js` runtime before `</body>`.",
  "@styles": "**@styles**\n\nOutputs all collected component stylesheets.",
  "@map": "**@map($collection, fn($item, $i) => ...)**\n\nRenders markup for every item of `$collection` and echoes the result. Backed by `Collection::map()`.\n\n- `$collection`: an array, `stdClass` or `Traversable`\n- callback: `fn($item, $index, $key) => string`\n\n```php\n@map($items, ($item, $i) => return(<Card key={$i}>@{ $item->name }</Card>))\n```",
  "@filter": "**@filter($collection, fn($item) => bool[, fn($item, $i) => ...])**\n\nTwo forms, backed by `Collection::filter()`:\n\n- **Render form** (3 args): filters `$collection`, then renders and echoes each remaining item with the 3rd callback.\n- **Standalone form** (2 args): reassigns `$collection` in place to the filtered array/object — nothing is echoed.\n\n```php\n@filter($items, ($item) => $item->qty > 0)\n```",
  return: "**return(...)** *(inside an expression)*\n\nCompiles the markup inside the parentheses and returns it as a string, so a chunk of HTML/components can be produced from inside a callback or `@{ }` expression (e.g. a `@map`/`@filter` callback). Implemented as an immediately-invoked closure that buffers output with `ob_start()`/`ob_get_clean()` and captures the surrounding scope's variables.",
  "@render": "**@render(...)** *(inside an expression)*\n\nAlias for `return(...)` inside an expression: compiles the markup inside the parentheses and returns it as a string from the current callback/expression.",
  "@includes": "**@includes(string $name, array $data = [], bool $withAuth = false): mixed**\n\nInclude a partial or layout (echoes it). Backed by `__includes()`.\n\n- `$name`: View or partial path (e.g. `'layouts.header'`)\n- `$data`: Array of variables passed to the partial (defaults to `[]`)\n- `$withAuth`: If true, only renders when a user is authenticated (defaults to `false`)\n\n```php\n@includes('layouts.header', $data)\n```",
  "@children": "**@children**\n\nPrints the component's or layout's captured body content (`$children`), or a fallback when there is none."
};

export const ECHO_HOLE_HOVER =
  "**@{ ... }**\n\nAn echo hole: compiles the PHP expression inside and prints its value (like `<?= ... ?>`). Can itself contain `return(...)`/`@render(...)` to print a rendered chunk of markup.";

export const CHAIN_HOVER = {
  map: "**.map(fn($item, $i) => ...)** *(fluent chain)*\n\nPart of `@$var.filter(...).map(...)`. Maps the chain's current collection; the chain's **final** `.map()` is what gets echoed. Single-argument callback: `fn($item, $index) => string`.\n\nBacked by `Collection::map()`.",
  filter: "**.filter(fn($item) => bool)** *(fluent chain)*\n\nPart of `@$var.filter(...).map(...)`. Narrows the chain's current collection to items where the callback returns true, then passes the result on to the next `.filter()`/`.map()`. Single-argument callback: `fn($item) => bool`.\n\nBacked by `Collection::filter()`."
};
