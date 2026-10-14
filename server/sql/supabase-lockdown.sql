-- PotXpress：收紧 Supabase Data API 对业务表的访问（2026-10-14 复盘 P0）
--
-- 背景：Security Advisor 报告 public schema 下 20 张表未启用 RLS，且 anon /
-- authenticated 角色拥有 SELECT/INSERT/UPDATE/DELETE 权限。PotXpress 只通过
-- Express 后端访问数据库，浏览器不直连 Supabase，因此这两个角色不需要任何表权限。
--
-- 本脚本不会被应用自动执行。请在 Supabase SQL Editor 中按步骤人工执行：
--   1. 先运行「步骤 0」确认后端使用的数据库角色是这些表的 owner
--      （owner 不受未 FORCE 的 RLS 影响，后端读写保持正常）。
--      如果后端角色不是 owner，停止执行，先单独设计后端角色的授权。
--   2. 在非营业时段执行「步骤 1」（单个事务，可整体回滚）。
--   3. 运行「步骤 2」核验，并在 PotXpress 中完成一次登录、开台、清台。
--
-- 回退：步骤 1 只撤销 anon/authenticated 的权限并启用 RLS，不改动数据；
-- 如需回退，可对相应表执行 ALTER TABLE ... DISABLE ROW LEVEL SECURITY，
-- 但不建议恢复 anon 的写权限。

-- ── 步骤 0：确认后端角色与表 owner ─────────────────────────────────────
SELECT current_user AS backend_role_if_run_as_backend;
SELECT tablename, tableowner, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ── 步骤 1：撤销浏览器角色权限并启用 RLS ───────────────────────────────
BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 今后由 owner 新建的表也不再自动授予浏览器角色。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 启用 RLS 且不创建任何策略：通过 Data API 的 anon/authenticated 请求
-- 一律拒绝；表 owner（后端）不受影响。
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
  END LOOP;
END $$;

COMMIT;

-- ── 步骤 2：核验 ───────────────────────────────────────────────────────
-- 期望：所有表 rowsecurity = true。
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 期望：没有任何行（anon/authenticated 在 public 下没有表权限）。
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
