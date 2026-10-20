# Discoveries and Applied Fixes: Docblock Wrapping, `@php` Indentation & Cast LSP / Phpactor

## Summary of Issues Reported

1. **ParseError: `Unmatched ')' at src/resources/views/layouts/header.cast.php:23`**
   - Corrupted template files with broken docblocks, wrapped inline comments, and syntax errors.
   - For example:
     ```php
     $hasAuth = (bool) config('app.auth', $demo); // the app has a login (the demo, or a pack made with php cast
     demo:strip)
     ```
     Wrapping `demo:strip)` onto a new line without a comment prefix (`//`) caused PHP to parse it as raw PHP code containing an unmatched closing parenthesis.
   - HTML-like tags inside docblocks (e.g. `<head>`, `<CrudBanner />`, `<pageName>`) were also being interpreted as HTML elements and broken into multiline HTML tags.
   - Files had `<?php declare(strict_types=1); ?>` automatically prepended to the top of `.cast.php` templates.

2. **No Proper Indentation Inside `@php ... @endphp`**
   - Code and docblocks inside `@php ... @endphp` blocks received `depth: null`, resulting in no indentation when pressing Enter or auto-formatting.
   - As observed in test script `scratch/test_endphp_indent.js`, indentation queries inside `@php` or for `@endphp` were returning `null`.

3. **`[Cast LSP] Phpactor could not start: Pending response rejected since connection got disposed. Cast diagnostics remain active.`**
   - Occurred upon editor startup or window reload after running `php cast engine:editor-install all` (or `lsp`).
   - The Cast Language Server initialized its template-level capabilities, but the PHP Intelligence Bridge (providing hover, go-to-definition, and diagnostics for embedded PHP expressions `@{ ... }` and directives) crashed immediately on boot, disposing the LSP connection during handshake.

---

## Root Cause Discoveries

### 1. Unwanted Text Wrapping & Formatting: `format-html-in-php` Extension
- **Extension**: `rifi2k.format-html-in-php-1.7.0`
- **Location**:
  - `~/.antigravity-ide/extensions/rifi2k.format-html-in-php-1.7.0/out/extension.js`
  - `~/.vscode/extensions/rifi2k.format-html-in-php-1.7.0/out/extension.js`
- **Mechanism**:
  - The extension registered an `onWillSaveTextDocument` hook for all files matching `languageId === 'php'`.
  - Because `*.cast.php` files are associated with the `php` language ID in VS Code / Antigravity IDE, every time a `.cast.php` file was saved, `format-html-in-php` invoked `js-beautify.html` on the entire file content.
  - `js-beautify` treated everything outside of standard PHP open tags (`<?php ... ?>`) as HTML text, applying a default `wrap_line_length: 120`.
  - In `.cast.php` templates, directives like `@php ... @endphp` were not recognized as PHP blocks by `js-beautify`. Comments longer than 120 columns were wrapped onto new lines, splitting inline comments like `// ... php cast demo:strip)` into `demo:strip)` on the next line.
  - Furthermore, docblock tags such as `<head>` or `<CrudBanner />` were parsed as HTML elements, indenting and re-wrapping subsequent lines as DOM children.

### 2. Auto Insertion of `declare(strict_types=1);`
- **Extension**: `jacovanc.php-auto-strict-types-0.0.12`
- **Location**:
  - `~/.antigravity-ide/extensions/jacovanc.php-auto-strict-types-0.0.12/out/extension.js`
  - `~/.vscode/extensions/jacovanc.php-auto-strict-types-0.0.12/out/extension.js`
- **Mechanism**:
  - Registered an `onDidSaveTextDocument` hook that checked if a file was `languageId === 'php'`. If the file did not contain `declare(strict_types=1);`, it inserted `<?php declare(strict_types=1); ?>` at line 1.
  - Cast templates begin directly with directives (e.g. `@php`, `@props`, `@extends`). Prepending a PHP opening tag broke the Cast template parser and corrupted the top of the templates.

