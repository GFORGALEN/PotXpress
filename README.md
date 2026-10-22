# PotXpress

PotXpress 是面向餐厅、台球厅等门店的桌台计时与运营管理网页应用。它提供实时计时看板、平面布局编辑、声音提醒、历史记录、门店/桌台/用户管理，并支持手机端操作。

## 交付进度

- [x] 模块 1：后端基础、PostgreSQL 存储、事务恢复、身份认证
- [x] 模块 2：门店、桌台、设置与布局 API
- [x] 模块 3：计时状态机、历史记录、CSV 与审计日志
- [x] 模块 4：React 前端工程、登录、权限路由与响应式框架
- [x] 模块 5：实时桌台计时看板
- [x] 模块 6：可拖拽、缩放并带版本冲突保护的布局编辑器
- [x] 模块 7：计时操作、预警、超时确认与 WebAudio 声音提醒
- [x] 模块 8：后台管理、用户与密码安全、手机列表和生产发布

## 主要能力

- WebSocket 事件驱动的实时计时看板，断线时自动回退轮询。
- 开始、暂停、继续、加减时、超时确认、清台和历史记录。
- 管理员可对门店一键清台，所有专项处理均独立留痕。
- 16:9 门店平面画布，桌台拖拽、缩放、网格吸附、重叠检查和乐观锁保存。
- 浏览器声音授权、本机静音、门店声音策略和跨设备超时确认。
- 门店、桌台、用户、设置、记录和审计日志管理页面。
- 空闲桌台支持单个或批量永久删除，历史计时记录和拼桌成员快照会保留；正在计时或仍属于拼桌组的桌台需先清台或解除拼桌。
- 桌台支持区域、人数、圆桌/方桌/长桌/包厢桌形状和独立默认时长。
- 临时或固定拼桌组共享一套计时、提醒与清台记录，成员桌可从任意一桌操作。
- 用户角色和门店隔离；密码、角色、门店或启用状态变化会使旧令牌失效。
- 375px 起的手机适配；看板默认使用持久化的桌台列表，也可切换平面图。
- Express 在生产模式下通过同一端口提供 API、静态资源和 SPA 路由回退。

## 环境要求

- Node.js 24 或更高版本
- npm 11（从仓库根目录使用 workspaces）

## 技术栈与目录

- 前端：React 19、React Router 7、Vite 8、Tailwind CSS 4、Axios。
- 后端：Node.js、Express、PostgreSQL、ws、Zod、JWT、bcrypt。
- `packages/contracts`：Table、Timer、Record、Layout、WebSocket 等共享
  Zod 契约及其推导出的 TypeScript 类型。
- `client/src`：页面、组件、上下文、浏览器 API 客户端和工具函数。
- `server/src`：路由、控制器、服务、仓储、校验器和 PostgreSQL 存储层。
- `server/test` 与 `client/test`：自动化测试。
- `rules` 不属于运行时；项目按仓库外的分模块规格完成。

TypeScript 采用渐进迁移：现有 JavaScript 可以继续运行，新迁移文件执行完整
严格检查。契约来源、严格度和模块迁移模板见
[`docs/typescript-migration.md`](docs/typescript-migration.md)。

业务资源保存在 PostgreSQL 中。计时、历史记录、拼桌、审计日志与
幂等响应、实时事件版本通过同一数据库事务提交。并发控制按门店划分：

- 门店内的写事务持有该门店的事务级 advisory lock（并共享全局锁），
  A 店开台不会阻塞 B 店；同一门店的写入在多个服务实例之间同样串行。
- 跨门店的写入（门店、用户管理、数据初始化）独占全局锁。
- 只读请求不加锁、不排队，使用一致性快照。
- 只追加的审计日志不读取历史、不加锁。
- 持续增长的历史表（计时记录、干预记录、审计日志、幂等键、实时事件）
  读取时必须给出 SQL 范围（门店、ID、门店本地日期或行数上限），
  存储层会直接拒绝整表读取。
