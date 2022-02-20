---
sidebar_position: 3
---

# Remote Procedure Calls

Sometimes, especially if you need to split your application into multiple independent processes or containers for
security reasons, you just want to provide and call some internal service APIs with minimal effort — without having to
think too hard about API design, REST access patterns and so on.

For these situations, the WSF provides a small HTTP-based RPC subsystem that allows you to define APIs in TypeScript and
create both clients and servers *with zero code duplication* and no code generation compiler step. It's all just
interfaces and runtime objects, which is really neat.

TBD. In the meantime, see [createRCPClient] and [createRCPService].

[createRCPClient]:  ../api/modules/divine_web_service.md#createrpcclient
[createRCPService]: ../api/modules/divine_web_service.md#createrpcservice
