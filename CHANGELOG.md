# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

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
