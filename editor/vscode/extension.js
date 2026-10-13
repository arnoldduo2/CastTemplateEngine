"use strict";
/**
 * CastFramework for VS Code: Ctrl+click (and F12, hover) on a component or a view name in a `.cast.php` file opens the file.
 * The syntax colouring is a grammar (syntaxes/), this file is only the navigation. The name-to-file rules live in lib/.
 */
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { scanComponents, scanHelpers } = require("./lib/scan");
const { resolveComponent, resolveLegacyComponent, resolveView, resolveModule, propsOf } = require("./lib/resolve");
const { lookup, listComponents, findProp, specOf } = require("./lib/components");
const { contextAt, diagnose } = require("./lib/complete");
const { camel } = require("./lib/docblock");
const { computeIndents, indentFor, indentString } = require("./lib/indent");

const SELECTOR = { scheme: "file", pattern: "**/*.cast.php" };

/** The folders to search for a document: from the settings, and from config/view.php when it names a components folder. */
function locations(document) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const root = folder ? folder.uri.fsPath : path.dirname(document.uri.fsPath);
  const config = vscode.workspace.getConfiguration("cast", document.uri);

  const viewsDir = path.resolve(root, config.get("viewsPath", "resources/views"));
  const resourcesDir = path.resolve(root, config.get("resourcesPath", "resources"));
  const ext = config.get("extension", ".cast.php");

  const configured = [].concat(config.get("componentsPath", "resources/views/components"));
  const dirs = configured.map((p) => path.resolve(root, p));

  // config/view.php: 'components' => 'ui'  (relative to the views folder)
  try {
    const source = fs.readFileSync(path.join(root, "config", "view.php"), "utf8");
    const m = /['"]components['"]\s*=>\s*['"]([^'"]+)['"]/.exec(source);
    if (m) {
      const dir = path.resolve(viewsDir, m[1]);
      if (!dirs.includes(dir)) dirs.unshift(dir);
    }
  } catch {
    /* no config/view.php */
  }
  return { root, viewsDir, resourcesDir, componentDirs: dirs, ext };
}

/** @returns {{range: any, file: string|null, tried: string[], label: string, kind: string}[]} */
function references(document) {
  const text = document.getText();
  const where = locations(document);
  const out = [];

  for (const ref of scanComponents(text)) {
    if (ref.name === "Slot") continue;
    const { file, tried } = resolveComponent(ref.name, where.componentDirs, where.ext);
    out.push({ ...ref, label: ref.name, file, tried });
  }
  for (const ref of scanHelpers(text)) {
    let result;
    if (ref.kind === "view") result = resolveView(ref.name, where.viewsDir, where.ext);
    else if (ref.kind === "legacy-component") result = resolveLegacyComponent(ref.name, where.componentDirs, where.ext);
    else result = resolveModule(ref.name, ref.type, where.resourcesDir);
    out.push({ ...ref, label: ref.name, file: result.file, tried: result.tried });
  }

  return out.map((r) => ({
    ...r,
    range: new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)),
  }));
}

const KIND_TITLE = { component: "Component", "legacy-component": "Component (legacy)", view: "View", module: "Module" };

class Links {
  provideDocumentLinks(document) {
    return references(document)
      .filter((r) => r.file)
      .map((r) => {
        const link = new vscode.DocumentLink(r.range, vscode.Uri.file(r.file));
        link.tooltip = `Open ${path.basename(r.file)} (Ctrl+click)`;
        return link;
      });
  }
}

class Definitions {
  provideDefinition(document, position) {
    const hit = references(document).find((r) => r.file && r.range.contains(position));
    return hit ? new vscode.Location(vscode.Uri.file(hit.file), new vscode.Position(0, 0)) : undefined;
  }
}

