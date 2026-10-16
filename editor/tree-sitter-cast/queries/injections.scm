;; Injections for embedded languages in Cast templates

;; Echo holes: @{ $expr }
((echo_hole (php_expression) @injection.content)
 (#set! injection.language "php"))

;; PHP short echo: <?= $expr ?>
((php_echo_tag (php_code) @injection.content)
 (#set! injection.language "php"))

;; PHP block: <?php ... ?>
((php_tag (php_code) @injection.content)
 (#set! injection.language "php"))

;; Directive arguments: @if(...) etc.
((directive_arguments (argument_expression) @injection.content)
 (#set! injection.language "php"))

;; Component expression attributes: prop={$expr}
((expression_attribute (php_expression) @injection.content)
 (#set! injection.language "php"))

;; Component spread attributes: {...$props}
((spread_attribute (php_expression) @injection.content)
 (#set! injection.language "php"))

;; Scoped CSS: @css(...)
((css_statement (css_content) @injection.content)
 (#set! injection.language "css"))

;; Scoped JS: @script(...) or @js(...)
((script_statement (script_content) @injection.content)
 (#set! injection.language "javascript"))
