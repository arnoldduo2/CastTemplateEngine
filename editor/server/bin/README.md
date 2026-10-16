# bin/

`phpactor.phar` goes here: `editor/server/bin/phpactor.phar`.

It is not committed to the repository (see `.gitignore`). `php cast engine:editor-install lsp`
(or `engine:editor-install all`) detects whether it's present and offers to download a
pinned, checksum-verified release automatically. To install it manually instead, download
the phar from https://github.com/phpactor/phpactor/releases/latest and save it at the path
above.

`editor/server/src/php/engine.ts` looks for it here at runtime; if it's missing, the language
server still runs — only PHP-aware features (hover/definition into embedded PHP) are disabled.
