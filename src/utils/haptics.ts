// language: TypeScript, file: src/utils/haptics.ts, target: Web / Mobile Browser

export const haptic = {
  // Light tick for standard button taps, pill toggles
  tap: () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch {
      // safe fallback
    }
  },

  // Subtle impact for selection, drawer toggle, modal open
  impact: () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(18);
      }
    } catch {
      // safe fallback
    }
  },

  // Soft double-pulse for message sent, audio playback start
  send: () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([12, 30, 16]);
      }
    } catch {
      // safe fallback
    }
  },

  // Confetti / checkmark celebration pulse for saving word
  success: () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([15, 40, 25]);
      }
    } catch {
      // safe fallback
    }
  },

  // Warning for limit reached or offline
  warning: () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([35, 60, 45]);
      }
    } catch {
      // safe fallback
    }
  }
};
