/**
 * A context menu: a list of actions at a point, dismissed by a click
 * elsewhere, Escape or scrolling. One at a time. Plain DOM, styled by
 * `.menu` in editor.css.
 */

export interface MenuItem {
  label: string;
  /** Shown muted at the right: a shortcut. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  /** A nested list, shown as a submenu on hover. */
  children?: MenuItem[];
  action?: () => void;
}

/** A divider between groups. */
export const SEPARATOR: MenuItem = { label: '-' };

let openMenu: HTMLElement | null = null;
let dismiss: (() => void) | null = null;

export function closeMenu(): void {
  dismiss?.();
}

export function showMenu(items: MenuItem[], at: { x: number; y: number }): void {
  closeMenu();
  const menu = build(items, 0);
  document.body.append(menu);
  place(menu, at.x, at.y);
  openMenu = menu;
  const onDown = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) closeMenu(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
  const onScroll = () => closeMenu();
  // On the next tick, so the click that opened the menu does not close it.
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('wheel', onScroll, true);
  }, 0);
  dismiss = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('wheel', onScroll, true);
    menu.remove();
    openMenu = null;
    dismiss = null;
  };
}

function build(items: MenuItem[], depth: number): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.label === '-') {
      const rule = document.createElement('div');
      rule.className = 'menu-sep';
      menu.append(rule);
      continue;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `menu-item${item.danger ? ' danger' : ''}${item.children ? ' has-children' : ''}`;
    row.setAttribute('role', 'menuitem');
    row.disabled = !!item.disabled || (!!item.children && !item.children.length);
    const label = document.createElement('span');
    label.textContent = item.label;
    row.append(label);
    if (item.hint) {
      const hint = document.createElement('span');
      hint.className = 'menu-hint';
      hint.textContent = item.hint;
      row.append(hint);
    }
    if (item.children) {
      const arrow = document.createElement('span');
      arrow.className = 'menu-hint';
      arrow.textContent = '›';
      row.append(arrow);
      let sub: HTMLElement | null = null;
      row.addEventListener('pointerenter', () => {
        for (const other of menu.querySelectorAll('.menu.sub')) other.remove();
        if (row.disabled) return;
        sub = build(item.children!, depth + 1);
        sub.classList.add('sub');
        menu.append(sub);
        const box = row.getBoundingClientRect();
        place(sub, box.right - 2, box.top - 4);
      });
    } else {
      row.addEventListener('pointerenter', () => { for (const other of menu.querySelectorAll('.menu.sub')) other.remove(); });
      row.addEventListener('click', () => { closeMenu(); item.action?.(); });
    }
    menu.append(row);
  }
  return menu;
}

/** Position a menu at a point, kept inside the window. */
function place(menu: HTMLElement, x: number, y: number): void {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const box = menu.getBoundingClientRect();
  if (box.right > window.innerWidth - 4) menu.style.left = `${Math.max(4, x - box.width)}px`;
  if (box.bottom > window.innerHeight - 4) menu.style.top = `${Math.max(4, window.innerHeight - 4 - box.height)}px`;
}

export function menuIsOpen(): boolean {
  return openMenu !== null;
}
