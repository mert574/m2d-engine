// Letters
export const KEY_A = 'a';
export const KEY_B = 'b';
export const KEY_C = 'c';
export const KEY_D = 'd';
export const KEY_E = 'e';
export const KEY_F = 'f';
export const KEY_G = 'g';
export const KEY_H = 'h';
export const KEY_I = 'i';
export const KEY_J = 'j';
export const KEY_K = 'k';
export const KEY_L = 'l';
export const KEY_M = 'm';
export const KEY_N = 'n';
export const KEY_O = 'o';
export const KEY_P = 'p';
export const KEY_Q = 'q';
export const KEY_R = 'r';
export const KEY_S = 's';
export const KEY_T = 't';
export const KEY_U = 'u';
export const KEY_V = 'v';
export const KEY_W = 'w';
export const KEY_X = 'x';
export const KEY_Y = 'y';
export const KEY_Z = 'z';

// Numbers
export const KEY_0 = '0';
export const KEY_1 = '1';
export const KEY_2 = '2';
export const KEY_3 = '3';
export const KEY_4 = '4';
export const KEY_5 = '5';
export const KEY_6 = '6';
export const KEY_7 = '7';
export const KEY_8 = '8';
export const KEY_9 = '9';

// Special Keys
export const KEY_SPACE = ' ';
export const KEY_ENTER = 'Enter';
export const KEY_ESCAPE = 'Escape';
export const KEY_SHIFT = 'Shift';
export const KEY_CTRL = 'Control';
export const KEY_ALT = 'Alt';
export const KEY_TAB = 'Tab';
export const KEY_BACKSPACE = 'Backspace';
export const KEY_DELETE = 'Delete';
export const KEY_INSERT = 'Insert';
export const KEY_HOME = 'Home';
export const KEY_END = 'End';
export const KEY_PAGEUP = 'PageUp';
export const KEY_PAGEDOWN = 'PageDown';

// Arrow Keys
export const KEY_LEFT = 'ArrowLeft';
export const KEY_UP = 'ArrowUp';
export const KEY_RIGHT = 'ArrowRight';
export const KEY_DOWN = 'ArrowDown';

// Function Keys
export const KEY_F1 = 'F1';
export const KEY_F2 = 'F2';
export const KEY_F3 = 'F3';
export const KEY_F4 = 'F4';
export const KEY_F5 = 'F5';
export const KEY_F6 = 'F6';
export const KEY_F7 = 'F7';
export const KEY_F8 = 'F8';
export const KEY_F9 = 'F9';
export const KEY_F10 = 'F10';
export const KEY_F11 = 'F11';
export const KEY_F12 = 'F12';

// Numpad
export const KEY_NUMPAD0 = 'Numpad0';
export const KEY_NUMPAD1 = 'Numpad1';
export const KEY_NUMPAD2 = 'Numpad2';
export const KEY_NUMPAD3 = 'Numpad3';
export const KEY_NUMPAD4 = 'Numpad4';
export const KEY_NUMPAD5 = 'Numpad5';
export const KEY_NUMPAD6 = 'Numpad6';
export const KEY_NUMPAD7 = 'Numpad7';
export const KEY_NUMPAD8 = 'Numpad8';
export const KEY_NUMPAD9 = 'Numpad9';
export const KEY_MULTIPLY = 'NumpadMultiply';
export const KEY_ADD = 'NumpadAdd';
export const KEY_SUBTRACT = 'NumpadSubtract';
export const KEY_DECIMAL = 'NumpadDecimal';
export const KEY_DIVIDE = 'NumpadDivide';

// Punctuation
export const KEY_SEMICOLON = ';';
export const KEY_EQUALS = '=';
export const KEY_COMMA = ',';
export const KEY_MINUS = '-';
export const KEY_PERIOD = '.';
export const KEY_SLASH = '/';
export const KEY_BACKTICK = '`';
export const KEY_BRACKET_LEFT = '[';
export const KEY_BACKSLASH = '\\';
export const KEY_BRACKET_RIGHT = ']';
export const KEY_QUOTE = "'";

export function getKeyCode(key) {
  return key.charCodeAt(0);
}

export function getKeyName(code) {
  return String.fromCharCode(code);
}
