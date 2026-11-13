import { For, Show, splitProps, type JSX } from 'solid-js';
import { cx, ic, Icon, createControllable } from '../core/util';
import { KUMO } from '../core/edition';
import { Menu } from './selection';
import type { ButtonProps, ButtonGroupProps, IconButtonProps, FABProps, ExtendedFABProps, FABMenuProps, SegmentedButtonProps, SplitButtonProps } from '../types';

const DEFAULT_VARIANT = KUMO ? 'secondary' : 'filled';
const DEFAULT_SIZE = KUMO ? 'm' : 's';

/** Common button: filled/tonal/outlined/text/elevated (M3) or primary/secondary/ghost/outline/destructive (Kumo). Optional toggle. */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'icon', 'trailingIcon', 'shape', 'toggle', 'selected', 'defaultSelected', 'onSelectedChange', 'class', 'children', 'onClick', 'type']);
  const toggle = () => !!local.toggle || local.selected !== undefined;
  const [sel, setSel] = createControllable(() => local.selected, local.defaultSelected ?? false, local.onSelectedChange);
  return (
    <button
      {...rest}
      type={local.type ?? 'button'}
      class={cx('aa-sl aa-btn', 'aa-btn-' + (local.variant ?? DEFAULT_VARIANT), 'aa-btn-' + (local.size ?? DEFAULT_SIZE),
        local.shape === 'square' && 'aa-btn-square', local.shape === 'round' && 'aa-btn-round',
        toggle() && 'is-toggle', toggle() && sel() && 'is-selected', local.class)}
      aria-pressed={toggle() ? sel() : undefined}
      onClick={(e) => { if (toggle()) setSel(!sel()); (local.onClick as any)?.(e); }}
    >
      {ic(local.icon, toggle() && sel())}{local.children}{ic(local.trailingIcon)}
    </button>
  );
}

/** Groups related buttons: standard (spaced) or connected (fused). */
export function ButtonGroup(props: ButtonGroupProps) {
  return <div role="group" aria-label={props.label} class={cx('aa-bgroup', 'aa-bgroup-' + (props.variant ?? 'standard'), props.class)} style={props.style}>{props.children}</div>;
}

/** Icon-only button. Always give it a `label`. */
export function IconButton(props: IconButtonProps) {
  const toggle = () => !!props.toggle || props.selected !== undefined;
  const [sel, setSel] = createControllable(() => props.selected, props.defaultSelected ?? false, props.onSelectedChange);
  return (
    <button type="button" aria-label={props.label} title={props.label} disabled={props.disabled}
      aria-pressed={toggle() ? sel() : undefined}
      class={cx('aa-sl aa-ibtn', 'aa-ibtn-' + (props.variant ?? 'standard'), props.size && 'aa-ibtn-' + props.size, props.width && 'aa-ibtn-' + props.width,
        props.shape === 'square' && 'aa-ibtn-square', toggle() && 'is-toggle', toggle() && sel() && 'is-selected', props.class)}
      style={props.style}
      onClick={(e) => { if (toggle()) setSel(!sel()); props.onClick?.(e); }}
    >
      <Icon name={(toggle() && sel() && props.selectedIcon) || props.icon} filled={toggle() && sel()} />
    </button>
  );
}

/** Floating action button (icon only). */
export function FAB(props: FABProps) {
  return (
    <button type="button" aria-label={props.label} title={props.label} aria-expanded={props['aria-expanded']} onClick={(e) => props.onClick?.(e)} style={props.style}
      class={cx('aa-sl aa-fab', props.size && props.size !== 's' && 'aa-fab-' + props.size, 'aa-fab-' + (props.color ?? 'primary-container'), props.class)}>
      {ic(props.icon)}
    </button>
  );
}

/** Floating action button with a label. */
export function ExtendedFAB(props: ExtendedFABProps) {
  return (
    <button type="button" onClick={(e) => props.onClick?.(e)} style={props.style}
      class={cx('aa-sl aa-fab aa-fab-ext', props.size && props.size !== 's' && 'aa-fab-' + props.size, 'aa-fab-' + (props.color ?? 'primary-container'), props.class)}>
      {ic(props.icon)}{props.label}
    </button>
  );
}