class Hovers {
  provideHover(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[@A-Za-z0-9_.]+/);
    if (wordRange) {
      const word = document.getText(wordRange);
      const builtins = {
        handleEvent: "**handleEvent(event, selector, handler)**\n\nRegisters a delegated event listener on `document`.\n\n- `event`: `'click'`, `'change'`, `'input'`, etc.\n- `selector`: CSS selector (e.g. `'.product_item'`)\n- `handler`: `(e, el) => void` where `el` is the matched element\n\n```js\nhandleEvent('click', '.btn', (e, el) => {\n  console.log('Clicked', el.dataset.id);\n});\n```",
        "Cast.on": "**Cast.on(event, selector, handler)**\n\nDelegated event listener on `document`.\n\n- `handler`: `(e, el) => void` where `el` is the matched element",
        "Cast.update": "**Cast.update(selector, data)**\n\nIn-place reactive update for elements or `<select>` options.\n\n```js\nCast.update('#ship_address', optionsList);\n```",
        "Cast.refresh": "**Cast.refresh(selector, endpoint, options)**\n\nFetches updated component HTML fragment and swaps target in DOM.\n\n```js\nCast.refresh('#card', '/_cast/component/card?id=' + id);\n```",
        "Cast.onLoad": "**Cast.onLoad(callback)**\n\nLifecycle hook triggered on DOMContentLoaded and after DOM fragment refreshes.",
        "@script": "**@script( ... )**\n\nComponent script block. Wrapped in an IIFE and registered once per component. Printed by `@scripts`.",
        "@js": "**@js( ... )**\n\nAlias for `@script(...)`. Component script block wrapped in an IIFE.",
        "@css": "**@css( ... )**\n\nComponent stylesheet block. Scoped to the component and supports dynamic `@{ expr }` CSS variables.\n\n```css\n@css(\n  li.active { border-color: @{ props['role'] === 'admin' ? '#fff' : '#666' }; }\n)\n```",
        "@scripts": "**@scripts**\n\nOutputs all collected component scripts and the `cast.js` runtime before `</body>`.",
        "@styles": "**@styles**\n\nOutputs all collected component stylesheets."
      };
      if (builtins[word]) {
        return new vscode.Hover(new vscode.MarkdownString(builtins[word]), wordRange);
      }
    }

    const hit = references(document).find((r) => r.range.contains(position));
    if (!hit) return undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${KIND_TITLE[hit.kind] || "Cast"}** \`${hit.label}\`\n\n`);
    if (hit.file) {
      md.appendMarkdown(`\`${hit.file}\`\n\n`);
      if (hit.kind === "component" || hit.kind === "legacy-component") {
        try {
          const props = propsOf(fs.readFileSync(hit.file, "utf8"));
          if (props.length) md.appendMarkdown(`Props: ${props.map((p) => "`" + p + "`").join(", ")}\n\n`);
        } catch {
          /* unreadable file: no props */
        }
      }
      md.appendMarkdown("Ctrl+click to open.");
    } else {
      md.appendMarkdown("No file found. Looked for:\n\n" + hit.tried.slice(0, 8).map((t) => "- `" + t + "`").join("\n"));
    }
    return new vscode.Hover(md, hit.range);
  }
}


// ------------------------------------------------------------------ component docs

/** The prop name as it is written in a tag, in the style of the `cast.propCase` setting. */
function spell(name, style) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/);
  if (style === "kebab") return words.join("-");
  if (style === "snake") return words.join("_");
  return camel(name);
}

function markdownFor(file, spec, tag) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**<${tag}>**`);
  if (spec.deprecated) md.appendMarkdown(` — *deprecated${spec.deprecated === true ? "" : ": " + spec.deprecated}*`);
  md.appendMarkdown("\n\n");
  if (spec.description) md.appendMarkdown(spec.description + "\n\n");

  if (spec.props.length) {
    md.appendMarkdown("| Prop | Type | | Description |\n| --- | --- | --- | --- |\n");
    for (const p of spec.props) {
      const flag = p.required ? "required" : p.default !== null ? `= ${p.default}` : "optional";
      const text = (p.description || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      md.appendMarkdown(`| \`${p.name}\` | ${p.type ? "`" + p.type.replace(/\|/g, "\\|") + "`" : ""} | ${flag.replace(/\|/g, "\\|")} | ${text} |\n`);
    }
    md.appendMarkdown("\n");
  }
  if (spec.slots.length) md.appendMarkdown("Slots: " + spec.slots.map((s) => `\`${s.name}\`${s.description ? " (" + s.description + ")" : ""}`).join(", ") + "\n\n");
  for (const example of spec.examples) md.appendCodeblock(example, "php");
  md.appendMarkdown(`\`${file}\``);
  return md;
}

