# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

## 1.0.3

- **Errors point at your template.** An error inside a template used to be reported in the compiled copy (`storage/framework/views/<hash>.php`), so error pages and logs named a file nobody wrote. The exception's file, line, message and every trace frame now name the template (or component) and its line. A helper that rejects its argument (`htchars(null)`) is reported at the line of the template that called it.
- Fix: moving a leading `declare(strict_types=1)` to the front of the compiled file no longer shifts the line numbers of the template.

## 1.0.2

- Fix: a view or component that starts with `<?php declare(strict_types=1);` stopped PHP with "strict_types declaration must be the very first statement", because the engine puts a line of its own before every compiled file. The declare is now moved to the front of the compiled file.

## 1.0.1

- The Composer package is now `anode/cast-template-engine` (was `arnoldduo2/cast-template-engine`). No code changes.

## 1.0.0

First release.

- `CastTemplate` class: `new CastTemplate($componentsDir, '.cast.php', $options)` and `render()`.
- Component tags with name resolution (`kpi-card`, `kpi_card`, `KpiCard`, `kpiCard`), folders with dots.
- Props: strings, `{expression}`, boolean attributes, `{...$spread}`, camelCased keys.
- Children, `<Slot name="...">`, and component tags inside `{ }` expressions.
- Escaped `attr={expression}` on plain HTML tags.
- Compiled-template cache, compile errors with file and line.
