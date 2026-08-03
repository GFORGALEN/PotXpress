# Render 桌台与画布一次性迁移

此工具只迁移以下内容：

- `restaurant_tables` 中目标门店的桌台名称、桌号、排序、状态、形状、容量、区域、备注、默认时长和坐标；
- `store_layouts` 中目标门店的画布配置与装饰元素。

用户、门店、设置、桌台组、计时器、营业记录、日志、实时事件和幂等记录不会被复制或删除。

## 安全行为

- 默认是 dry-run，不写入数据库；
- 源数据库默认使用本地 `postgres://potxpress:potxpress@127.0.0.1:5432/potxpress`；
- Render 连接地址只通过 `TARGET_DATABASE_URL` 环境变量传入；
- 写入前会锁定桌台、布局、桌台组和活动计时资源，并重新读取目标数据；
- 同名桌台会保留 Render 现有 ID，避免破坏它们关联的计时和记录；
- 本地新增桌台会获得稳定的目标 ID；
- Render 独有桌台只会在显式使用 `--archive-target-only` 时停用，不会删除；
- 如果待停用桌台仍有活动计时，迁移会回滚；
- 应用前会把目标桌台和布局备份到 `server/data/backups/`。

## 1. 预览

在项目根目录创建一个仅供本机使用的 `.env.render.local`（它已被 `.gitignore` 中的 `.env*` 排除）：

```dotenv
TARGET_DATABASE_URL=postgresql://...
TARGET_DATABASE_SSL=true
```

连接地址填写 Render PostgreSQL 的 External Database URL。不要把这个文件加入 Git。先列出本地和 Render 的门店选择器：

```powershell
npm run layout:transfer --workspace @potxpress/server -- --list-stores
```

然后执行预览：

```powershell
npm run layout:transfer --workspace @potxpress/server -- --source-store=DEMO001 --target-store=TARGET_CODE --archive-target-only
```

门店选择器既可以是门店 ID，也可以是门店 code。命令会显示实际解析到的源门店和目标门店、需要新增/更新/归档的桌台，以及布局版本变化。

## 2. 应用

确认 dry-run 输出后，复制其中的目标门店 ID，再运行：

```powershell
npm run layout:transfer --workspace @potxpress/server -- --source-store=DEMO001 --target-store=TARGET_CODE --archive-target-only --apply --confirm-target-id=store_xxx
```

成功后应重新打开线上看板，确认启用桌台数量、画布装饰和位置。完成迁移后删除本机连接文件：

```powershell
Remove-Item .env.render.local
```

不要把 Render 数据库地址写入普通 `.env`、脚本、日志或 Git 提交。