function propMarkdown(tag, prop) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${prop.name}**` + (prop.type ? `: \`${prop.type}\`` : "") + (prop.required ? " — required" : prop.default !== null ? ` — default \`${prop.default}\`` : " — optional") + "\n\n");
  if (prop.description) md.appendMarkdown(prop.description + "\n\n");
  if (prop.values.length) md.appendMarkdown("One of: " + prop.values.map((v) => `\`${v}\``).join(", ") + "\n\n");
  md.appendMarkdown(`*prop of* \`<${tag}>\``);
  return md;
}

/** Which refs (components and attributes) the cursor is on, for hover and go-to-definition. */
function componentAt(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const where = locations(document);
  for (const ref of scanComponents(text)) {
    if (ref.name === "Slot") continue;
    if (offset >= ref.start && offset <= ref.end) return { kind: "tag", ref, where, found: lookup(ref.name, where) };
    for (const attr of ref.attrs || []) {
      if (attr.name && offset >= attr.nameStart && offset <= attr.nameEnd) {
        const found = lookup(ref.name, where);
        return { kind: "attribute", ref, attr, where, found, prop: found ? findProp(found.spec, attr.name) : null };
      }
    }
  }
  return null;
}

class Completions {
  provideCompletionItems(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const context = contextAt(text, offset);
    if (!context) return undefined;

    const where = locations(document);
    const config = vscode.workspace.getConfiguration("cast", document.uri);
    const style = config.get("propCase", "camel");
    const range = (a, b) => new vscode.Range(document.positionAt(a), document.positionAt(b));
    const items = [];
    const Kind = vscode.CompletionItemKind;

    if (context.type === "tag") {
      for (const { tag, file } of listComponents(where.componentDirs, where.ext)) {
        const spec = specOf(file);
        const item = new vscode.CompletionItem(tag, Kind.Class);
        item.detail = spec && spec.description ? spec.description.split("\n")[0] : "component";
        if (spec) item.documentation = markdownFor(file, spec, tag);
        const required = spec ? spec.props.filter((p) => p.required && !p.inferred) : [];
        item.insertText = new vscode.SnippetString(tag + required.map((p, i) => ` ${spell(p.name, style)}=` + (p.kind === "string" ? `"$${i + 1}"` : `{$${i + 1}}`)).join(""));
        item.range = range(context.start, context.end);
        item.sortText = spec && spec.deprecated ? "1" + tag : "0" + tag;
        if (spec && spec.deprecated) item.tags = [1];
        items.push(item);
      }
      return items;
    }

    const found = lookup(context.ref.name, where);

    if (context.type === "slot") {
      const parent = context.parent && lookup(context.parent.name, where);
      for (const slot of parent ? parent.spec.slots : []) {
        const item = new vscode.CompletionItem(slot.name, Kind.Field);
        item.detail = slot.description;
        item.range = range(context.start, context.end);
        items.push(item);
      }
      return items;
    }
    if (!found) return undefined;

    if (context.type === "attribute") {
      const used = context.used;
      for (const prop of found.spec.props) {
        if (used.has(camel(prop.name))) continue;
        const name = spell(prop.name, style);
        const item = new vscode.CompletionItem(name, Kind.Property);
        item.detail = [prop.type, prop.required ? "required" : prop.default !== null ? `default ${prop.default}` : "optional"].filter(Boolean).join(" · ");
        item.documentation = propMarkdown(context.ref.name, prop);
        item.sortText = (prop.deprecated ? "2" : prop.required ? "0" : prop.inferred ? "1z" : "1") + name;
        if (prop.deprecated) item.tags = [1];
        const placeholder = prop.values.length ? `\${1|${prop.values.join(",")}|}` : "$1";
        item.insertText = new vscode.SnippetString(prop.kind === "bool" ? name : prop.kind === "string" ? `${name}="${placeholder}"` : `${name}={$1}`);
        item.range = range(context.start, context.end);
        if (prop.kind !== "bool") item.command = { command: "editor.action.triggerSuggest", title: "values" };
        items.push(item);
      }
      return items;
    }

    if (context.type === "value") {
      const prop = findProp(found.spec, context.attr.name);
      if (!prop) return undefined;
      const values = prop.kind === "bool" ? ["true", "false"] : prop.values;
      for (const value of values) {
        const item = new vscode.CompletionItem(value, Kind.EnumMember);
        item.detail = prop.name;
        if (prop.kind === "bool") {
          item.insertText = context.quoted ? value : `{${value}}`;
        } else {
          item.insertText = context.quoted ? value : `"${value}"`;
        }
        item.range = range(context.start, context.end);
        items.push(item);
      }
      return items;
    }
    return undefined;
  }
}