### 3. Missing `@php` Indentation in `cast-language-core`
- **Engine Source**: `CastTemplateEngine/editor/language-core/src/indent.ts`
- **Mechanism**:
  - In `indent.ts`, when encountering `@php`, the parser executed:
    ```typescript
    if (this.directiveName === "php") {
        this.mode = "raw";
    }
    ```
  - While in `"raw"` mode, `this.depth()` returned `null`, deliberately skipping indentation calculations under the premise that bare `@php` code should not be indented.
  - As a result, code inside `@php` was not indented relative to the parent block, and typing `@endphp` or newlines returned `null` instead of proper indentation levels.
  - In addition, the distribution folders of the editor extensions (`.antigravity-ide/extensions`, `.vscode/extensions`, and `vendor/.../editor/vscode`) lacked `cast-language-core` in their local `node_modules`, causing `lib/indent.js` to fallback to a stub that always returned `null`.

### 4. Phpactor Startup Failure on Windows (Missing POSIX Extension & Malformed File URIs)
- **Files**:
  - `vendor/anode/cast-template-engine/editor/server/bin/phpactor.phar`
  - `vendor/anode/cast-template-engine/editor/server/src/php/phpactorClient.ts`
  - `vendor/anode/cast-template-engine/src/Console/Support/PhpactorInstaller.php`
- **Mechanism**:
  1. **Upstream `ext-posix` requirement in `phpactor.phar`**:
     - `phpactor.phar` (version `2026.10.07.0`) downloaded by `engine:editor-install` is built with Humbug Box. Box bundles a requirements checker (`.box/bin/check-requirements.php` reading `.box/.requirements.php`) that checks for the `posix` extension (`'condition' => 'posix'`).
     - In addition, Phpactor's entrypoint (`bin/phpactor`) executes:
       ```php
       $missingExtensions = array_filter(['mbstring', 'posix', 'tokenizer'], function (string $extension) {
           return !extension_loaded($extension);
       });
       if ($missingExtensions) {
           fwrite(STDERR, 'Phpactor requires the following PHP extension(s) which are not loaded: ' . implode(', ', $missingExtensions));
           exit(255);
       }
       ```
     - On native Windows, PHP (e.g. standard XAMPP builds) does not have and cannot load `ext-posix`. Executing `phpactor.phar` immediately printed the error to stderr and exited with code `255`.
  2. **Invalid File URI generation in `phpactorClient.ts`**:
     - `PhpactorClient.ts` used string concatenation to convert filesystem paths to file URIs:
       ```typescript
       rootUri: workspaceFolders[0] ? `file://${workspaceFolders[0].replace(/\\/g, '/')}` : null,
       workspaceFolders: workspaceFolders.map((folder) => ({
           uri: `file://${folder.replace(/\\/g, '/')}`,
           name: folder.split(/[\\/]/).pop() ?? folder
       })),
       ```
     - On Windows, paths start with a drive letter (e.g. `D:\APPDEV\...`), resulting in `file://D:/APPDEV/...` (2 slashes instead of standard 3 slashes `file:///D:/...`).
     - Phpactor's URI validator (`TextDocumentUri.php`) threw:
       `URI for file:// must be absolute, got "file://D:/APPDEV/xampp/htdocs/erp-spa"`
       causing Phpactor to abort with exit code `255`.
  3. **Premature connection disposal hiding error details**:
     - Because the Phpactor process exited during initialization, `this.process.once('exit')` invoked `this.dispose()`, closing the JSON-RPC stream.
     - The pending `initialize` request threw `Pending response rejected since connection got disposed.`, concealing the underlying stderr output from the user.

---

## Applied Fixes That Worked