- 服务端为锁等待（5 秒）与单条 SQL（10 秒）设置上限，超时返回
  `503 DATABASE_BUSY`，不会拖到浏览器 15 秒超时。

历史记录同时保存 `groupId` 与成员桌台快照，因此解除临时拼桌后仍可追溯。

数据库结构通过 `server/src/storage/database.js` 中只追加的版本化迁移
升级（`schema_migrations` 登记，启动时在单个事务中用 advisory lock 互斥执行，
多个实例同时启动也只执行一次）。基线 schemaVersion 6 使用显式业务列、主键、唯一约束、外键和门店维度
索引，不再把整条业务记录放进通用 `payload JSONB`。拼桌成员、计时成员和
调整历史使用独立明细表；只有画布布局、审计前后快照、幂等响应和实时事件
载荷等复杂或整体保存的数据使用 JSONB。HTTP 与 WebSocket 接口仍使用 JSON；启动迁移会在事务内把旧版
`payload` 表转换为关系表。

## 实时连接

- 浏览器使用 `/ws` 和 `potxpress.v1` 子协议连接，JWT 通过连接后的首个
  鉴权消息发送，不放在 URL 中。
- 服务端同时校验 JWT、`tokenVersion`、用户状态、角色及门店访问权；
  每条连接只加入一个门店房间，并定期重新鉴权。
- 状态变化会在数据库事务中取得单调递增的门店事件版本。事务提交后才广播；
  不会每秒广播倒计时。
- 客户端按版本忽略重复事件；遇到版本缺口、重新连接或服务实例变化时重新
  获取完整计时快照。
- WebSocket 断开时使用 3 秒轮询，连接正常时保留 60 秒安全轮询，因而即使
  广播丢失或 WebSocket 被代理阻断也能恢复。
- 多实例：事件写入时在同一事务内 `pg_notify`，提交后每个实例通过
  `LISTEN` 收到通知并推送给自己的连接。`LISTEN` 需要会话级连接；如果
  `DATABASE_URL` 指向事务模式连接池（如 Supabase 的 6543 端口），请把
  `REALTIME_LISTEN_DATABASE_URL` 设为直连或会话模式地址。监听不可用时
  自动重连，期间由客户端版本缺口检测与安全轮询兜底。
- 登录失败限流计数保存在 PostgreSQL（只存 IP+用户名的摘要），多实例共享。
- 计时列表等 GET 接口只读。超时提醒与自动清台由后台结算完成：每个实例
  每 30 秒巡检一次，读接口发现待结算时也会登记一次（同一门店去重），
  结算完成后通过实时事件推送。

## 店员入口链接

- 系统管理员或本店管理员通过 `GET /api/stores/:storeId/kiosk-link` 获取
  链接，通过 `POST /api/stores/:storeId/kiosk-link/rotate` 更换。更换只作废
  该门店的旧链接，不影响其他门店与已登录用户。
- 数据库只保存链接密钥的 SHA-256 摘要，登录时按摘要索引查找。
- 升级前发出的链接继续有效，直到该门店第一次更换；更换 `JWT_SECRET`
  仍会使所有门店链接失效。

## 环境变量

| 变量 | 开发默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 生产运行必须设为 `production` |
| `PORT` | `3001` | HTTP 监听端口 |
| `JWT_SECRET` | 开发占位值 | 生产必须为至少 32 字符的随机值 |
| `BOOTSTRAP_ADMIN_USERNAME` | 空 | 空库首次启动时创建的系统管理员用户名 |
| `BOOTSTRAP_ADMIN_DISPLAY_NAME` | 空 | 空库首次启动时创建的系统管理员显示名 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 空 | 空库首次启动时创建的系统管理员密码，成功后应连同其他两个初始化变量一起删除 |
| `CORS_ORIGIN` | `http://localhost:5173` | 额外允许的前端来源，多个值用逗号分隔；同源生产可留空 |
| `DATABASE_URL` | `postgres://potxpress:potxpress@127.0.0.1:5432/potxpress` | PostgreSQL 连接地址 |
| `DATABASE_POOL_SIZE` | `10` | 数据库连接池大小（1–50） |
| `DATABASE_SSL` | `false` | 是否为数据库连接启用 SSL |
| `REALTIME_LISTEN_DATABASE_URL` | 空（复用 `DATABASE_URL`） | 跨实例实时广播的 `LISTEN` 连接地址，需支持会话级连接 |
| `TEST_DATABASE_URL` | 本地 compose 数据库 | `npm test` 使用的 PostgreSQL；每个测试文件使用独立 schema，结束后自动删除 |
| `SEED_DEMO_DATA` | `false` | 仅本地开发可设为 `true` |
| `TRUST_PROXY` | `false` | 反向代理层数或受支持地址范围；仅按真实拓扑配置 |
| `VITE_SHOW_DEMO_ACCOUNTS` | `false` | 仅控制开发登录页演示账号快捷入口 |

