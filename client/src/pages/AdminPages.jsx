import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTable,
  createTableBatch,
  createTableGroup,
  createUser,
  deleteAuditLog,
  deleteAuditLogs,
  deleteRecord,
  deleteRecords,
  deleteTablePermanent,
  deleteTablesBatch,
  disableTable,
  deleteTableGroup,
  exportRecords,
  listAuditLogs,
  listRecords,
  listTables,
  listTableGroups,
  listUsers,
  updateTable,
  updateUser,
} from '../api/admin.js';
import { createStore, updateStore } from '../api/stores.js';
import { getSettings, updateSettings } from '../api/settings.js';
import { listTimers } from '../api/timers.ts';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useStore } from '../contexts/StoreContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { auditActionLabel } from '../utils/auditLabels.js';

const fieldClass = 'min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-ember-500 focus:ring-2 focus:ring-ember-100';
const buttonClass = 'min-h-11 rounded-xl bg-ink-900 px-4 text-sm font-bold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'min-h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50';

function Page({ title, description, actions, children }) {
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-black text-ink-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-stone-500">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-card ${className}`}>{children}</div>;
}

function useResource(loader, dependencies) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const refresh = useCallback(() => setEpoch((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setError(null);
    loader().then((result) => active && setData(result))
      .catch((requestError) => active && setError(requestError));
    return () => { active = false; };
  // The loader is intentionally refreshed by the supplied stable scope keys.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, epoch]);
  return { data, setData, error, refresh };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SettingsPage() {
  const { currentStore, selectedStoreId } = useStore();
  const { showToast } = useToast();
  const resource = useResource(() => getSettings(selectedStoreId), [selectedStoreId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(resource.data), [resource.data]);
  const dirty = Boolean(form && resource.data && JSON.stringify(form) !== JSON.stringify(resource.data));
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (resource.error) return <ErrorMessage message={resource.error.message} onRetry={resource.refresh} />;
  if (!form) return <LoadingSpinner label="正在读取门店设置" />;
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateSettings(selectedStoreId, {
        defaultDurationMinutes: Number(form.defaultDurationMinutes),
        warningThresholdMinutes: Number(form.warningThresholdMinutes),
        soundEnabled: form.soundEnabled,
      });
      setForm(saved);
      showToast('门店设置已保存', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Page title="门店设置" description="调整新计时默认时长、预警阈值和门店声音策略。">
      <Card className="max-w-2xl">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-bold">默认时长（分钟）
            <input className={fieldClass} type="number" min="5" max="480" value={form.defaultDurationMinutes} onChange={(e) => setForm({ ...form, defaultDurationMinutes: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm font-bold">预警阈值（分钟）
            <input className={fieldClass} type="number" min="1" max="60" value={form.warningThresholdMinutes} onChange={(e) => setForm({ ...form, warningThresholdMinutes: e.target.value })} />
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl bg-stone-50 px-4 text-sm font-bold sm:col-span-2">
            <input type="checkbox" checked={form.soundEnabled} onChange={(e) => setForm({ ...form, soundEnabled: e.target.checked })} />
            允许本门店播放计时提醒音
          </label>
          <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm sm:col-span-2">
            <strong>门店时区：</strong>{currentStore?.timezone}
            <p className="mt-1 text-xs text-stone-500">修改默认时长只影响之后新开的计时，进行中的计时不受影响。</p>
          </div>
          <button className={`${buttonClass} sm:col-span-2`} disabled={saving}>{saving ? '保存中…' : '保存设置'}</button>
        </form>
      </Card>
    </Page>
  );
}

export function TablesAdminPage() {
  const { selectedStoreId } = useStore();
  const { showToast } = useToast();
  const resource = useResource(() => listTables(selectedStoreId), [selectedStoreId]);
  const groupsResource = useResource(
    () => listTableGroups(selectedStoreId),
    [selectedStoreId],
  );
  const timerResource = useResource(() => listTimers(selectedStoreId), [selectedStoreId]);
  const timerByTable = useMemo(() => new Map(
    (timerResource.data?.timers ?? []).flatMap((timer) => (
      (timer.memberTableIds ?? [timer.tableId])
        .map((tableId) => [tableId, timer])
    )),
  ), [timerResource.data]);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [shape, setShape] = useState('rectangle');
  const [capacity, setCapacity] = useState(4);
  const [area, setArea] = useState('大厅');
  const [batch, setBatch] = useState({
    areaCode: 'A',
    area: 'A区',
    startNumber: '1',
    count: '',
    shape: 'rectangle',
    capacity: 4,
  });
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState('temporary');
  const groupByTableId = useMemo(() => new Map(
    (groupsResource.data ?? []).flatMap((group) => (
      group.tableIds.map((tableId) => [tableId, group])
    )),
  ), [groupsResource.data]);
  const run = async (action, message) => {
    try {
      await action();
      showToast(message, 'success');
      resource.refresh();
      groupsResource.refresh();
    } catch (error) {
      showToast(
        error.code === 'TABLE_HAS_ACTIVE_TIMER'
          ? '该桌正在计时，请先重置清台'
          : error.message,
        'error',
      );
    }
  };
  if (resource.error) return <ErrorMessage message={resource.error.message} onRetry={resource.refresh} />;
  if (!resource.data) return <LoadingSpinner label="正在读取桌台" />;
  return (
    <Page title="桌台管理" description="创建、排序、编辑和停用桌台；停用不会删除历史记录。">
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <Card>
            <h2 className="font-black">创建拼桌组</h2>
            <p className="mt-1 text-xs text-stone-500">先在右侧勾选至少两张空闲桌台。</p>
            <div className="mt-4 grid gap-3">
              <input className={fieldClass} placeholder="拼桌名称（可选）" maxLength="100" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              <select className={fieldClass} value={groupType} onChange={(e) => setGroupType(e.target.value)}>
                <option value="temporary">临时拼桌</option>
                <option value="fixed">固定拼桌</option>
              </select>
              <button className={buttonClass} disabled={selectedTableIds.length < 2} onClick={() => run(
                () => createTableGroup(selectedStoreId, {
                  tableIds: selectedTableIds,
                  ...(groupName.trim() ? { name: groupName.trim() } : {}),
                  type: groupType,
                }).then((result) => {
                  setSelectedTableIds([]);
                  setGroupName('');
                  return result;
                }),
                '拼桌组已创建',
              )}>绑定 {selectedTableIds.length} 张桌台</button>
            </div>
            {(groupsResource.data ?? []).length ? (
              <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
                {(groupsResource.data ?? []).map((group) => (
                  <div key={group.id} className="flex items-center justify-between gap-2 rounded-xl bg-violet-50 p-3 text-xs">
                    <span><strong>{group.name}</strong><br />{group.type === 'fixed' ? '固定' : '临时'} · {group.tables.map((table) => table.name).join('、')}</span>
                    <button className={secondaryButtonClass} onClick={() => {
                      if (!window.confirm(`确认解除“${group.name}”？`)) return;
                      run(() => deleteTableGroup(selectedStoreId, group.id), '拼桌组已解除');
                    }}>解除</button>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-black">新增桌台</h2>
            <form className="mt-4 grid gap-3" onSubmit={(e) => {
              e.preventDefault();
              run(() => createTable(selectedStoreId, {
                name,
                number: Number(number),
                shape,
                capacity: Number(capacity),
                area,
              }), '桌台已创建');
              setName(''); setNumber('');
            }}>
              <input className={fieldClass} placeholder="名称，例如 9号桌" required maxLength="50" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={fieldClass} placeholder="编号" type="number" min="1" max="9999" required value={number} onChange={(e) => setNumber(e.target.value)} />
              <select className={fieldClass} value={shape} onChange={(e) => setShape(e.target.value)}><option value="round">圆桌</option><option value="square">方桌</option><option value="rectangle">长桌</option><option value="booth">包厢桌</option></select>
              <input className={fieldClass} type="number" min="1" max="30" value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-label="容纳人数" />
              <input className={fieldClass} required maxLength="50" value={area} onChange={(e) => setArea(e.target.value)} aria-label="归属区域" />
              <button className={buttonClass}>创建桌台</button>
            </form>
          </Card>
          <Card>
            <h2 className="font-black">批量创建</h2>
            <form className="mt-4 grid gap-3" onSubmit={(e) => {
              e.preventDefault();
              run(() => createTableBatch(selectedStoreId, {
                startNumber: Number(batch.startNumber),
                count: Number(batch.count),
                areaCode: batch.areaCode,
                area: batch.area,
                shape: batch.shape,
                capacity: Number(batch.capacity),
              }), '桌台已批量创建');
            }}>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs font-bold text-stone-600">
                  区域代码
                  <input className={fieldClass} placeholder="A" required maxLength="10" value={batch.areaCode} onChange={(e) => {
                    const areaCode = e.target.value.toUpperCase();
                    setBatch({
                      ...batch,
                      areaCode,
                      area: `${areaCode}区`,
                    });
                  }} />
                </label>
                <label className="grid gap-1 text-xs font-bold text-stone-600">
                  所属区域
                  <input className={fieldClass} placeholder="A区" required maxLength="50" value={batch.area} onChange={(e) => setBatch({ ...batch, area: e.target.value })} />
                </label>
              </div>
              <input className={fieldClass} placeholder="起始桌号，例如 1" type="number" min="1" required value={batch.startNumber} onChange={(e) => setBatch({ ...batch, startNumber: e.target.value })} />
              <input className={fieldClass} placeholder="数量" type="number" min="1" max="50" required value={batch.count} onChange={(e) => setBatch({ ...batch, count: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <select className={fieldClass} value={batch.shape} onChange={(e) => setBatch({ ...batch, shape: e.target.value })}>
                  <option value="round">圆桌</option>
                  <option value="square">方桌</option>
                  <option value="rectangle">长桌</option>
                  <option value="booth">包厢桌</option>
                </select>
                <input className={fieldClass} aria-label="批量容纳人数" type="number" min="1" max="30" required value={batch.capacity} onChange={(e) => setBatch({ ...batch, capacity: e.target.value })} />
              </div>
              {batch.startNumber && batch.count ? (
                <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
                  预览：{Array.from(
                    { length: Math.min(3, Number(batch.count)) },
                    (_, index) => `${batch.areaCode.toUpperCase()}${Number(batch.startNumber) + index}`,
                  ).join('、')}
                  {Number(batch.count) > 3 ? '…' : ''}
                  <br />
                  所属：{batch.area} · {{ round: '圆桌', square: '方桌', rectangle: '长桌', booth: '包厢桌' }[batch.shape]} · {batch.capacity}人
                </p>
              ) : null}
              <button className={buttonClass}>批量创建</button>
            </form>
          </Card>
        </div>
        <Card className="overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">桌台位置请在首页点击“进入布局编辑”调整。已有计时历史的桌台只能停用。</p>
            <button
              type="button"
              disabled={!selectedTableIds.length}
              className="min-h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              onClick={() => {
                if (!window.confirm(`确定永久删除选中的 ${selectedTableIds.length} 张桌台吗？此操作无法恢复。`)) return;
                run(
                  () => deleteTablesBatch(selectedStoreId, selectedTableIds)
                    .then((result) => {
                      setSelectedTableIds([]);
                      return result;
                    }),
                  '桌台已批量删除',
                );
              }}
            >
              批量删除（{selectedTableIds.length}）
            </button>
          </div>
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-xs uppercase text-stone-400"><tr><th className="p-3">选择</th><th>顺序</th><th>编号</th><th>名称</th><th>属性</th><th>状态</th><th className="text-right">操作</th></tr></thead>
            <tbody>{[...resource.data].sort((left, right) => (
              Number(right.enabled) - Number(left.enabled)
              || left.sortOrder - right.sortOrder
            )).map((table) => (
              <tr key={table.id} className="border-t border-stone-100">
                <td className="p-3"><input type="checkbox" aria-label={`选择${table.name}`} disabled={groupByTableId.has(table.id) || timerByTable.has(table.id)} checked={selectedTableIds.includes(table.id)} onChange={(event) => setSelectedTableIds((current) => event.target.checked ? [...current, table.id] : current.filter((id) => id !== table.id))} /></td>
                <td>{table.sortOrder}</td><td>{table.number}</td><td className="font-bold">{table.name}{groupByTableId.has(table.id) ? <span className="ml-2 rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-800">{groupByTableId.get(table.id).name}</span> : null}</td>
                <td className="text-xs text-stone-500">{table.area} · {table.capacity}人 · {{ round: '圆桌', square: '方桌', rectangle: '长桌', booth: '包厢桌' }[table.shape]}</td>
                <td>
                  {table.enabled ? '启用' : '停用'}
                  {timerByTable.has(table.id) ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {timerByTable.get(table.id).status === 'paused' ? '已暂停' : '计时中'}
                    </span>
                  ) : null}
                </td>
                <td className="space-x-2 py-2 text-right">
                  <button className={secondaryButtonClass} onClick={() => {
                    const value = window.prompt('新的桌台名称', table.name);
                    if (!value?.trim()) return;
                    const shape = window.prompt('形状：round / square / rectangle / booth', table.shape);
                    if (!['round', 'square', 'rectangle', 'booth'].includes(shape)) return;
                    const capacity = Number(window.prompt('容纳人数（1-30）', String(table.capacity)));
                    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) return;
                    const area = window.prompt('归属区域', table.area);
                    if (!area?.trim()) return;
                    const defaultDuration = window.prompt('默认时长（5-480，留空继承门店）', table.defaultDurationMinutes ?? '');
                    run(() => updateTable(selectedStoreId, table.id, {
                      name: value.trim(),
                      shape,
                      capacity,
                      area: area.trim(),
                      defaultDurationMinutes: defaultDuration === '' ? null : Number(defaultDuration),
                    }), '桌台属性已更新');
                  }}>编辑</button>
                  <button className={secondaryButtonClass} disabled={table.sortOrder <= 1 || !table.enabled} onClick={() => run(() => updateTable(selectedStoreId, table.id, { sortOrder: table.sortOrder - 1 }), '排序已更新')}>上移</button>
                  <button className={secondaryButtonClass} disabled={!table.enabled || table.sortOrder >= resource.data.filter((item) => item.enabled).length} onClick={() => run(() => updateTable(selectedStoreId, table.id, { sortOrder: table.sortOrder + 1 }), '排序已更新')}>下移</button>
                  <button className={secondaryButtonClass} onClick={() => {
                    if (table.enabled && !window.confirm(`确认停用“${table.name}”？历史记录会保留。`)) return;
                    run(
                      () => (table.enabled ? disableTable(selectedStoreId, table.id) : updateTable(selectedStoreId, table.id, { enabled: true })),
                      table.enabled ? '桌台已停用' : '桌台已启用',
                    );
                  }}>{table.enabled ? '停用' : '启用'}</button>
                  <button
                    className="min-h-10 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                    disabled={groupByTableId.has(table.id) || timerByTable.has(table.id)}
                    onClick={() => {
                      if (!window.confirm(`确定永久删除“${table.name}”吗？已有计时历史时将不允许删除。`)) return;
                      run(
                        () => deleteTablePermanent(selectedStoreId, table.id),
                        '桌台已永久删除',
                      );
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </Page>
  );
}

export function StoresAdminPage() {
  const { stores, refreshStores, selectStore } = useStore();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', code: '', address: '', timezone: 'Pacific/Auckland' });
  const submit = async (event) => {
    event.preventDefault();
    try {
      await createStore({ ...form, address: form.address || null });
      setForm({ name: '', code: '', address: '', timezone: 'Pacific/Auckland' });
      await refreshStores();
      showToast('门店已创建', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  };
  return (
    <Page title="门店管理" description="管理全部门店；停用门店仍可临时查看其配置。">
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Card><h2 className="font-black">新增门店</h2>
          <form className="mt-4 grid gap-3" onSubmit={submit}>
            {['name', 'code', 'address', 'timezone'].map((key) => <input key={key} className={fieldClass} required={key !== 'address'} placeholder={{ name: '门店名称', code: '门店代码', address: '地址（可选）', timezone: 'IANA 时区' }[key]} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
            <button className={buttonClass}>创建门店</button>
          </form>
        </Card>
        <div className="grid gap-3">{stores.map((store) => (
          <Card key={store.id} className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><p className="font-black">{store.name}</p><p className="mt-1 text-xs text-stone-500">{store.code} · {store.timezone} · {store.address || '无地址'} · {store.tableCount ?? 0} 张桌 · {store.activeTimerCount ?? 0} 个未结束计时</p></div>
            <div className="flex gap-2">
              {!store.enabled ? <button className={secondaryButtonClass} onClick={() => selectStore(store.id, { allowDisabled: true })}>临时查看</button> : null}
              <button className={secondaryButtonClass} onClick={() => {
                const name = window.prompt('门店名称', store.name);
                if (!name?.trim()) return;
                const address = window.prompt('门店地址（可留空）', store.address || '');
                const timezone = window.prompt('IANA 时区', store.timezone);
                if (!timezone?.trim()) return;
                updateStore(store.id, { name: name.trim(), address: address?.trim() || null, timezone: timezone.trim() })
                  .then(refreshStores)
                  .then(() => showToast('门店已更新', 'success'))
                  .catch((error) => showToast(error.message, 'error'));
              }}>编辑</button>
              <button className={secondaryButtonClass} onClick={async () => {
                if (store.enabled && !window.confirm('禁用后普通员工无法登录，仅系统管理员可查看并逐桌重置。确认继续？')) return;
                try { await updateStore(store.id, { enabled: !store.enabled }); await refreshStores(); showToast(store.enabled ? '门店已停用' : '门店已启用', 'success'); } catch (error) { showToast(error.message, 'error'); }
              }}>{store.enabled ? '停用' : '启用'}</button>
            </div>
          </Card>
        ))}</div>
      </div>
    </Page>
  );
}

export function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const { stores } = useStore();
  const { showToast } = useToast();
  const resource = useResource(listUsers, []);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'store_staff', storeId: '' });
  const run = async (action, message) => {
    try { await action(); showToast(message, 'success'); resource.refresh(); } catch (error) { showToast(error.message, 'error'); }
  };
  if (resource.error) return <ErrorMessage message={resource.error.message} onRetry={resource.refresh} />;
  if (!resource.data) return <LoadingSpinner label="正在读取用户" />;
  return (
    <Page title="用户管理" description="创建账号、分配角色和门店，并可立即使旧登录失效。">
      <Card>
        <form className="grid gap-3 md:grid-cols-6" onSubmit={(e) => {
          e.preventDefault();
          run(() => createUser({ ...form, storeId: form.role === 'system_admin' ? null : form.storeId }), '用户已创建');
          setForm({ username: '', displayName: '', password: '', role: 'store_staff', storeId: '' });
        }}>
          <input className={fieldClass} required placeholder="用户名" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className={fieldClass} required placeholder="显示名称" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <input className={fieldClass} required type="password" minLength="8" placeholder="初始密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className={fieldClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="store_staff">门店员工</option><option value="store_admin">门店管理员</option><option value="system_admin">系统管理员</option></select>
          <select className={fieldClass} required={form.role !== 'system_admin'} disabled={form.role === 'system_admin'} value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}><option value="">选择门店</option>{stores.filter((store) => store.enabled).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
          <button className={buttonClass}>创建用户</button>
        </form>
      </Card>
      <div className="mt-5 grid gap-3">{resource.data.map((user) => (
        <Card key={user.id} className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="font-black">{user.displayName} <span className="font-mono text-xs text-stone-400">@{user.username}</span></p><p className="mt-1 text-xs text-stone-500">{user.role} · {stores.find((store) => store.id === user.storeId)?.name || '全部门店'} · {user.enabled ? '启用' : '停用'}</p></div>
          <div className="flex gap-2">
            <button className={secondaryButtonClass} onClick={() => {
              const displayName = window.prompt('显示名称', user.displayName);
              if (!displayName?.trim()) return;
              const role = window.prompt('角色：system_admin / store_admin / store_staff', user.role);
              if (!['system_admin', 'store_admin', 'store_staff'].includes(role)) {
                showToast('角色值无效', 'error');
                return;
              }
              let storeId = null;
              if (role !== 'system_admin') {
                const store = window.prompt(
                  `门店 ID：${stores.filter((item) => item.enabled).map((item) => `${item.name}=${item.id}`).join('；')}`,
                  user.storeId || '',
                );
                if (!store) return;
                storeId = store;
              }
              run(() => updateUser(user.id, { displayName: displayName.trim(), role, storeId }), '用户已更新，旧登录已失效');
            }}>编辑</button>
            <button className={secondaryButtonClass} onClick={() => {
              const password = window.prompt('输入至少 8 位的新密码');
              if (password) run(() => updateUser(user.id, { password }), '密码已重置，旧登录已失效');
            }}>重置密码</button>
            <button className={secondaryButtonClass} disabled={user.id === currentUser.id} onClick={() => run(() => updateUser(user.id, { enabled: !user.enabled }), user.enabled ? '用户已停用' : '用户已启用')}>{user.enabled ? '停用' : '启用'}</button>
          </div>
        </Card>
      ))}</div>
    </Page>
  );
}

export function RecordsPage() {
  const { selectedStoreId } = useStore();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState(today);
  const [tableId, setTableId] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const tables = useResource(() => listTables(selectedStoreId), [selectedStoreId]);
  const records = useResource(() => listRecords(selectedStoreId, { date, ...(tableId ? { tableId } : {}) }), [selectedStoreId, date, tableId]);
  if (records.error) return <ErrorMessage message={records.error.message} onRetry={records.refresh} />;
  return (
    <Page title="计时记录" description="按日期和桌台查看已结束计时，并导出当天 CSV。" actions={<button className={buttonClass} onClick={() => exportRecords(selectedStoreId, date)}>导出 CSV</button>}>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3"><input className={fieldClass} type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedRecordIds([]); }} /><select className={fieldClass} value={tableId} onChange={(e) => { setTableId(e.target.value); setSelectedRecordIds([]); }}><option value="">全部桌台</option>{tables.data?.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select>{user.role === 'system_admin' && records.data?.records.length ? <><label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700"><input type="checkbox" checked={selectedRecordIds.length === records.data.records.length} onChange={(event) => setSelectedRecordIds(event.target.checked ? records.data.records.map((record) => record.id) : [])} />全选</label><button type="button" disabled={!selectedRecordIds.length} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40" onClick={async () => {
          if (!window.confirm(`确定删除选中的 ${selectedRecordIds.length} 条计时记录吗？删除后无法恢复。`)) return;
          try {
            await deleteRecords(selectedStoreId, selectedRecordIds);
            showToast(`已删除 ${selectedRecordIds.length} 条计时记录`, 'success');
            setSelectedRecordIds([]);
            records.refresh();
          } catch (error) {
            showToast(error.message, 'error');
          }
        }}>批量删除（{selectedRecordIds.length}）</button></> : null}</div>
        {!records.data ? <LoadingSpinner label="正在读取记录" /> : <div className="overflow-x-auto"><table className="w-full min-w-[76rem] text-left text-sm"><thead className="text-xs uppercase text-stone-400"><tr>{user.role === 'system_admin' ? <th className="p-3">选择</th> : null}<th className="p-3">桌台</th><th>开始</th><th>计划结束</th><th>暂停后预计结束</th><th>实际结束</th><th>计划/实际/暂停</th><th>调整</th><th>开台/清台</th>{user.role === 'system_admin' ? <th className="text-right">操作</th> : null}</tr></thead><tbody>{records.data.records.map((record) => (
          <tr key={record.id} className="border-t border-stone-100 align-top" onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
            {user.role === 'system_admin' ? <td className="p-3"><input type="checkbox" aria-label={`选择 ${record.tableNameSnapshot} 的计时记录`} checked={selectedRecordIds.includes(record.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedRecordIds((current) => event.target.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} /></td> : null}
            <td className="p-3 font-bold">{record.tableNameSnapshot}{expandedId === record.id ? <div className="mt-2 min-w-72 text-xs font-normal text-stone-500">{record.adjustments.length ? record.adjustments.map((adjustment, index) => <p key={`${adjustment.at}-${index}`}>{adjustment.type === 'add' ? '加时' : '减时'} {Math.round(adjustment.seconds / 60)} 分 · {adjustment.byNameSnapshot} · {adjustment.reason || '无备注'}</p>) : '无调整记录'}</div> : null}</td>
            <td>{new Date(record.startTime).toLocaleString()}</td><td>{new Date(record.plannedEndTime).toLocaleString()}</td><td>{new Date(record.effectiveEndTimeAtReset).toLocaleString()}</td><td>{new Date(record.actualEndTime).toLocaleString()}</td>
            <td>{Math.round(record.plannedDurationSeconds / 60)} / {Math.round(record.actualDurationSeconds / 60)} / {Math.round(record.totalPausedSeconds / 60)} 分</td><td>{record.adjustments.length} 次</td><td>{record.startedByNameSnapshot} / {record.resetByNameSnapshot}</td>
            {user.role === 'system_admin' ? <td className="py-2 text-right"><button type="button" className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50" onClick={async (event) => {
              event.stopPropagation();
              if (!window.confirm(`确定删除“${record.tableNameSnapshot}”的这条计时记录吗？`)) return;
              try {
                await deleteRecord(selectedStoreId, record.id);
                showToast('计时记录已删除', 'success');
                setSelectedRecordIds((current) => current.filter((id) => id !== record.id));
                records.refresh();
              } catch (error) {
                showToast(error.message, 'error');
              }
            }}>删除</button></td> : null}
          </tr>
        ))}</tbody></table>{records.data.records.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">今日暂无计时记录</p> : null}</div>}
      </Card>
    </Page>
  );
}

export function AuditLogsPage() {
  const { selectedStoreId } = useStore();
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const resource = useResource(() => listAuditLogs(selectedStoreId, { ...(date ? { date } : {}), limit: 200 }), [selectedStoreId, date]);
  const visibleLogs = useMemo(() => (resource.data ?? []).filter((log) => !category || log.action.startsWith(`${category}.`)), [category, resource.data]);
  if (resource.error) return <ErrorMessage message={resource.error.message} onRetry={resource.refresh} />;
  return (
    <Page title="操作日志" description="查看门店关键操作的时间、人员和变更对象。">
      <Card><div className="mb-4 flex flex-wrap items-center gap-3"><input className={fieldClass} type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedLogIds([]); }} /><select className={fieldClass} value={category} onChange={(e) => { setCategory(e.target.value); setSelectedLogIds([]); }}><option value="">全部操作</option><option value="auth">登录</option><option value="timer">计时</option><option value="table">桌台</option><option value="setting">设置</option><option value="layout">布局</option><option value="store">门店</option><option value="user">用户</option></select><label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700"><input type="checkbox" checked={visibleLogs.length > 0 && selectedLogIds.length === visibleLogs.length} onChange={(event) => setSelectedLogIds(event.target.checked ? visibleLogs.map((log) => log.id) : [])} />全选当前结果</label><button type="button" disabled={!selectedLogIds.length} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40" onClick={async () => {
          if (!window.confirm(`确定删除选中的 ${selectedLogIds.length} 条日志吗？删除后无法恢复。`)) return;
          try {
            await deleteAuditLogs(selectedStoreId, selectedLogIds);
            showToast(`已删除 ${selectedLogIds.length} 条日志`, 'success');
            setSelectedLogIds([]);
            resource.refresh();
          } catch (error) {
            showToast(error.message, 'error');
          }
        }}>批量删除（{selectedLogIds.length}）</button></div>
        {!resource.data ? <LoadingSpinner label="正在读取操作日志" /> : <div className="space-y-2">{visibleLogs.map((log) => <div key={log.id} className="grid gap-2 rounded-xl bg-stone-50 p-3 text-sm sm:grid-cols-[auto_11rem_12rem_1fr_auto] sm:items-center"><input type="checkbox" aria-label={`选择日志 ${auditActionLabel(log.action)}`} checked={selectedLogIds.includes(log.id)} onChange={(event) => setSelectedLogIds((current) => event.target.checked ? [...current, log.id] : current.filter((id) => id !== log.id))} /><time>{new Date(log.timestamp).toLocaleString()}</time><strong>{auditActionLabel(log.action)}</strong><span className="text-stone-500">{log.userNameSnapshot || '系统'} · {log.targetType} {log.targetId || ''}</span><button type="button" className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50" onClick={async () => {
          if (!window.confirm('删除后无法恢复，确定删除这条日志吗？')) return;
          try {
            await deleteAuditLog(selectedStoreId, log.id);
            showToast('日志已删除', 'success');
            resource.refresh();
          } catch (error) {
            showToast(error.message, 'error');
          }
        }}>删除</button></div>)}{visibleLogs.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">没有符合条件的日志</p> : null}</div>}
      </Card>
    </Page>
  );
}