class ComponentHovers {
  provideHover(document, position) {
    const hit = componentAt(document, position);
    if (!hit || !hit.found) return undefined;
    const range = new vscode.Range(
      document.positionAt(hit.kind === "tag" ? hit.ref.start : hit.attr.nameStart),
      document.positionAt(hit.kind === "tag" ? hit.ref.end : hit.attr.nameEnd)
    );
    if (hit.kind === "tag") return new vscode.Hover(markdownFor(hit.found.file, hit.found.spec, hit.ref.name), range);
    return hit.prop ? new vscode.Hover(propMarkdown(hit.ref.name, hit.prop), range) : undefined;
  }
}

/** Ctrl+click on a prop name: the line in the component file that documents or defaults it. */
class PropDefinitions {
  provideDefinition(document, position) {
    const hit = componentAt(document, position);
    if (!hit || hit.kind !== "attribute" || !hit.found || !hit.prop) return undefined;
    let source;
    try {
      source = fs.readFileSync(hit.found.file, "utf8");
    } catch {
      return undefined;
    }
    const name = hit.prop.name.replace(/[$]/g, "");
    const re = new RegExp(`@(?:var|param|prop|property)[^\\n]*\\$${name}\\b|\\$${name}\\s*\\?\\?=`);
    const m = re.exec(source);
    if (!m) return undefined;
    const before = source.slice(0, m.index);
    const line = before.split("\n").length - 1;
    const column = m.index - (before.lastIndexOf("\n") + 1);
    return new vscode.Location(vscode.Uri.file(hit.found.file), new vscode.Position(line, column));
  }
}

const SEVERITY = { hint: 3, warning: 1 };

/** Problems in component tags, shown as hints (the default) or warnings; `cast.diagnostics: off` turns them off. */
function publishDiagnostics(document, collection) {
  if (!/\.cast\.php$/.test(document.uri.fsPath)) return;
  const level = vscode.workspace.getConfiguration("cast", document.uri).get("diagnostics", "hint");
  if (level === "off" || !(level in SEVERITY)) {
    collection.set(document.uri, []);
    return;
  }
  const where = locations(document);
  const problems = diagnose(document.getText(), (tag) => lookup(tag, where));
  collection.set(document.uri, problems.map((p) => {
    const sev = p.severity === "error" ? vscode.DiagnosticSeverity.Error
      : (p.severity === "warning" ? vscode.DiagnosticSeverity.Warning : SEVERITY[level]);
    const d = new vscode.Diagnostic(new vscode.Range(document.positionAt(p.start), document.positionAt(p.end)), p.message, sev);
    d.source = "cast";
    d.code = p.kind;
    d.cast = p;
    if (p.kind === "deprecated" || p.kind === "deprecated-prop") d.tags = [2];
    return d;
  }));
}

