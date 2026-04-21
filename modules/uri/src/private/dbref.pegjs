dbreference = table:table keys:('[' keys ']')? columns:('(' columns ')')? scope:(';' scope)? filter:('?' filter )? params:params?
              { return { table, keys: keys?.[1], columns: columns?.[1], scope: scope?.[1], filter: filter?.[1], params: params } }

table       = table_path
keys        = column_list
columns     = column_list
scope       = $('scalar' / 'one' / 'unique' / 'all')
filter      = expr
params      = param_list

expr        =  expr_rel / expr_in / expr_null /expr_fn / expr_bool / expr_not
expr_rel    = '{' op:$expr_ops ',' column:word ',' value:value '}' { return { op, column, value } }
expr_in     = '{' op:$'in' ','column:word ',' value:value_list?'}' { return { op, column, value: value ?? [] } }
expr_null   = '{' op:$'null' ',' column:word '}'                   { return { op, column } }
expr_fn     = '{' fn:word '[' value:value_list? ']}'               { return { op: 'fn', fn, value: value ?? [] } }
expr_bool   = '{' op:$('and' / 'or') value:expr+ '}'               { return { op, value } }
expr_not    = '{' op:$'not' value:expr '}'                         { return { op, value } }
expr_ops    = 'lt' / 'le' / 'eq' / 'ne' / 'ge' / 'gt'

table_path  = head:word tail:('/' word)*                           { return [ head, ...tail.map(t => t[1]) ] }
column_list = head:word tail:(',' word)*                           { return [ head, ...tail.map(t => t[1]) ] }
param_list  = params:('&' param)+                                  { return params.map(t => t[1]) }
value_list  = head:value tail:(',' value)*                         { return [ head, ...tail.map(t => t[1]) ] }

param       = key:param_key '=' value:value                        { return [ key, value ] }
param_key   = 'order' / 'limit' / 'offset' / 'lock'

word        = word:$char+                                          { return decodeURIComponent(word) }
char        = unreserved / encoded

value       = value:$vchar+                                        { return decodeURIComponent(value) }
vchar       = unreserved / special / encoded

unreserved  = [0-9A-Za-z._~-]
special     = [!'()*]                                              // Also allow chars not encoded by encodeURIComponent()
encoded     = '%' [0-9A-Fa-f] [0-9A-Fa-f]
