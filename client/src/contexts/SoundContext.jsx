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
    () => localStorage.getItem(SOUND_STORAGE_KEY) !== 'false',
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
    const result = await authorizeSound();
    setAuthorized(result);
    return result;
  }, []);

  const toggleLocalSound = useCallback(() => {
    setLocalEnabled((current) => {
      const next = !current;
      localStorage.setItem(SOUND_STORAGE_KEY, String(next));

      if (!next) {
        stopAlarmTone();
      }

      return next;
    });
  }, []);

  const playWarning = useCallback(() => {
    if (canPlay) {
      playWarningTone();
    }
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
    toggleLocalSound,
    setStoreSettings,
    setAlertCounts,
    playWarning,
    startOvertimeAlarm,
    stopOvertimeAlarm,
  }), [
    alertCounts,
    authorized,
    canPlay,
    enableSound,
    localEnabled,
    playWarning,
    reason,
    startOvertimeAlarm,
    stopOvertimeAlarm,
    storeEnabled,
    storeSettings,
    toggleLocalSound,
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
