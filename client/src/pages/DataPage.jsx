import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowUpRight, RefreshCw, Store, Activity, Clock3, LayoutGrid } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { formatStoreDisplayName } from '../utils/storeSelection.js';
import './DataPage.css';

const periods = [['today', '今天'], ['yesterday', '昨天'], ['7d', '近 7 天'], ['30d', '近 30 天']];
const colors = ['#216c55', '#d08843', '#6684b7', '#a06e99', '#7f8d4d'];
const number = (value, digits = 0) => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const percent = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;

function Trend({ stores }) {
  const max = Math.max(1, ...stores.flatMap((store) => store.trend.map((point) => point.count)));
  const count = stores[0]?.trend.length ?? 0;
  if (!count) return <p className="data-empty">暂无趋势数据</p>;
  if (count === 1) return <div className="data-day-bars">{stores.map((store, index) => <div key={store.id}><span>{store.name}</span><div><i style={{ width: `${store.sessions / max * 100}%`, background: colors[index % colors.length] }} /></div><b>{store.sessions}</b></div>)}</div>;
  return <>
    <svg className="data-trend" viewBox="0 0 760 220" role="img" aria-label="各门店每日开台次数趋势">
      {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1="35" x2="740" y1={185 - tick * 55} y2={185 - tick * 55} stroke="#e8ebe5" /><text x="0" y={190 - tick * 55} fill="#89928a" fontSize="11">{number(max * tick / 3)}</text></g>)}
      {stores.map((store, index) => <g key={store.id}><polyline fill="none" stroke={colors[index % colors.length]} strokeWidth="2.5" points={store.trend.map((point, i) => `${35 + i * 705 / (count - 1)},${185 - point.count / max * 165}`).join(' ')} />{store.trend.map((point, i) => <circle key={point.date} cx={35 + i * 705 / (count - 1)} cy={185 - point.count / max * 165} r="3" fill={colors[index % colors.length]}><title>{store.name} · {point.date} · {point.count} 次</title></circle>)}</g>)}
      <text x="35" y="212" fill="#89928a" fontSize="11">{stores[0].startDate}</text><text x="740" y="212" textAnchor="end" fill="#89928a" fontSize="11">{stores[0].endDate}</text>
    </svg>
    <div className="data-legend">{stores.map((store, index) => <span key={store.id}><i style={{ background: colors[index % colors.length] }} />{store.name}</span>)}</div>
  </>;
}

