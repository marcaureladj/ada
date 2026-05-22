// Translate xdotool-style key names (which Computer Use emits) to Playwright
// keyboard names. See https://playwright.dev/docs/api/class-keyboard for the
// destination vocabulary. Combinations are joined with '+' on both sides.

const KEY_MAP: Record<string, string> = {
  Return: 'Enter',
  KP_Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  BackSpace: 'Backspace',
  Delete: 'Delete',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  Page_Up: 'PageUp',
  Page_Down: 'PageDown',
  space: 'Space',
  ctrl: 'Control',
  Control_L: 'Control',
  Control_R: 'Control',
  alt: 'Alt',
  Alt_L: 'Alt',
  Alt_R: 'Alt',
  shift: 'Shift',
  Shift_L: 'Shift',
  Shift_R: 'Shift',
  super: 'Meta',
  Super_L: 'Meta',
  Super_R: 'Meta',
  cmd: 'Meta',
};

export function translateKey(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      const trimmed = part.trim();
      if (KEY_MAP[trimmed]) return KEY_MAP[trimmed];
      const lower = trimmed.toLowerCase();
      if (KEY_MAP[lower]) return KEY_MAP[lower];
      if (trimmed.length === 1) return trimmed.toUpperCase();
      // Already Playwright-friendly (e.g. "F5", "Enter") — pass through.
      return trimmed;
    })
    .join('+');
}