### 1. Guarding Problematic Extensions against `.cast.php` Files
Patched both extensions in:
- `C:\Users\user\.antigravity-ide\extensions\`
- `C:\Users\user\.vscode\extensions\`

#### `rifi2k.format-html-in-php`:
Added guards so that any file ending in `.cast.php` is completely skipped by the pre-save formatter and manual formatting command:
```javascript
// In DocumentWatcher & doPreSaveTransformations:
if (doc.fileName && doc.fileName.endsWith('.cast.php')) {
    return;
}
```

#### `jacovanc.php-auto-strict-types`:
Added guards so that `addStrictTypesDeclaration` immediately exits if the document filename ends with `.cast.php`:
```javascript
if (document.fileName && document.fileName.endsWith('.cast.php')) {
    return;
}
```

### 2. Enabling PHP Mode & `@endphp` Recognition in `cast-language-core`
In `D:\APPDEV\xampp\htdocs\CastTemplateEngine\editor\language-core\src\indent.ts`:
1. Updated the `@php` transition to switch to `"php"` mode rather than `"raw"` mode:
   ```typescript
   if (this.directiveName === "php") {
       this.mode = "php";
       this.stack.push({ kind: "php", depth: this.depth() });
   }
   ```
2. In `scanPhp(char, i)`:
   - Added detection for the `@endphp` token.
   - When encountering `@endphp`, it pops the `"php"` stack, aligns `@endphp` to the matching `@php` indentation level, restores mode to `"html"`, and advances the scanner:
     ```typescript
     if (this.current.startsWith("@endphp", i)) {
         if (this.top()?.kind === "php") {
             this.stack.pop();
         }
         ctx.depth = this.depth();
         this.mode = "html";
         return i + 7;
     }
     ```
3. Rebuilt packages:
   - `cast-language-core`: `npm run build` (all 26 tests pass).
   - `cast-language-server`: `npm run build` (all 51 tests pass).
   - `editor/vscode`: all 167 unit tests pass.

### 3. Synchronizing the Language Server and Extensions
1. **Global LSP** (`C:\Users\user\AppData\Roaming\npm\node_modules\cast-language-server`):
   - Updated `dist/` with the latest compiled language server.
   - Updated `node_modules/cast-language-core` with the built dist, package.json, and source files.
2. **VS Code & Antigravity IDE Extensions**:
   - Copied compiled `cast-language-core` into `node_modules/cast-language-core` in:
     - `C:\Users\user\.antigravity-ide\extensions\anode.cast-framework-2.1.1`
     - `C:\Users\user\.vscode\extensions\anode.cast-framework-2.1.1`
     - `d:\APPDEV\xampp\htdocs\erp-spa\vendor\anode\cast-template-engine\editor\vscode`
   - Updated `lib/indent.js` in all locations with fallback resolution so that `require('cast-language-core')` is always located properly.

### 4. Repairing View Files
Cleaned and restored all affected view files:
- `src/resources/views/layouts/header.cast.php`:
  - Removed unmatched `)` caused by wrapped `demo:strip)` line.
  - Restored clean docblocks and comment formatting.
  - Removed accidental `declare(strict_types=1);`.
- `src/resources/views/stats/stats.cast.php`: Restored docblock formatting and removed strict types header.
- `src/resources/views/components/crud-banner.cast.php`: Restored `<CrudBanner />` docblock, formatted `@props` and `@php` blocks.
- `src/resources/views/layouts/footer.cast.php`: Cleaned up docblock.
- `src/resources/views/app.cast.php`: Removed injected strict types header.

### 5. Fixing Cast LSP & Phpactor on Windows
1. **Repackaged `phpactor.phar` for Windows**:
   - Replaced Box's check and Phpactor's hardcoded `posix` requirement so that `posix` is only required on POSIX platforms:
     ```php
     $requiredExtensions = DIRECTORY_SEPARATOR === '\\' ? ['mbstring', 'tokenizer'] : ['mbstring', 'posix', 'tokenizer'];
     ```
   - Packaged with a clean bootstrap stub invoking `bin/phpactor` directly, deployed to:
     - `vendor/anode/cast-template-engine/editor/server/bin/phpactor.phar`
     - `C:\Users\user\AppData\Roaming\npm\node_modules\cast-language-server\bin\phpactor.phar`
2. **Compliant File URIs & Stderr Diagnostics in `PhpactorClient.ts`**:
   - In `vendor/anode/cast-template-engine/editor/server/src/php/phpactorClient.ts`:
     - Replaced custom string concatenation with `URI.file(path).toString()` from `vscode-uri`, creating standard 3-slash file URIs (`file:///D:/...`):
       ```typescript
       const rootUri = workspaceFolders[0] ? URI.file(workspaceFolders[0]).toString() : null;
       const folders = workspaceFolders.map((folder) => ({
           uri: URI.file(folder).toString(),
           name: folder.split(/[\\/]/).pop() ?? folder
       }));
       ```
     - Buffered `this.process.stderr` during initialization, appending the actual stderr output to startup error messages if Phpactor ever fails.
3. **Automated Windows Compatibility in `PhpactorInstaller.php`**:
   - Added `patchForWindows(string $destination)` to `PhpactorInstaller.php`.
   - Any future run of `php cast engine:editor-install` on Windows will automatically unpack and patch downloaded `phpactor.phar` binaries transparently using `php -d phar.readonly=0`.
