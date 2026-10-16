;; Keywords and Directive Markers
[
  "@props"
  "extends::"
  "@if"
  "@elseif"
  "@else"
  "@endif"
  "@unless"
  "@endunless"
  "@isset"
  "@endisset"
  "@for"
  "@endfor"
  "@foreach"
  "@endforeach"
  "@forelse"
  "@endforelse"
  "@empty"
  "@while"
  "@endwhile"
  "@switch"
  "@case"
  "@default"
  "@endswitch"
  "@php"
  "@endphp"
  "@break"
  "@continue"
  "@css"
  "@script"
  "@js"
] @keyword

;; Function Directives & Fluent Chains
(directive_name) @function.macro
(chain_target) @variable
(chain_method) @function.method

;; Props Block
(props_block extends: (component_path) @type)
(props_entry type: (type_expression) @type)
(props_entry name: (variable_name) @variable.parameter)

;; PHP & Echo Tags
[
  "@{"
  "}"
] @punctuation.bracket

[
  "<?="
  "<?php"
  "?>"
] @keyword.directive

(escaped_at) @string.escape

;; Components
(component_name) @tag
(attribute_name) @attribute

;; HTML Elements
(html_tag_name) @tag
(html_attribute (attribute_name) @attribute)
(doctype) @keyword.directive

;; Strings & Comments
(single_quoted_string) @string
(double_quoted_string) @string
(comment) @comment
(html_comment) @comment

;; Delimiters & Operators
[
  "<"
  ">"
  "</"
  "/>"
  "("
  ")"
  "{"
  "}"
  "["
  "]"
  ";"
  "="
  "|"
  "?"
  "..."
] @punctuation.delimiter
