module.exports = grammar({
  name: 'cast',

  extras: $ => [
    /\s+/
  ],

  conflicts: $ => [
    [$.case_clause],
    [$.default_clause]
  ],

  rules: {
    template: $ => repeat($._node),

    _node: $ => choice(
      $.props_block,
      $.echo_hole,
      $.php_echo_tag,
      $.php_tag,
      $.escaped_at,
      $.if_statement,
      $.unless_statement,
      $.isset_statement,
      $.for_statement,
      $.foreach_statement,
      $.forelse_statement,
      $.while_statement,
      $.switch_statement,
      $.php_statement,
      $.loop_control,
      $.css_statement,
      $.script_statement,
      $.fluent_chain,
      $.directive_call,
      $.component_element,
      $.doctype,
      $.html_comment,
      $.html_start_tag,
      $.html_end_tag,
      $.html_self_closing_tag,
      $.text
    ),

    // --- @props block ---
    props_block: $ => seq(
      '@props',
      optional(seq(
        'extends::',
        field('extends', $.component_path)
      )),
      '{',
      repeat(choice(
        $.props_entry,
        $.comment
      )),
      '}'
    ),

    component_path: $ => /[A-Z][a-zA-Z0-9_]*(?:\.[A-Za-z0-9_]+)*/,

    props_entry: $ => seq(
      field('type', $.type_expression),
      field('name', $.variable_name),
      optional(seq(
        '=',
        field('default', $._props_default_value)
      )),
      ';'
    ),

    type_expression: $ => seq(
      optional('?'),
      $.type_identifier,
      repeat(seq(
        '|',
        optional('?'),
        $.type_identifier
      ))
    ),

    type_identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    variable_name: $ => /\$[A-Za-z_][A-Za-z0-9_]*/,

    _props_default_value: $ => repeat1(choice(
      /[^;{}()"'\[\]\r\n\/]+/,
      $.single_quoted_string,
      $.double_quoted_string,
      seq('[', optional($._props_default_value), ']'),
      seq('(', optional($._props_default_value), ')'),
      seq('{', optional($._props_default_value), '}')
    )),

    // --- Echo & PHP ---
    echo_hole: $ => seq(
      '@{',
      optional(field('expression', $.php_expression)),
      '}'
    ),

    php_echo_tag: $ => seq(
      '<?=',
      optional(field('code', $.php_code)),
      '?>'
    ),

    php_tag: $ => seq(
      '<?php',
      optional(field('code', $.php_code)),
      '?>'
    ),

    php_code: $ => repeat1(choice(
      /[^?]+/,
      /\?[^>]/
    )),

    escaped_at: $ => '@@',

    php_expression: $ => repeat1(choice(
      /[^{}"'`]+/,
      $.single_quoted_string,
      $.double_quoted_string,
      seq('{', optional($.php_expression), '}'),
      seq('(', optional($.php_expression), ')'),
      seq('[', optional($.php_expression), ']')
    )),

    // --- Control Flow Directives ---
    if_statement: $ => seq(
      '@if',
      field('condition', $.directive_arguments),
      field('consequence', repeat($._node)),
      repeat(field('alternative', $.elseif_clause)),
      optional(field('alternative', $.else_clause)),
      '@endif'
    ),

    elseif_clause: $ => seq(
      '@elseif',
      field('condition', $.directive_arguments),
      field('consequence', repeat($._node))
    ),

    else_clause: $ => seq(
      '@else',
      field('consequence', repeat($._node))
    ),

    unless_statement: $ => seq(
      '@unless',
      field('condition', $.directive_arguments),
      field('consequence', repeat($._node)),
      optional(field('alternative', $.else_clause)),
      '@endunless'
    ),

    isset_statement: $ => seq(
      '@isset',
      field('condition', $.directive_arguments),
      field('consequence', repeat($._node)),
      optional(field('alternative', $.else_clause)),
      '@endisset'
    ),

    for_statement: $ => seq(
      '@for',
      field('arguments', $.directive_arguments),
      field('body', repeat($._node)),
      '@endfor'
    ),

    foreach_statement: $ => seq(
      '@foreach',
      field('arguments', $.directive_arguments),
      field('body', repeat($._node)),
      '@endforeach'
    ),

    forelse_statement: $ => seq(
      '@forelse',
      field('arguments', $.directive_arguments),
      field('body', repeat($._node)),
      optional(field('empty', $.empty_clause)),
      '@endforelse'
    ),

    empty_clause: $ => seq(
      '@empty',
      field('body', repeat($._node))
    ),

    while_statement: $ => seq(
      '@while',
      field('condition', $.directive_arguments),
      field('body', repeat($._node)),
      '@endwhile'
    ),

    switch_statement: $ => seq(
      '@switch',
      field('condition', $.directive_arguments),
      repeat(choice(
        $.case_clause,
        $.default_clause,
        $._node
      )),
      '@endswitch'
    ),

    case_clause: $ => seq(
      '@case',
      field('value', $.directive_arguments),
      repeat($._node)
    ),

    default_clause: $ => seq(
      '@default',
      repeat($._node)
    ),

    php_statement: $ => choice(
      seq('@php', repeat($._node), '@endphp'),
      seq('@php', $.directive_arguments)
    ),

    loop_control: $ => seq(
      choice('@break', '@continue'),
      optional($.directive_arguments)
    ),

    css_statement: $ => seq(
      '@css',
      '(',
      optional(field('content', $.css_content)),
      ')'
    ),

    css_content: $ => repeat1(choice(
      /[^()"'`]+/,
      $.single_quoted_string,
      $.double_quoted_string,
      seq('(', optional($.css_content), ')')
    )),

    script_statement: $ => seq(
      choice('@script', '@js'),
      '(',
      optional(field('content', $.script_content)),
      ')'
    ),

    script_content: $ => repeat1(choice(
      /[^()"'`]+/,
      $.single_quoted_string,
      $.double_quoted_string,
      seq('(', optional($.script_content), ')')
    )),

    fluent_chain: $ => seq(
      '@',
      field('target', $.chain_target),
      repeat1(seq(
        '.',
        field('method', $.chain_method),
        $.directive_arguments
      ))
    ),

    chain_target: $ => /\$?[A-Za-z_][A-Za-z0-9_]*/,

    chain_method: $ => choice('filter', 'map'),

    directive_call: $ => seq(
      field('name', $.directive_name),
      optional($.directive_arguments)
    ),

    directive_name: $ => token(prec(-1, seq(
      '@',
      choice(
        'htchars', 'route', 'cast', 'csrf', 'alerts', 'modules',
        'map', 'filter', 'styles', 'scripts',
        /[a-zA-Z_][a-zA-Z0-9_]*/
      )
    ))),

    directive_arguments: $ => seq(
      '(',
      optional(field('expression', $.argument_expression)),
      ')'
    ),

    argument_expression: $ => repeat1(choice(
      /[^()"'`]+/,
      $.single_quoted_string,
      $.double_quoted_string,
      seq('(', optional($.argument_expression), ')'),
      seq('[', optional($.argument_expression), ']'),
      seq('{', optional($.argument_expression), '}')
    )),

    // --- Component Tags ---
    component_element: $ => choice(
      $.self_closing_component,
      $.paired_component
    ),

    self_closing_component: $ => seq(
      '<',
      field('name', $.component_name),
      repeat($.component_attribute),
      '/>'
    ),

    paired_component: $ => seq(
      '<',
      field('name', $.component_name),
      repeat($.component_attribute),
      '>',
      repeat($._node),
      '</',
      field('close_name', $.component_name),
      '>'
    ),

    component_name: $ => token(seq(
      choice(
        'Slot',
        /[A-Z][A-Za-z0-9_]*/
      ),
      repeat(seq('.', /[A-Z][A-Za-z0-9_]*/))
    )),

    component_attribute: $ => choice(
      $.expression_attribute,
      $.string_attribute,
      $.spread_attribute,
      $.boolean_attribute,
      $._directive_in_tag
    ),

    expression_attribute: $ => seq(
      field('name', $.attribute_name),
      '=',
      '{',
      optional(field('value', $.php_expression)),
      '}'
    ),

    string_attribute: $ => seq(
      field('name', $.attribute_name),
      '=',
      field('value', choice($.single_quoted_string, $.double_quoted_string))
    ),

    spread_attribute: $ => seq(
      '{',
      '...',
      field('value', $.php_expression),
      '}'
    ),

    boolean_attribute: $ => field('name', $.attribute_name),

    attribute_name: $ => /[:@a-zA-Z_][a-zA-Z0-9_\-:]*/,

    _directive_in_tag: $ => choice(
      $.if_statement,
      $.unless_statement,
      $.isset_statement,
      $.directive_call,
      $.echo_hole
    ),

    // --- HTML Markup ---
    doctype: $ => seq(
      '<!',
      /[Dd][Oo][Cc][Tt][Yy][Pp][Ee]/,
      /[^>]+/,
      '>'
    ),

    html_comment: $ => seq(
      '<!--',
      repeat(/[^-]+|-/),
      '-->'
    ),

    html_start_tag: $ => seq(
      '<',
      field('name', $.html_tag_name),
      repeat(choice($.html_attribute, $._directive_in_tag)),
      '>'
    ),

    html_end_tag: $ => seq(
      '</',
      field('name', $.html_tag_name),
      '>'
    ),

    html_self_closing_tag: $ => seq(
      '<',
      field('name', $.html_tag_name),
      repeat(choice($.html_attribute, $._directive_in_tag)),
      '/>'
    ),

    html_tag_name: $ => token(prec(-1, /[a-z0-9]+(-[a-z0-9]+)*/)),

    html_attribute: $ => choice(
      seq(
        field('name', $.attribute_name),
        optional(seq(
          '=',
          choice(
            $.single_quoted_string,
            $.double_quoted_string,
            $.unquoted_attribute_value,
            seq('{', optional($.php_expression), '}')
          )
        ))
      )
    ),

    unquoted_attribute_value: $ => /[^\s<>"'=]+/,

    // --- Primitives ---
    single_quoted_string: $ => seq(
      "'",
      repeat(/[^'\\]+|\\./),
      "'"
    ),

    double_quoted_string: $ => seq(
      '"',
      repeat(/[^"\\]+|\\./),
      '"'
    ),

    comment: $ => choice(
      seq('//', /[^\r\n]*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')
    ),

    text: $ => prec(-2, repeat1(choice(
      /[^<@\s]+/,
      token(prec(-1, /@[^a-zA-Z{]/)),
      token(prec(-1, /<[^a-zA-Z\/!?]/))
    )))
  }
});