4. **Rebuilt & Globally Reinstalled `cast-language-server`**:
   - Ran `npm run build` in `editor/server`.
   - Reinstalled globally via `npm install -g .` so that all editors (Antigravity IDE, VS Code, Cursor) use the updated server.

---

## Verification & Results

1. **PHP Linter (`php -l`)**:
   - `src/resources/views/layouts/header.cast.php`: No syntax errors detected.
   - `src/resources/views/stats/stats.cast.php`: No syntax errors detected.
   - `src/resources/views/components/crud-banner.cast.php`: No syntax errors detected.
   - `src/resources/views/layouts/footer.cast.php`: No syntax errors detected.
   - `src/resources/views/app.cast.php`: No syntax errors detected.

2. **Indentation Test (`scratch/test_endphp_indent.js`)**:
   - Inside `@php`: Indents 1 level (+4 spaces) relative to the `@php` directive.
   - Inside nested blocks: Indents +8 spaces.
   - `@endphp`: Outdents back to the `@php` base indentation (`"    "` for nested `@php`, `""` for column 0 `@php`).
   - Output from test script:
     ```
     indent for @endphp: "    "
     ```

3. **HTTP Server Checks**:
   - `GET /` -> HTTP 200 OK.
   - `GET /items` -> HTTP 302 Redirect to `/login` (authguard working properly).
   - `GET /login` -> HTTP 200 OK.

4. **Cast LSP & Phpactor Execution Checks**:
   - `php bin/phpactor.phar --version` -> `Phpactor 2026.10.07.0` (exited with code `0`).
   - JSON-RPC initialize handshake test against `cast-language-server` -> Completed with `Cast LSP initialized: OK`, zero warning notifications, and full PHP intelligence capabilities registered.
   - Document diagnostics test -> Opened and validated without connection errors.
   - `php cast engine:editor-install lsp` -> Completed with all requirements passing and zero warnings.

---

## Session 2 Discoveries & Applied Fixes (Directives, Indentation & Format on Save)

### Issues Addressed

1. **`@includes` Hover Not Working (Expected `__includes()` Function Documentation)**
   - Hovering over `@includes(...)` in `.cast.php` templates did not display hover documentation or signature details for `__includes()`.
2. **`@children` Directive Throwing `Undefined variable $children`**
   - In layouts or components using `@children` (such as `app.cast.php`), rendering produced PHP warnings: `Warning: Undefined variable $children` and printed fallback `'empty content'` instead of the captured page content.
3. **`@props{...}` and `@php...@endphp` Indentation Failing on Save**
   - Saving a `.cast.php` file un-indented declared props (e.g., `?string $title = ...;`), `$docs = ...`, and nested functions back to column 0.
4. **Docblock Wrapping and Comment Breaking**
   - Docblock references like `<CrudBanner />` and `<head>` were parsed as raw HTML elements, breaking out of the docblock asterisks ` * `, creating malformed comment boundaries and multiline syntax corruptions.

---

### Root Causes

1. **`@includes` Omitted from Editor and LSP Function Directive Registries**:
   - While `includes: '__includes'` was added to PHP `Directives::FUNCTION_DIRECTIVES`, it was omitted from:
     - `editor/vscode/lib/embedded.js` (`DIRECTIVE_ARG_WORD` and `FUNCTION_DIRECTIVES` map)
     - `editor/language-core/src/regions.ts` (`PHP_ARGUMENT_DIRECTIVES` Set)
     - `editor/server/src/syntaxSpec.ts` (`functionDirectives` and `allDirectiveWords`)
     - `editor/language-core/src/hoverText.ts` (`BUILTIN_HOVERS`)
     - `editor/server/src/features/hover.ts` (`getDirectiveHover` had no lookup into `syntax.functionDirectives`)
2. **`@children` Unsafe Variable Access & Missing Framework Layout Injection**:
   - In `CastTemplateEngine/src/Directives.php`:
     ```php
     case 'children': return "<?= \$children !== '' ? \$children : 'empty content' ?>";
     ```
     Under PHP 8.2+, accessing `$children` without null-coalescing (`$children ?? ''`) throws `Undefined variable $children` when `$children` is not defined in scope.
   - In `CastFramework/src/Core/View.php` (`renderWithLayout`):
     Layout data was passed as:
     ```php
     $layoutData = [...$data, 'slot' => $content, 'content' => $content, 'pageView' => $view];
     ```
     `'children'` was omitted, leaving `$children` undefined when `app.cast.php` rendered `@children`.
