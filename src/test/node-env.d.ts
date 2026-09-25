// Tests run under Vitest on Node, and some read the filesystem or spawn
// processes through `node:*` modules. This file gives them Node's types. It
// lives under src/test/, which tsconfig.json excludes, so app code never sees
// Node's globals; tsconfig.test.json includes it.
/// <reference types="node" />
