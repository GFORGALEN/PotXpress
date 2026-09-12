import { useEffect, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { useSound } from '../../contexts/SoundContext.jsx';

export function SoundSettingsDialog({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [authorizationFailed, setAuthorizationFailed] = useState(false);
  const {
    authorized,
    localEnabled,
    storeEnabled,
    enableSound,
    disableSound,
    refreshAuthorization,
  } = useSound();

  useEffect(() => {
    if (open) {
      refreshAuthorization();
      setAuthorizationFailed(false);
    }
  }, [open, refreshAuthorization]);

  if (!open) return null;

  const active = authorized && localEnabled && storeEnabled;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div
        data-potx-touch-scroll
        className="touch-scroll-region max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sound-dialog-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ember-100 text-ember-700">
              {active ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </span>
            <h2 id="sound-dialog-title" className="mt-4 text-xl font-black text-ink-950">
              声音提醒设置
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100"
            aria-label="关闭声音提醒设置"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-stone-50 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-ink-950">声音提醒</p>
              <p className="mt-1 text-xs text-stone-500">
                {active ? '本机将播放计时提示音' : '本机不会播放计时提示音'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              aria-label="声音提醒"
              disabled={!storeEnabled || busy}
              onClick={async () => {
                setAuthorizationFailed(false);
                if (active) {
                  disableSound();
                  return;
                }
                setBusy(true);
                const enabled = await enableSound();
                setBusy(false);
                setAuthorizationFailed(!enabled);
              }}
              className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-emerald-500' : 'bg-stone-300'}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${active ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          {busy ? (
            <p className="mt-3 text-xs font-bold text-ember-700">正在开启并测试声音…</p>
          ) : null}
          {authorizationFailed ? (
            <p className="mt-3 text-xs font-bold text-red-700">
              浏览器未允许播放声音，请检查浏览器网站声音权限后重试。
            </p>
          ) : null}
        </div>

        {!storeEnabled ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            本门店已关闭声音。管理员可在“门店设置”中开启。
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-12 w-full rounded-2xl bg-ink-900 px-4 text-sm font-black text-white"
        >
          完成
        </button>
      </div>
    </div>
  );
}