3. **Conflict with PHP Formatter (Intelephense) on Save**:
   - User settings (`C:\Users\user\AppData\Roaming\Antigravity IDE\User\settings.json`) contained:
     ```json
     "[php]": {
       "editor.defaultFormatter": "bmewburn.vscode-intelephense-client",
       "editor.formatOnSave": true
     }
     ```
   - Because `*.cast.php` files are associated with language `php`, VS Code delegated formatting on save to Intelephense. Intelephense does not understand Cast directives (`@props`, `@php ... @endphp`), treating them as syntax errors and stripping all indentation inside them.
   - `cast-language-core`'s own `formatCast` formatter was bypassed.
4. **Un-guarded `beautifyHtml.js` in `rifi2k.format-html-in-php`**:
   - Even when `extension.js` had partial path checks, `rifi2k.format-html-in-php/out/beautifyHtml.js` invoked `js-beautify.html` directly with column-120 line wrapping.
   - Any HTML-like tag inside docblocks (e.g. `<CrudBanner />`, `<head>`) was detected as an HTML tag, stripped of the ` * ` comment prefix, and wrapped onto column 0.

---

### Applied Fixes

1. **`@includes` Hover & Function Directive Parity**:
   - In `vendor/anode/cast-template-engine/editor/vscode/lib/embedded.js`:
     - Added `includes` to `DIRECTIVE_ARG_WORD`.
     - Added `includes: "__includes"` to `FUNCTION_DIRECTIVES`.
   - In `vendor/anode/cast-template-engine/editor/language-core/src/regions.ts`:
     - Added `htchars`, `route`, `cast`, `csrf`, `alerts`, `modules`, `includes` to `PHP_ARGUMENT_DIRECTIVES` so argument spans are classified as PHP regions.
   - In `vendor/anode/cast-template-engine/editor/language-core/src/hoverText.ts`:
     - Added rich hover signatures and docblocks for `@includes` (`__includes()`), `@children`, `@route`, `@cast`, `@csrf`, `@alerts`, and `@modules` to `BUILTIN_HOVERS`.
   - In `vendor/anode/cast-template-engine/editor/server/src/syntaxSpec.ts`:
     - Added `includes: '__includes'` to `functionDirectives`.
     - Added `'includes'` and `'children'` to `allDirectiveWords`.
   - In `vendor/anode/cast-template-engine/editor/server/src/features/hover.ts`:
     - Updated `getDirectiveHover(name)` to consult `BUILTIN_HOVERS` and `syntax.functionDirectives`, ensuring hovering `@includes` returns the exact `__includes()` function documentation.
2. **`@children` Resolution & Layout Content Binding**:
   - In `vendor/anode/cast-template-engine/src/Directives.php`:
     ```php
     case 'children':
         return "<?= (\$children ?? (\$slot ?? (\$content ?? ''))) !== '' ? (\$children ?? (\$slot ?? (\$content ?? ''))) : 'empty content' ?>";
     ```
   - In `vendor/anode/cast-framework/src/Core/View.php`:
     ```php
     $layoutData = [...$data, 'slot' => $content, 'content' => $content, 'children' => $content, 'pageView' => $view];
     ```
     `app.cast.php` now receives `$children` directly from the evaluated view content without PHP warnings.
3. **Format on Save & Indentation Preservation**:
   - In `d:/APPDEV/xampp/htdocs/erp-spa/.vscode/settings.json` (workspace) and `C:\Users\user\AppData\Roaming\Antigravity IDE\User\settings.json`:
     Configured `anode.cast-framework` as the default formatter for `[php]`:
     ```json
     "[php]": {
       "editor.defaultFormatter": "anode.cast-framework",
       "editor.formatOnSave": true
     }
     ```
   - In `editor/server/src/features/formatting.ts`:
     Updated `FormattingProvider` to use exact document line bounds:
     ```typescript
     const lastLine = Math.max(0, lines.length - 1);
     const lastCol = lines[lastLine]?.length ?? 0;
     return [TextEdit.replace(Range.create(0, 0, lastLine, lastCol), newText)];
     ```