## 本地开发

### PostgreSQL

PotXpress 使用 PostgreSQL 作为业务数据存储。首次运行先在项目根目录启动数据库：

```bash
docker compose up -d postgres
```

数据库默认连接：

```text
postgres://potxpress:potxpress@127.0.0.1:5432/potxpress
```

如需使用其他数据库，请在 `.env` 设置 `DATABASE_URL`。执行数据库迁移：

```bash
npm run db:migrate
```

开发环境在没有显式设置 `SEED_DEMO_DATA` 时会自动建立演示门店与账号；生产环境默认不会写入演示数据。

```powershell
Copy-Item .env.example .env

npm install
npm run typecheck
npm test
npm run dev:server
```

服务端测试直接运行在真实 PostgreSQL 上（与生产执行同一套 SQL，没有内存
数据库分支），因此 `npm test` 前需要先启动数据库。每个测试文件在独立
schema 中运行，结束后自动清理。`test/postgresConcurrency.test.js` 覆盖旧表
迁移、门店级并发隔离（A 店慢写不阻塞 B 店）、跨实例串行化与失败回滚；
`test/multiInstance.test.js` 覆盖跨实例实时广播、店员入口链接更换和共享
登录限流。GitHub Actions 在每次推送和 PR 上用 PostgreSQL 17 运行完整测试。

另开一个终端：

```powershell
npm run dev:client
```

浏览器访问 `http://localhost:5173`。开发 API 默认运行在
`http://127.0.0.1:3001`。

当 `.env` 中 `SEED_DEMO_DATA=true` 时会创建以下本地演示账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 系统管理员 | `admin` | `admin123` |
| 门店管理员 | `demo_admin` | `admin123` |
| 门店员工 | `demo_staff` | `staff123` |

演示账号只能用于本地开发。

## 生产运行（单端口）

从仓库根目录安装并构建：

```powershell
npm ci
npm run build
```

再启动服务端：

```powershell
$env:NODE_ENV = "production"
$env:JWT_SECRET = "至少 32 字符的随机密钥"
$env:DATABASE_URL = "postgres://用户:密码@数据库地址:5432/potxpress"
$env:PORT = "3001"
npm start --workspace @potxpress/server
```

浏览器和 API 都使用 `http://服务器地址:3001`。同源部署无需
`CORS_ORIGIN`；只有确实需要额外前端来源时才配置逗号分隔的
`CORS_ORIGIN`。生产环境缺少 `client/dist/index.html` 时，服务会给出明确启动错误。

生产数据库必须配置持久卷和定期备份。应用使用数据库事务、固定顺序资源行锁、
历史记录唯一约束和幂等键保证计时写入的一致性。

对公网提供服务时，必须由反向代理或托管平台配置 HTTPS。JWT 保存在
当前标签页独立的 `sessionStorage`，不得通过公网明文 HTTP 传输。反向代理终止 TLS 时，
按实际代理层级设置 `TRUST_PROXY`，不要直接照抄不受限配置。

## 初始化首位系统管理员

关闭演示数据后可交互创建：

```powershell
npm run create-admin --workspace @potxpress/server
```

