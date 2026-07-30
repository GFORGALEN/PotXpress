# TypeScript 渐进迁移设计

## 目标

PotXpress 不做一次性全量改写。工作区允许 JavaScript 与 TypeScript 并存，
但所有新迁移的 TypeScript 文件立即执行完整严格检查。迁移以业务边界为单位，
每次都必须通过类型检查、测试和生产构建。

## Workspace 边界

```text
PotXpress/
├─ packages/
│  └─ contracts/       # 跨进程、跨端、持久化契约
├─ server/             # Node.js / Express
├─ client/             # React / Vite
├─ package.json        # npm workspaces 与统一命令
├─ package-lock.json   # 唯一依赖锁文件
└─ tsconfig.base.json  # 全工作区严格规则
```

包的依赖方向固定为：

```text
@potxpress/client ─┐
                   ├──> @potxpress/contracts
@potxpress/server ─┘
```

`contracts` 不依赖客户端或服务端，禁止在其中加入数据库、HTTP、浏览器或 React
代码。

## Zod 与 TypeScript 的唯一来源

跨边界数据先定义 Zod schema，再通过 `z.infer` 导出类型：

```ts
export const tableSchema = z.object({
  id: identifierSchema,
  name: z.string(),
});

export type Table = z.infer<typeof tableSchema>;
```

不再手写一份同名 interface。这样运行时校验和编译期类型不会独立漂移。

契约分为三层：

1. 持久化模型：`Table`、`ActiveTimer`、`Record`、`StoredLayout`。
2. API 模型：计算后的 `Timer`、聚合后的 `Layout`、API 成功/失败 envelope。
3. 实时协议：客户端消息、服务端消息和带门店版本号的 `WebSocketEvent`。

服务端 `src/storage/dataSchemas.js` 只保留兼容别名，真实 schema 来自
`@potxpress/contracts`。服务端的命令输入 validator 暂时仍留在服务端，因为它们
是具体 HTTP 操作的输入规则，而不是跨端持久对象；后续迁移某个 API 时再判断是否
提升为共享契约。

## 严格度

当前采用“作用域渐进、规则一次到位”：

- `.ts` / `.tsx`：`strict`、`noUncheckedIndexedAccess`、
  `exactOptionalPropertyTypes`、未使用代码检查、隐式返回检查、索引签名属性检查
  全部启用。
- `.js` / `.jsx`：允许被 TypeScript 项目引用，但暂不启用 `checkJs`。
- Node.js 直接运行的 `.ts` 模板只使用可擦除类型语法，兼容 Node.js 24 的原生
  TypeScript type stripping。

建议后续阶段：

1. 按模块把 `.js` 改为 `.ts`，保持 `checkJs=false`。
2. 模块迁完后缩小 `allowJs` 的包含范围。
3. 最后删除 `allowJs`；不要用关闭严格选项来换取迁移速度。

## API 客户端模板

`client/src/api/typedClient.ts` 不使用 `as Data` 信任服务端，而是要求调用方传入
Zod schema。响应的 `data` 会在浏览器边界解析后才返回给业务代码。

`timers.ts` 展示有幂等写入、可取消读取、计算字段和多种响应结构的迁移方式；
`layout.ts` 展示读写 payload 校验及乐观版本字段的迁移方式。

## 服务端模板

`server/src/utils/timeCalculator.ts` 展示纯业务模块的迁移方式：

- 只从 contracts 导入类型；
- 用 `Pick<ActiveTimer, ...>` 声明最小输入；
- 为公开函数标明参数与返回值；
- 保持 JavaScript 调用方可直接使用。

## 每批迁移的验收门

从项目根目录运行：

```powershell
npm run typecheck
npm test
npm run build
```

任何新增事件类型、字段或 API 响应都必须先修改 `packages/contracts`，然后同时
调整生产者、消费者和契约测试。WebSocket 事件类型是封闭枚举，未知事件会在校验
阶段失败，避免客户端静默接受未实现的协议。