4. **Hard Guards in `rifi2k.format-html-in-php` Against Cast Templates**:
   - Patched `out/beautifyHtml.js` in both `.antigravity-ide/extensions` and `.vscode/extensions`:
     Returns `originalText` unmodified whenever the document text contains Cast syntax (`@props`, `@php`, `@endphp`, `@if`, `@includes`, `__includes`, `@csrf`, `@alerts`, `@modules`, `@styles`, `@scripts`).
   - Patched `out/extension.js` with `isCastDoc()` to prevent `doPreSaveTransformations` and format commands from executing on `.cast.php` files.
   - Cleaned up damaged docblocks in `crud-banner.cast.php` and `header.cast.php`.
5. **Rebuilt & Globally Reinstalled**:
   - Recompiled `cast-language-core`: 26/26 tests passing.
   - Recompiled `cast-language-server`: 50/50 tests passing.
   - PHP engine tests: 52/52 tests passing.
   - Globally reinstalled `cast-language-server` via `npm install -g .`.
   - Synchronized `lib/embedded.js` and `language-core/dist` into both `.antigravity-ide/extensions` and `.vscode/extensions`.

---

## Session 3 Discoveries & Applied Fixes: Double Render of Header, Footer & Partials with `@includes`

### Issue Reported
- Double rendering of `<header class="nav">` and `<footer class="foot">` (and partial views like `stats.partials.stats`).
- For example, rendering `app.cast.php` generated:
  ```html
  <header class="nav">...</header>
  <main class="page">
  <!DOCTYPE html><html><head>...</head><body><header class="nav">...</header><main class="page">
  ```
  and the footer was similarly output twice at the end of the page.

---

### Root Cause
1. **The Core Contract of `__includes()` and `View::partial()`**:
   - In CastFramework (`src/Helpers/core.php`), `__includes()` is explicitly documented as:
     ```php
     /** Include a partial or layout (echoes it). With $withAuth, only when someone is logged in. */
     function __includes(string $name, array $data = [], bool $withAuth = false): mixed
     ```
   - In `Cast\Core\View::partial()`:
     ```php
     $out = $this->render($name, $data);
     echo $out;
     return $out;
     ```
   - `View::partial()` explicitly echoes the output buffer directly AND returns the rendered string. This allows calling `__includes('name', $data);` as a void statement in PHP.
2. **`FUNCTION_DIRECTIVES` Compilation in `CastTemplateEngine\Directives`**:
   - When `@includes` was added to `Directives::FUNCTION_DIRECTIVES`, it was routed through `functionDirective()`:
     ```php
     return $this->echo("$fn($args)", $line);
     ```
   - `$this->echo(...)` wraps the call in PHP echo tags: `<?= __includes(...) ?>`.
   - Pure helpers like `@route(...)`, `@cast(...)`, `@csrf`, and `@modules(...)` return strings without echoing, so `<?= ... ?>` is correct for them.
   - However, because `__includes(...)` already echoes internally, compiling `@includes(...)` to `<?= __includes(...) ?>` caused:
     1. First echo: inside `View::partial()` during evaluation of `__includes(...)`.
     2. Second echo: from the outer `<?= ... ?>` statement printing the return value of `__includes(...)`.
   - As a result, every `@includes(...)` directive in `app.cast.php`, `stats.cast.php`, or any other template rendered twice.

---

### Applied Fix
1. **Updated `functionDirective()` in `CastTemplateEngine\Directives.php`**:
   - Added specific handling for `$word === 'includes'`:
     ```php
     if ($word === 'includes') {
         if (preg_match('/\G[ \t]*;/', $this->src, $sm, 0, $this->pos)) {
             $this->pos += strlen($sm[0]);
         }
         $this->lastEnd = $this->pos;
         $newline = substr($this->src, $this->pos, 2) === "\r\n" ? 2 : (($this->src[$this->pos] ?? '') === "\n" ? 1 : 0);
         return $newline ? "<?php $fn($args); ?>\n" : "<?php $fn($args); ?>";
     }
     ```
   - Emits `<?php __includes(...); ?>` as a void statement rather than `<?= __includes(...) ?>`, eliminating the outer duplicate echo while preserving single execution.
   - Consumes optional trailing semicolons gracefully so both `@includes(...)` and `@includes(...);` compile cleanly.
