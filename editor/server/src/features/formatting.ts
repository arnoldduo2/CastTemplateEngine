import {
  FormattingOptions,
  Range,
  TextEdit
} from 'vscode-languageserver';
import { formatCast } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';

export class FormattingProvider {
  public format(doc: CastDocument, options: FormattingOptions): TextEdit[] {
    const lines = doc.text.split('\n');
    const newText = formatCast(doc.text, { tabSize: options.tabSize, insertSpaces: options.insertSpaces });

    if (newText === doc.text) {
      return [];
    }

    const lastLine = Math.max(0, lines.length - 1);
    const lastCol = lines[lastLine]?.length ?? 0;

    return [
      TextEdit.replace(
        Range.create(0, 0, lastLine, lastCol),
        newText
      )
    ];
  }
}
