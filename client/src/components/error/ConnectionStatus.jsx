import { Wifi, WifiOff, Loader } from 'lucide-react';
import { useErrorContext } from '../../contexts/ErrorContext.jsx';

const STATUS_CONFIG = {
  connected: {
    color: 'bg-emerald-500',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    bgColor: 'bg-emerald-50',
    text: '已连接',
    Icon: Wifi,
  },
  reconnecting: {
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50',
    text: '重连中',
    Icon: Loader,
  },
  disconnected: {
    color: 'bg-red-500',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    bgColor: 'bg-red-50',
    text: '已断开',
    Icon: WifiOff,
  },
};

/**
 * WebSocket / 网络连接状态指示器。
 *
 * idle 状态（没有门店订阅）时完全不渲染。
 */
export function ConnectionStatus() {
  const { connectionStatus, lastPing } = useErrorContext();

  if (connectionStatus === 'idle') {
    return null;
  }

  const config = STATUS_CONFIG[connectionStatus];
  const Icon = config.Icon;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${config.borderColor} ${config.bgColor} ${config.textColor}`}
      title={`实时连接状态：${config.text}${lastPing ? ` (${new Date(lastPing).toLocaleTimeString('zh-CN')})` : ''}`}
      role="status"
      aria-label={`连接状态：${config.text}`}
    >
      <span className={`relative flex h-2 w-2 ${config.color !== 'bg-amber-500' ? '' : ''}`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.color}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`} />
      </span>
      <span>{config.text}</span>
    </div>
  );
}
