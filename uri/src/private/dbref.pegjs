dbreference = table:table columns:('?' columns? ('?' scope? ('?' filter? ('?' params? )? )? )? )?
              { return { table, columns: columns?.[1], scope: columns?.[2]?.[1], filter: columns?.[2]?.[2]?.[1], params: columns?.[2]?.[2]?.[2]?.[1] } }
// dbreference = table:table columns:('(' columns ')')? scope:(';' scope)? filter:('?' filter )? params:params?
//               { return { table, columns: columns?.[1], scope: scope?.[1], filter: filter?.[1], params: params } }

table       = table_path
columns     = column_list
scope       = $('scalar' / 'one' / 'unique' / 'all')
filter      = expr
params      = param_list

expr        = expr_rel / expr_bool / expr_not
expr_rel    = '(' op:$expr_ops ',' column:word ',' value:word ')'  { return { op, column, value } }
expr_bool   = '(' op:$('and' / 'or') value:expr+ ')'               { return { op, value } }
expr_not    = '(' op:$'not' value:expr ')'                         { return { op, value } }
expr_ops    = 'lt' / 'le' / 'eq' / 'ne' / 'ge' / 'gt'

table_path  = head:word tail:('/' word)*                           { return [ head, ...tail.map((t: string[]) => t[1]) ] }
column_list = head:word tail:(',' word)*                           { return [ head, ...tail.map((t: string[]) => t[1]) ] }
param_list  = head:param tail:(',' param)*                         { return Object.fromEntries([ head, ...tail.map((t: object[]) => t[1]) ]) }
// param_list  = params:('&' param)+                                  { return Object.fromEntries(params.map((t: object[]) => t[1])) }

param       = key:param_key '=' value:word                         { return [ key, value ] }
param_key   = 'offset' / 'count' / 'sort' / 'key'

word        = word:$character+                                     { return decodeURIComponent(word) }
character   = unreserved / special / encoded
unreserved  = [0-9A-Za-z._~-]
special     = [!'*]                                                // Also allow chars not encoded by encodeURIComponent(), except ()
encoded     = '%' [0-9A-Fa-f] [0-9A-Fa-f]
