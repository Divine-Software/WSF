# Database SQL Queries

To say that databases are an important part of most web services is, of course, an understatement — they are
*fundamental*. So having a nice database API matters. In the WSF, this means that you can execute SQL queries without
having to worry about connections, pools, query injection vulnerabilities, transaction management and deadlock handling,
all with a single consistent API that works the same with a wide range of SQL databases.

As mentioned in the [database connection] section before, the database support in WSF is mostly about executing SQL
queries in a pleasant way. If you prefer ORMs like [Prisma] or [TypeORM] you should keep using the tools you
like[^1]. Strongly typed database APIs are awesome, there's no denying that.

[database connection]: ../connect/databases.md
[Prisma]:              https://www.prisma.io/
[TypeORM]:             https://typeorm.io/
[pg]:                  https://github.com/brianc/node-postgres
[node-mssql]:          https://tediousjs.github.io/node-mssql/

[^1]: Or even if you prefer to use a Node.js database driver like [pg] or [node-mssql] directly, in order to gain access
to every advanced feature those drivers provide. Just stay safe and keep your parameters encoded.
