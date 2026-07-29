# PotXpress

PotXpress 是一个面向门店的桌台计时管理网页应用。项目按可独立验收的模块逐步交付，每个模块对应独立提交。

## 当前进度

- [x] 模块 1：后端基础、文件存储、事务恢复、身份认证
- [x] 模块 2：门店、桌台与布局数据接口
- [x] 模块 3：计时器与历史记录接口
- [ ] 模块 4：前端工程与登录页
- [ ] 模块 5：桌台计时仪表盘
- [ ] 模块 6：布局编辑器
- [ ] 模块 7：计时提醒与声音
- [ ] 模块 8：系统管理、移动端适配与发布检查

## 模块 1 已包含

- Express API、安全响应头和受控 CORS
- JSON 文件存储、进程内写锁、原子替换和最近 5 份有效备份
- 跨文件事务日志、启动恢复和失败回滚
- 单 `DATA_DIR` 实例锁，避免两个进程同时写数据
- 数据版本迁移、演示数据初始化和启动一致性检查
- JWT 登录、角色上下文、`tokenVersion` 立即失效和登录限流
- 一次性系统管理员初始化命令
- 故障注入与 HTTP 集成测试

## 模块 2 已包含

- 门店创建、查看、更新、停用与跨文件默认数据初始化
- 桌台单个/批量创建、自动无重叠落位、连续排序和软删除
- 每店 200 张桌台上限、编号唯一性和活动计时删除保护
- 门店设置读取与更新，门店时区和设置时区事务同步
- 完整布局读取、成员集合校验和 `layoutVersion` 乐观锁保存
- 门店/角色权限矩阵、停用门店写保护和关键操作审计
- 并发编号冲突、布局冲突、空间不足与重启持久化集成测试

## 模块 3 已包含

- 无后台线程的实时计时状态计算，支持运行、预警、暂停和超时
- 开始、暂停、继续、加减时、超时确认与清台状态机
- 跨文件原子清台：先生成历史记录，再移除活动计时
- 门店本地日期记录查询，覆盖 Pacific/Auckland 夏令时
- 带 UTF-8 BOM、RFC 4180 转义与公式注入保护的 CSV 导出
- 管理员操作日志查询和停用门店的受控查看/清台
- 可注入测试时钟、同桌并发保护与服务器重启恢复测试

## 本地运行

需要 Node.js 24 LTS 或更高版本。

```powershell
Copy-Item .env.example .env
Set-Location server
npm install
npm test
npm run dev
```

默认 API 地址为 `http://127.0.0.1:3001`，健康检查为
`GET /api/health`。

登录失败按 IP 与规范化用户名限制为 15 分钟内最多 5 次；超限响应
`429 RATE_LIMITED` 并携带 `Retry-After`。

当 `.env` 中 `SEED_DEMO_DATA=true` 时，会幂等创建以下开发账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 系统管理员 | `admin` | `admin123` |
| 门店管理员 | `demo_admin` | `admin123` |
| 门店员工 | `demo_staff` | `staff123` |

演示账号只能用于本地开发。生产环境必须关闭演示数据并设置至少 32
字符的随机 `JWT_SECRET`。

## 初始化首位系统管理员

交互式创建：

```powershell
Set-Location server
npm run create-admin
```

自动化环境可通过标准输入传入密码，密码不会出现在命令参数或日志中：

```powershell
$password | npm run create-admin -- --password-stdin --username admin --display-name "系统管理员"
```

如果已经存在启用的系统管理员，该命令会拒绝再次初始化。

## 当前 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务与存储状态 |
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/auth/me` | 获取当前登录用户 |
| `POST` | `/api/auth/logout` | 退出并记录审计日志 |
| `GET/POST` | `/api/stores` | 列出/创建门店 |
| `GET/PATCH` | `/api/stores/:storeId` | 查看/更新门店 |
| `GET/POST` | `/api/stores/:storeId/tables` | 列出/创建桌台 |
| `POST` | `/api/stores/:storeId/tables/batch` | 批量创建桌台 |
| `PATCH/DELETE` | `/api/stores/:storeId/tables/:tableId` | 更新/软删除桌台 |
| `GET/PATCH` | `/api/stores/:storeId/settings` | 查看/更新门店设置 |
| `GET/PUT` | `/api/stores/:storeId/layout` | 查看/保存完整布局 |
| `GET` | `/api/stores/:storeId/timers` | 获取实时计算后的活动计时 |
| `POST` | `/api/stores/:storeId/tables/:tableId/timer/:action` | 执行计时操作 |
| `GET` | `/api/stores/:storeId/records` | 按门店日期查询记录 |
| `GET` | `/api/stores/:storeId/records/export` | 导出记录 CSV |
| `GET` | `/api/stores/:storeId/audit-logs` | 管理员查询操作日志 |

除健康检查与登录外，受保护接口使用
`Authorization: Bearer <token>`。