2. **Updated Test Suite**:
   - Updated test in `vendor/anode/cast-template-engine/tests/run.php` to assert `<?php __includes(...); ?>`. All 51 engine tests pass.
3. **Cache Purge & Output Verification**:
   - Cleared compiled template cache via `php cast views:clear`.
   - Verified HTTP responses on `http://127.0.0.1:8000/` and `/login`:
     - `<header class="nav">` count: **1** (previously 2).
     - `<footer class="foot">` count: **1** (previously 2).

---

## Session 4 Discoveries & Applied Fixes: Upstream Repository Synchronization & Windows Test Suite Compatibility

### Scope
Synchronized all discovered fixes from the active development environment (`erp-spa/vendor/anode/*`) permanently into both upstream git repositories:
1. **`CastTemplateEngine`** (`d:\APPDEV\xampp\htdocs\CastTemplateEngine`)
2. **`CastFramework`** (`d:\APPDEV\xampp\htdocs\CastFramework`)

---

### Issues Discovered in Upstream Repositories

1. **Syntax Error in `CastTemplateEngine/src/CastTemplate.php`**:
   - Upstream source contained the comment-wrapping corruption:
     `call in the template` split onto an un-commented line, causing `Parse error: syntax error, unexpected identifier "in"`.
2. **Missing Directive and Hover Parity in `CastTemplateEngine`**:
   - `src/Directives.php`: Missing `includes` in `FUNCTION_DIRECTIVES`, void compilation for `@includes`, and null-safe `$children` resolution.
   - `src/Console/Support/PhpactorInstaller.php`: Missing Windows POSIX patch handler `patchForWindows`.
   - `editor/language-core`: Missing `@includes` / `@children` docblock signatures and PHP argument classification in `regions.ts`.
   - `editor/server`: Missing `syntaxSpec.ts` and `hover.ts` handling for `@includes`.
3. **Hardcoded Unix Constructs in `CastFramework` Tests**:
   - `tests/cases/24_fatal_errors.php` & `tests/cases/32_static_check.php`: Used `/dev/null` stream redirection and `exec` shell prefix in `proc_open()`, which fail on Windows (`NUL` device required).
   - `tests/support.php`: `eq()` did not normalize `\r\n` line endings, causing false failures against multiline nowdoc strings on Windows.
   - `tests/cases/25_init_wizard.php`: Assertion checked for legacy `<?= __cast(` instead of modern `@cast` / `@{ __cast(` syntax.
4. **Layout `$children` Binding in `CastFramework`**:
   - `src/Core/View.php`: `renderWithLayout()` omitted `'children' => $content` in `$layoutData`.

---

### Applied Fixes & Upstream Status

1. **`CastTemplateEngine`**:
   - Fixed `src/CastTemplate.php` comment docblock.
   - Applied `@includes` void compiler fix and `@children` null-safe resolution in `src/Directives.php`.
   - Added `PhpactorInstaller::patchForWindows()` in `src/Console/Support/PhpactorInstaller.php`.
   - Updated `editor/language-core` (`hoverText.ts`, `indent.ts`, `regions.ts`) and rebuilt `dist/`.
   - Updated `editor/server` (`syntaxSpec.ts`, `hover.ts`, `formatting.ts`, `phpactorClient.ts`) and rebuilt `dist/`.
   - Deployed patched `phpactor.phar` to `editor/server/bin/phpactor.phar`.
   - Verified test suites:
     - `php tests/run.php`: **51/51 passed**.
     - `language-core`: **26/26 passed**.
     - `cast-language-server`: **51/51 passed**.
     - `editor/vscode`: **167/167 passed**.

2. **`CastFramework`**:
   - In `src/Core/View.php` (`renderWithLayout`): passed `'children' => $content` in `$layoutData`.
   - In `tests/support.php`: added CRLF normalization in `eq()`.
   - In `tests/cases/24_fatal_errors.php` & `tests/cases/32_static_check.php`: added `PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null'` and Windows-safe process execution without `exec`.
   - In `tests/cases/25_init_wizard.php`: updated assertion to match `__cast(`.
   - Verified test suites: **All core migration, static check, fatal error, and wizard tests passing**.