/** A FAB that opens a short list of related actions. */
export function FABMenu(props: FABMenuProps) {
  const [open, setOpen] = createControllable(() => props.open, props.defaultOpen ?? false, props.onOpenChange);
  const color = () => props.color ?? 'primary';
  return (
    <div class={cx('aa-fabmenu', 'aa-fabmenu-' + color(), props.class)} style={props.style}>
      <Show when={open()}>
        <div class="aa-fabmenu-list" role="menu">
          <For each={props.items}>{(it) => (
            <button type="button" role="menuitem" class="aa-sl aa-fabmenu-item" onClick={() => { it.onClick?.(); setOpen(false); }}>{ic(it.icon)}{it.label}</button>
          )}</For>
        </div>
      </Show>
      <Show when={open()} fallback={
        <FAB icon={props.icon ?? 'add'} color={(color() + '-container') as any} size={props.size} label={props.label ?? 'Open menu'} aria-expanded={false} onClick={() => setOpen(true)} />
      }>
        <button type="button" class="aa-sl aa-fabmenu-close" aria-label="Close menu" aria-expanded={true} onClick={() => setOpen(false)}><Icon name="close" /></button>
      </Show>
    </div>
  );
}

/** Pick one (or several, with multiSelect) of 2–5 options. */
export function SegmentedButton(props: SegmentedButtonProps) {
  const multi = () => !!props.multiSelect;
  const [val, setVal] = createControllable<any>(() => props.value, props.defaultValue ?? (props.multiSelect ? [] : null), props.onChange);
  const isOn = (v: string) => (multi() ? ((val() as string[]) ?? []).includes(v) : val() === v);
  const pick = (v: string) => {
    if (!multi()) return setVal(v);
    const cur = [...((val() as string[]) ?? [])]; const i = cur.indexOf(v);
    if (i >= 0) cur.splice(i, 1); else cur.push(v);
    setVal(cur);
  };
  return (
    <div class={cx('aa-seg', props.class)} style={props.style} role={multi() ? 'group' : 'radiogroup'} aria-label={props.label}>
      <For each={props.options}>{(o) => (
        <button type="button" disabled={o.disabled} role={multi() ? undefined : 'radio'} aria-checked={multi() ? undefined : isOn(o.value)} aria-pressed={multi() ? isOn(o.value) : undefined}
          class={cx('aa-sl aa-seg-btn', isOn(o.value) && 'is-selected')} onClick={() => pick(o.value)}>
          {isOn(o.value) && (multi() || !KUMO) ? <Icon name="check" /> : ic(o.icon)}{o.label}
        </button>
      )}</For>
    </div>
  );
}

/** A main action fused to a chevron that opens a menu of related options. */
export function SplitButton(props: SplitButtonProps) {
  const [open, setOpen] = createControllable(() => props.open, props.defaultOpen ?? false, props.onOpenChange);
  const v = () => props.variant ?? (KUMO ? 'primary' : 'filled');
  const size = () => props.size ?? DEFAULT_SIZE;
  return (
    <div class="aa-split-wrap">
      <div class={cx('aa-split', props.class)} style={props.style} role="group">
        <Button variant={v()} size={size()} icon={props.icon} onClick={(e) => props.onClick?.(e)} disabled={props.disabled}>{props.label}</Button>
        <button type="button" disabled={props.disabled} aria-label={props.menuLabel ?? 'More options'} aria-haspopup="menu" aria-expanded={open()}
          class={cx('aa-sl aa-btn', 'aa-btn-' + v(), 'aa-btn-' + size(), open() && 'is-selected')} onClick={() => setOpen(!open())}>
          <Icon name="keyboard_arrow_down" />
        </button>
      </div>
      <Show when={open() && props.items}><Menu items={props.items!} onSelect={() => setOpen(false)} /></Show>
    </div>
  );
}

export type { JSX };