自动化环境可通过标准输入传入密码，密码不会出现在命令参数或日志中：

```powershell
$password | npm run create-admin --workspace @potxpress/server -- --password-stdin --username admin --display-name "系统管理员"
```

如果已经存在启用的系统管理员，该命令会拒绝再次初始化。

生产首次启动建议顺序：

1. 创建空的 PostgreSQL 数据库并配置持久化与备份。
2. 配置生产环境变量并保持 `SEED_DEMO_DATA=false`。
3. 为无交互命令行的托管环境同时配置三个
   `BOOTSTRAP_ADMIN_*` 变量；或者从仓库根目录执行
   `npm run create-admin --workspace @potxpress/server`。
4. 构建客户端并执行 `npm start --workspace @potxpress/server`。

首位管理员创建后，应从托管环境同时删除全部三个
`BOOTSTRAP_ADMIN_*` 变量。后续启动检测到已有启用的系统管理员时，
不会重复创建。

## 经营数据总览

系统管理员可直接访问 `/data`，日常导航不提供入口。门店管理员和员工无权访问该页面或 `/api/data` 接口。
页面自动汇总所有启用门店，支持今天、昨天、近 7 天、近 30 天和指定日期，可用前一天／后一天逐日查看。提供实时桌台占用、开台趋势、小时分布、门店对比和单店明细，每 30 秒刷新。
统计按各门店当地开台日期归属；拼桌计一次接待，占用按成员桌计数。平均时长和结束时超时比例仅统计已结束记录，实时占用不受日期筛选影响。
当前报表以现有计时记录为依据，删除历史记录会影响统计结果；不包含营业额、利润或实际客人数。

## 已知限制与后续路线

- WebSocket 事件用于触发快照同步，计时真值始终以 PostgreSQL 和 HTTP
  快照为准。
- 平面图目前使用颜色和桌台布局；后续可加入门店底图上传。
- 浏览器声音需要用户首次手势授权，不同设备的本机静音状态彼此独立。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 存活检查：进程能处理请求即 200，不访问数据库（Render 健康检查） |
| `GET` | `/api/health/ready` | 就绪检查：含一次数据库往返，数据库不可用时 503 |
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/auth/me` | 当前用户 |
| `POST` | `/api/auth/refresh` | 为正在使用的登录状态续期 |
| `PATCH` | `/api/auth/password` | 修改自己的密码并使旧令牌失效 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET/POST/PATCH` | `/api/users`、`/api/users/:userId` | 用户管理 |
| `GET/POST/PATCH` | `/api/stores`、`/api/stores/:storeId` | 门店管理 |
| `GET/POST/PATCH/DELETE` | `/api/stores/:storeId/tables/...` | 桌台管理 |
| `GET/POST/DELETE` | `/api/stores/:storeId/table-groups/...` | 拼桌组管理 |
| `GET/PATCH` | `/api/stores/:storeId/settings` | 门店设置 |
| `GET/PUT` | `/api/stores/:storeId/layout` | 布局读取与保存 |
| `GET/POST` | `/api/stores/:storeId/.../timer...` | 活动计时与操作 |
| `POST` | `/api/stores/:storeId/timers/reset-all` | 管理员一键清台 |
| `GET` | `/api/stores/:storeId/records` | 记录查询 |
| `GET` | `/api/stores/:storeId/timer-interventions` | 超时提醒、自动清台和一键清台专项记录 |
| `GET` | `/api/stores/:storeId/records/export` | CSV 导出 |
| `GET` | `/api/stores/:storeId/audit-logs` | 审计日志 |

除健康检查和登录外，受保护接口使用
`Authorization: Bearer <token>`。

计时和拼桌写接口支持 `Idempotency-Key` 请求头（8–128 位）。相同用户使用
相同键重试同一请求时会返回首次提交的结果，并带
`Idempotency-Replayed: true` 响应头；同一个键用于不同请求会返回
`409 IDEMPOTENCY_KEY_REUSED`。网页客户端会自动生成键，并在网络失败时
复用原键重试一次。