class Fixes {
  provideCodeActions(document, range, context) {
    const actions = [];
    for (const d of context.diagnostics) {
      const p = d.cast;
      if (!p) continue;
      if (p.kind === "missing") {
        const style = vscode.workspace.getConfiguration("cast", document.uri).get("propCase", "camel");
        const found = lookup(p.tag, locations(document));
        const text = p.missing.map((m) => {
          const prop = found && findProp(found.spec, m);
          return ` ${spell(m, style)}=` + (prop && prop.kind === "string" ? '""' : "{}");
        }).join("");
        actions.push(edit(`Add ${p.missing.map((m) => `"${m}"`).join(", ")}`, document, d, (we) => we.insert(document.uri, document.positionAt(p.insertAt), text)));
      } else if (p.kind === "unknown" && p.suggestion) {
        const style = vscode.workspace.getConfiguration("cast", document.uri).get("propCase", "camel");
        actions.push(edit(`Change to "${spell(p.suggestion, style)}"`, document, d, (we) => we.replace(document.uri, d.range, spell(p.suggestion, style))));
      } else if (p.kind === "value" && p.values) {
        for (const v of p.values) actions.push(edit(`Use "${v}"`, document, d, (we) => we.replace(document.uri, d.range, v)));
      }
    }
    return actions;
  }
}

function edit(title, document, diagnostic, apply) {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = new vscode.WorkspaceEdit();
  apply(action.edit);
  return action;
}

// ---------------------------------------------------------------------------------------------------------------- indentation

/** Tab settings: the editor's own for the document being formatted, else the workspace's. */
function tabOptions(options) {
  if (options && options.tabSize) return { tabSize: Number(options.tabSize), insertSpaces: options.insertSpaces !== false };
  const editor = vscode.window && vscode.window.activeTextEditor;
  if (editor && editor.options && editor.options.tabSize) return { tabSize: Number(editor.options.tabSize), insertSpaces: editor.options.insertSpaces !== false };
  return { tabSize: 4, insertSpaces: true };
}

/** Edits that change only the leading whitespace of the lines in [first, last] (all lines when omitted). */
function indentEdits(document, options, first = 0, last = Infinity) {
  const lines = document.getText().split(/\r?\n/);
  const { depths } = computeIndents(lines);
  const edits = [];
  for (let i = first; i <= Math.min(last, lines.length - 1); i++) {
    const old = /^[ \t]*/.exec(lines[i])[0];
    if (/^\s*$/.test(lines[i])) {
      if (lines[i].length) edits.push(vscode.TextEdit.replace(new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lines[i].length)), ""));
      continue;
    }
    if (depths[i] === null) continue;
    const wanted = indentString(depths[i], tabOptions(options));
    if (wanted !== old) edits.push(vscode.TextEdit.replace(new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, old.length)), wanted));
  }
  return edits;
}

class Formatter {
  provideDocumentFormattingEdits(document, options) {
    return indentEdits(document, options);
  }
  provideDocumentRangeFormattingEdits(document, range, options) {
    return indentEdits(document, options, range.start.line, range.end.line);
  }
}

const CLOSING_LINE = /^\s*(<\/[A-Za-z]|<\?(php|=)?\s*(end\w+|else\w*|\})|@(endif|endfor|endforeach|endforelse|endwhile|endunless|endisset|endswitch|endphp|else|elseif|empty|case|default)\b)/;

/**
 * Keeps the indent right while typing, whether or not `editor.formatOnType` is on: after Enter the new line gets the right indent
 * (and the line just finished is corrected: you typed `@endif` or `</div>` and pressed Enter), and a line that starts with a closing tag,
 * `<?php endif ?>` or `@endif` / `@else` moves back as soon as it is typed.
 */
