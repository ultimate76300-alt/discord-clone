const STORAGE_KEY = "discord-clone-voice-settings";

export const DEFAULT_VOICE_SETTINGS = {
  inputGain: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: false,
  micDeviceId: "",
  /** 720p30 = moins de saccades sur beaucoup de machines (la vidéo ne passe pas par le serveur). */
  screenPreset: "720p30",
};

/** Video constraints for getDisplayMedia (browser may approximate). */
export const SCREEN_SHARE_PRESETS = {
  "1080p30": {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
  "1080p60": {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 60, max: 60 },
  },
  "720p30": {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
  "720p60": {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 60, max: 60 },
  },
};

export const SCREEN_PRESET_LABELS = {
  "1080p30": "1080p · 30 fps",
  "1080p60": "1080p · 60 fps (exigeant)",
  "720p30": "720p · 30 fps (fluide)",
  "720p60": "720p · 60 fps",
};

/** Target max encode framerate from preset id (e.g. 1080p60 → 60). */
export function screenPresetTargetFramerate(presetKey) {
  return typeof presetKey === "string" && presetKey.includes("60") ? 60 : 30;
}

export function loadVoiceSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(partial) {
  const next = { ...loadVoiceSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
