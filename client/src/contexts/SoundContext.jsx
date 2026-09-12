import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useStore } from './StoreContext.jsx';
import {
  authorizeSound,
  closeSoundContext,
  isSoundAuthorized,
  playWarningTone,
  startAlarmTone,
  stopAlarmTone,
} from '../utils/sound.js';

const SOUND_STORAGE_KEY = 'potxpress_sound_enabled';
const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const { selectedStoreId } = useStore();
  const [localEnabled, setLocalEnabled] = useState(
    () => localStorage.getItem(SOUND_STORAGE_KEY) === 'true',
  );
  const [authorized, setAuthorized] = useState(() => isSoundAuthorized());
  const [storeSettings, setStoreSettings] = useState(null);
  const [alertCounts, setAlertCounts] = useState({
    warning: 0,
    overtime: 0,
  });
  const storeEnabled = storeSettings?.soundEnabled === true;
  const canPlay = localEnabled && storeEnabled && authorized;

  useEffect(() => {
    stopAlarmTone();
    setStoreSettings(null);
    setAlertCounts({ warning: 0, overtime: 0 });
  }, [selectedStoreId]);

  useEffect(() => () => {
    closeSoundContext();
  }, []);

  const enableSound = useCallback(async () => {
    let result = false;
    try {
      result = await authorizeSound();
    } catch {
      result = false;
    }
    setAuthorized(result);
    if (result) {
      setLocalEnabled(true);
      localStorage.setItem(SOUND_STORAGE_KEY, 'true');
      playWarningTone();
    }
    return result;
  }, []);

  const disableSound = useCallback(() => {
    setLocalEnabled(false);
    localStorage.setItem(SOUND_STORAGE_KEY, 'false');
    stopAlarmTone();
  }, []);

  const refreshAuthorization = useCallback(() => {
    const next = isSoundAuthorized();
    setAuthorized(next);
    return next;
  }, []);

  useEffect(() => {
    const refresh = () => refreshAuthorization();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [refreshAuthorization]);

  const playWarning = useCallback(() => {
    if (canPlay) {
      playWarningTone();
      return true;
    }
    return false;
  }, [canPlay]);

  const startOvertimeAlarm = useCallback(() => {
    if (canPlay) {
      startAlarmTone();
    }
  }, [canPlay]);

  const stopOvertimeAlarm = useCallback(() => {
    stopAlarmTone();
  }, []);

  useEffect(() => {
    if (!canPlay) {
      stopAlarmTone();
    }
  }, [canPlay]);

  const reason = !authorized
    ? '声音尚未授权'
    : !localEnabled
      ? '本机已静音'
      : !storeEnabled
        ? '门店已全局静音'
        : '声音提醒已启用';

  const value = useMemo(() => ({
    localEnabled,
    authorized,
    storeEnabled,
    storeSettings,
    alertCounts,
    canPlay,
    reason,
    enableSound,
    disableSound,
    refreshAuthorization,
    setStoreSettings,
    setAlertCounts,
    playWarning,
    startOvertimeAlarm,
    stopOvertimeAlarm,
  }), [
    alertCounts,
    authorized,
    canPlay,
    disableSound,
    enableSound,
    localEnabled,
    playWarning,
    reason,
    startOvertimeAlarm,
    stopOvertimeAlarm,
    storeEnabled,
    storeSettings,
    refreshAuthorization,
  ]);

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);

  if (!context) {
    throw new Error('useSound 必须在 SoundProvider 内使用');
  }

  return context;
}
