let audioContext = null;
let alarmIntervalId = null;
let alarmFrequency = 880;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function beep(frequency, durationSeconds = 0.2, delaySeconds = 0) {
  const context = getAudioContext();

  if (!context || context.state !== 'running') {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime + delaySeconds;
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startAt + durationSeconds,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSeconds + 0.02);
}

export async function authorizeSound() {
  const context = getAudioContext();

  if (!context) {
    return false;
  }

  await context.resume();
  return context.state === 'running';
}

export function isSoundAuthorized() {
  return getAudioContext()?.state === 'running';
}

export function playWarningTone() {
  beep(880, 0.2, 0);
  beep(880, 0.2, 0.3);
}

export function startAlarmTone() {
  if (alarmIntervalId) {
    return;
  }

  beep(alarmFrequency, 0.32);
  alarmIntervalId = setInterval(() => {
    alarmFrequency = alarmFrequency === 880 ? 660 : 880;
    beep(alarmFrequency, 0.32);
  }, 400);
}

export function stopAlarmTone() {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

export async function closeSoundContext() {
  stopAlarmTone();

  if (audioContext) {
    await audioContext.close().catch(() => {});
    audioContext = null;
  }
}
