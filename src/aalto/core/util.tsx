import { createSignal, untrack, type Accessor, type JSX } from 'solid-js';
import type { IconLike, IconProps, AvatarProps } from '../types';

/** Join truthy class names. */
export function cx(...c: unknown[]): string {
  return c.filter(Boolean).join(' ');
}

/**
 * Controlled-or-uncontrolled state, Solid style.
 * When `value()` is undefined the component keeps its own signal (seeded from `initial`);
 * either way `onChange` is called on every change.
 */
export function createControllable<T>(value: () => T | undefined, initial: T, onChange?: (v: T) => void): [Accessor<T>, (v: T) => void] {
  const [inner, setInner] = createSignal<T>(untrack(() => value()) ?? initial);
  const get = () => { const v = value(); return v !== undefined ? v : inner(); };
  const set = (v: T) => { if (untrack(value) === undefined) setInner(() => v); onChange?.(v); };
  return [get, set];
}

/** Material Symbols ligature icon. Rounded in the M3 edition, Outlined in the Cloudflare edition (set by the stylesheet). */
export function Icon(props: IconProps) {
  return <span class={cx('aa-icon', props.filled && 'is-filled', props.class)} aria-hidden="true" style={props.size ? { 'font-size': props.size + 'px' } : undefined}>{props.name}</span>;
}

/** Render an IconLike: a ligature name becomes <Icon>, anything else passes through. */
export function ic(v: IconLike | undefined | null, filled?: boolean): JSX.Element {
  if (v == null || v === '') return null;
  return typeof v === 'string' ? <Icon name={v} filled={filled} /> : v;
}

export function Avatar(props: AvatarProps) {
  return (
    <span class={cx('aa-avatar', props.class)} style={props.color ? { background: props.color } : undefined}>
      {props.src ? <img src={props.src} alt={props.alt ?? ''} /> : props.children}
    </span>
  );
}

export const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