export function DataPage() {
  const [period, setPeriod] = useState('today');
  const [date, setDate] = useState('');
  const selectDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setDate(value);
    setPeriod('date');
  };
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    setPayload(null);
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const response = await apiClient.get('/data', { params: { period, ...(period === 'date' ? { date } : {}) }, signal: controller.signal });
        if (active) { setPayload(response.data.data); setError(''); }
      } catch (requestError) {
        if (active) setError(requestError.message || '数据加载失败');
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [period, date, refresh]);
  const stores = (payload?.stores ?? []).map((store) => ({ ...store, name: formatStoreDisplayName(store.name).replace(/^小锅快线\s*[–—-]\s*/, '') }));
  const selected = stores.find((store) => store.id === selectedId);
  const displayedDate = period === 'date' ? date : stores[0]?.endDate ?? '';
  const changeDay = (offset) => {
    if (!displayedDate) return;
    selectDate(new Date(Date.parse(`${displayedDate}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10));
  };
  const sum = (key) => stores.reduce((total, store) => total + store[key], 0);
  const totalTables = sum('tableCount');
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: (selected ? [selected] : stores).reduce((total, store) => total + store.hours[hour].count, 0) }));
  const peak = Math.max(1, ...hours.map((point) => point.count));
  return <main className="data-page">
    <header className="data-header"><Link to="/" className="data-brand"><span>PX</span> POTXPRESS <small>经营数据</small></Link><Link to="/" className="data-back"><ArrowLeft size={15} /> 返回工作台</Link></header>
    <div className="data-content">
      <div className="data-title-row"><div><div className="data-eyebrow">OPERATIONS OVERVIEW · 系统管理员专属</div><h1>把每家店的表现，看清楚。</h1><p>从此刻的忙闲，到每天的变化，所有门店尽在这里。</p></div><div className="data-live"><i />{payload ? `${stores.length} 家门店 · 手动刷新` : '正在连接数据'}</div></div>
      <div className="data-toolbar"><div className="data-periods" aria-label="统计周期">{periods.map(([value, label]) => <button key={value} aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div><button className="data-refresh" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} className={loading ? 'data-spin' : ''} />刷新数据</button></div>
      <div className="data-date-toolbar">
        <label htmlFor="data-date">查看指定日期</label>
        <button disabled={!displayedDate} onClick={() => changeDay(-1)}>前一天</button>
        <input id="data-date" aria-label="查看指定日期" type="date" value={displayedDate} onChange={(event) => selectDate(event.target.value)} />
        <button disabled={!displayedDate} onClick={() => changeDay(1)}>后一天</button>
        <span>{period === 'date' ? `${date} · 各门店当地日期` : '选择日期可查看当天明细'} · 占用和空闲仍为实时状态</span>
      </div>
      {error && <div role="alert" className="data-error">{error}。{payload ? '当前为上次成功读取的数据。' : '请重试。'}<button onClick={() => setRefresh((value) => value + 1)}>重新加载</button></div>}
      {!payload && loading && <div className="data-empty" role="status">正在汇总门店数据…</div>}
      {payload && <>
        <section className="data-metrics" aria-label="全部门店汇总">
          {[['当前使用桌数', sum('occupied'), `共 ${totalTables} 桌 · 使用率 ${percent(totalTables ? sum('occupied') / totalTables : null)}`, LayoutGrid], ['当前空闲桌数', sum('idle'), '可用于接待的启用桌台', Store], ['所选期间开台', sum('sessions'), '含进行中计时 · 拼桌计一次', Activity], ['当前超时桌数', sum('overtime'), '实时状态 · 不受日期筛选影响', Clock3]].map(([label, value, hint, Icon], index) => <article className={`data-metric ${index === 0 ? 'featured' : ''}`} key={label}><div>{label}<Icon size={19} /></div><strong>{number(value)}<small>{index === 2 ? '次' : '桌'}</small></strong><p>{hint}</p></article>)}
        </section>
        <div className="data-section-heading"><div><h2>门店一览 <span>{stores.length.toString().padStart(2, '0')}</span></h2><p>点击门店卡片，查看该店的详细表现</p></div><span className="data-muted">使用率为当前实时值</span></div>
        {!stores.length && <div className="data-empty">暂无启用的门店。添加门店后，数据会自动汇总到这里。</div>}
        <section className="data-store-grid">{stores.map((store, index) => <button key={store.id} className={`data-store-card ${selectedId === store.id ? 'selected' : ''}`} aria-pressed={selectedId === store.id} onClick={() => setSelectedId(selectedId === store.id ? null : store.id)} style={{ '--store-color': colors[index % colors.length] }}><div className="data-store-top"><span>STORE {String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={18} /></div><h3>{store.name}</h3><div className="data-store-rate">{percent(store.utilization)}<span>当前使用率</span></div><div className="data-meter"><i style={{ width: `${(store.utilization ?? 0) * 100}%` }} /></div><div className="data-store-stats"><span>使用中 <b>{store.occupied}/{store.tableCount}</b></span><span>期间开台 <b>{store.sessions} 次</b></span><span>平均时长 <b>{number(store.averageMinutes)} 分</b></span></div><div className={`data-store-foot ${store.overtime ? 'warning' : ''}`}>{store.overtime ? `${store.overtime} 桌正在超时，请关注` : '当前无超时桌台'}</div></button>)}</section>
        <section className="data-charts"><article className="data-panel"><div className="data-panel-title"><div><h2>开台趋势</h2><p>{period === 'today' || period === 'yesterday' || period === 'date' ? '所选日期各门店开台对比' : '每日开台次数 · 按各店当地日期'}</p></div><span>次</span></div><Trend stores={stores} /></article><article className="data-panel"><div className="data-panel-title"><div><h2>忙碌发生在什么时候</h2><p>{selected?.name ?? '全部门店'} · 开台时间分布（当地时间）</p></div></div><div className="data-hours">{hours.map((point) => <div key={point.hour} title={`${point.hour}:00–${point.hour}:59 · ${point.count} 次`}><i style={{ height: `${point.count / peak * 140}px` }} /><span>{point.hour % 4 === 0 ? `${point.hour}时` : ''}</span></div>)}</div><p className="data-chart-note">{hours.some((point) => point.count) ? `开台最多的时段：${hours.filter((point) => point.count === peak).map((point) => `${point.hour}:00`).join('、')}` : '所选期间暂无开台记录'}</p></article></section>
        <section className="data-panel data-comparison"><div className="data-panel-title"><div><h2>门店表现对比</h2><p>同时看总量与每桌表现，更好地理解不同规模的门店</p></div></div><div className="data-table-scroll"><table><thead><tr><th>门店</th><th>统计日期</th><th>开台次数</th><th>每桌开台</th><th>已结束次数</th><th>平均使用时长</th><th>结束时超时比例</th></tr></thead><tbody>{stores.map((store) => <tr key={store.id}><th><button onClick={() => setSelectedId(store.id)}>{store.name}</button></th><td>{store.startDate} → {store.endDate}</td><td>{store.sessions}</td><td>{number(store.perTable, 1)}</td><td>{store.completed}</td><td>{number(store.averageMinutes)} 分钟</td><td>{percent(store.overtimeRate)}</td></tr>)}</tbody></table></div></section>
        {selected && <section className="data-panel data-detail"><div className="data-panel-title"><div><h2>{selected.name} · 门店详情</h2><p>{selected.timezone} · 所选期间最近 20 次开台</p></div><button onClick={() => setSelectedId(null)}>收起详情</button></div><div className="data-table-tags">{selected.tables.map((table) => <span key={table.id}>{table.name}<b>{table.sessions} 次</b>{table.occupied ? '使用中' : !table.enabled ? '已停用' : ''}</span>)}</div>{!selected.recent.length ? <p className="data-empty">该门店在所选期间暂无开台记录</p> : <div className="data-table-scroll"><table><thead><tr><th>桌台</th><th>开始时间</th><th>状态</th><th>使用时长</th></tr></thead><tbody>{selected.recent.map((session) => <tr key={session.id}><th>{session.table}{session.grouped && ' · 拼桌'}</th><td>{session.startTime}</td><td>{session.completed ? '已结束' : '进行中'}</td><td>{session.minutes == null ? '—' : `${session.minutes} 分钟`}</td></tr>)}</tbody></table></div>}</section>}
        <footer className="data-notes"><p>统计说明：按开台日期归属，拼桌接待计一次、占用按实际桌数计算。平均时长与超时比例仅统计已结束记录；每桌开台以当前启用桌数为分母。无样本显示「—」。</p><p>数据来自现有计时记录，已删除的历史记录不计入；本页不包含营业额或客流人数。最后成功更新：{new Date(payload.generatedAt).toLocaleString('zh-CN')}</p></footer>
      </>}
    </div>
  </main>;
}