function autoIndent(event) {
  const document = event.document;
  if (!document.uri || !String(document.uri.fsPath).endsWith(".cast.php")) return;
  if (!vscode.workspace.getConfiguration("cast", document.uri).get("autoIndent", true)) return;
  if (autoIndent.busy || event.contentChanges.length !== 1) return;
  const change = event.contentChanges[0];
  const lines = document.getText().split(/\r?\n/);

  const targets = [];
  if (/^\r?\n[ \t]*$/.test(change.text)) {
    const next = change.range.start.line + 1;
    targets.push(next);
    if (next - 1 >= 0) targets.push(next - 1);
  } else if (change.text.length === 1 && /[>a-z}]/i.test(change.text)) {
    const line = change.range.start.line;
    if (CLOSING_LINE.test(lines[line] || "")) targets.push(line);
  }
  if (!targets.length) return;

  const options = tabOptions(null);
  const edit = new vscode.WorkspaceEdit();
  let any = false;
  for (const line of targets) {
    const wanted = indentFor(lines, line, options);
    if (wanted === null) continue;
    const old = /^[ \t]*/.exec(lines[line])[0];
    if (wanted !== old) {
      edit.replace(document.uri, new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, old.length)), wanted);
      any = true;
    }
  }
  if (!any) return;
  autoIndent.busy = true;
  Promise.resolve(vscode.workspace.applyEdit(edit)).finally(() => (autoIndent.busy = false));
}

/** "Cast: Fix indentation": the selection, or the whole view. */
async function fixIndentation() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !String(editor.document.uri.fsPath).endsWith(".cast.php")) return;
  const selection = editor.selection;
  const options = tabOptions(editor.options);
  const edits = selection && !selection.isEmpty ? indentEdits(editor.document, options, selection.start.line, selection.end.line) : indentEdits(editor.document, options);
  const edit = new vscode.WorkspaceEdit();
  for (const e of edits) edit.replace(editor.document.uri, e.range, e.newText);
  await vscode.workspace.applyEdit(edit);
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("cast");
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(SELECTOR, new Links()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new Definitions()),
    vscode.languages.registerDefinitionProvider(SELECTOR, new PropDefinitions()),
    vscode.languages.registerHoverProvider(SELECTOR, new ComponentHovers()),
    vscode.languages.registerHoverProvider(SELECTOR, new Hovers()),
    vscode.languages.registerCompletionItemProvider(SELECTOR, new Completions(), "<", " ", '"', "'", "=", "."),
    vscode.languages.registerCodeActionsProvider(SELECTOR, new Fixes(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    diagnostics
  );
  const formatter = new Formatter();
  if (vscode.languages.registerDocumentFormattingEditProvider) {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(SELECTOR, formatter),
      vscode.languages.registerDocumentRangeFormattingEditProvider(SELECTOR, formatter)
    );
  }
  if (vscode.commands && vscode.commands.registerCommand) context.subscriptions.push(vscode.commands.registerCommand("cast.fixIndentation", fixIndentation));
  if (vscode.workspace.onDidChangeTextDocument && !vscode.workspace.onDidOpenTextDocument) {
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(autoIndent)); // (the diagnostics block below registers its own)
  }

  // problems are refreshed when a file opens or changes (a short delay while typing), and when settings change
  const timers = new Map();
  const refresh = (document) => {
    clearTimeout(timers.get(document.uri.fsPath));
    timers.set(document.uri.fsPath, setTimeout(() => publishDiagnostics(document, diagnostics), 250));
  };
  if (vscode.workspace.onDidOpenTextDocument) {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(refresh),
      vscode.workspace.onDidChangeTextDocument((e) => {
        refresh(e.document);
        autoIndent(e);
      }),
      vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
      vscode.workspace.onDidSaveTextDocument(refresh),
      vscode.workspace.onDidChangeConfiguration(() => (vscode.workspace.textDocuments || []).forEach(refresh))
    );
    (vscode.workspace.textDocuments || []).forEach(refresh);
  }
}

function deactivate() {}

module.exports = { activate, deactivate, references, locations, publishDiagnostics, spell, indentEdits, autoIndent, Formatter };
