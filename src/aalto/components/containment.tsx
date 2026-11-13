import { For, Show, createSignal, type JSX } from 'solid-js';
import { cx, ic, Icon } from '../core/util';
import { KUMO } from '../core/edition';
import { Button, IconButton } from './actions';
import type { CardProps, CarouselProps, DialogProps, DividerProps, ListProps, ListItemProps, BottomSheetProps, SideSheetProps, OverlayProps } from '../types';

/** Card / layer card. Pass onClick to make the whole card a button. */
export function Card(props: CardProps) {
  const cls = () => cx('aa-card', 'aa-card-' + (props.variant ?? (KUMO ? 'default' : 'elevated')), props.onClick && 'aa-sl', props.class);
  return (
    <Show when={props.onClick} fallback={<div class={cls()} style={props.style}>{props.children}</div>}>
      <button type="button" class={cls()} style={props.style} onClick={(e) => props.onClick?.(e)}>{props.children}</button>
    </Show>
  );
}

/** Horizontal strip of visual items that resize as you browse. */
export function Carousel(props: CarouselProps) {
  const [active, setActive] = createSignal(0);
  const widths = () => ((props.layout ?? 'multi-browse') === 'hero' ? [0.78, 0.18] : [0.5, 0.3, 0.14]);
  const widthOf = (i: number) => {
    if (props.layout === 'uncontained') return null;
    const w = widths(); const rank = Math.min(Math.max(i - active(), 0), w.length - 1);
    return i < active() ? 0.08 : w[rank];
  };
  return (
    <div class={cx('aa-carousel', 'aa-carousel-' + (props.layout ?? 'multi-browse'), props.class)} role="list" style={props.height ? { height: props.height + 'px' } : undefined}>
      <For each={props.items}>{(it, i) => {
        const w = () => widthOf(i());
        return (
          <button type="button" role="listitem" aria-label={it.label} class={cx('aa-sl aa-car-item', w() !== null && w()! < 0.2 && 'is-small')}
            onClick={() => setActive(Math.min(i(), Math.max(0, props.items.length - 2)))}
            style={{ width: w() === null ? undefined : 'calc(' + w()! * 100 + '% - 8px)', background: it.color ?? 'var(--tertiary-container, var(--accent-tint))', color: it.textColor ?? 'var(--on-tertiary-container, var(--text-default))' }}>
            <Show when={it.src}><img src={it.src} alt="" /></Show>
            <span class="aa-car-label">{it.label}</span>
          </button>
        );
      }}</For>
    </div>
  );
}

/** Scrim + positioning shared by dialogs and sheets. `inline` renders in place (docs); `modal={false}` drops the scrim. */
export function Overlay(props: OverlayProps & { children: JSX.Element }) {
  return (
    <Show when={props.open !== false}>
      <Show when={props.modal !== false} fallback={props.children}>
        <div class={cx('aa-scrim', props.inline && 'is-inline')} onClick={(e) => { if (e.target === e.currentTarget) props.onClose?.(); }}>{props.children}</div>
      </Show>
    </Show>
  );
}

/** Basic (optional hero icon) or full-screen dialog. */
export function Dialog(props: DialogProps) {
  return (
    <Overlay open={props.open} modal={props.modal} inline={props.inline} onClose={props.onClose}>
      <Show when={props.fullscreen} fallback={
        <div role="dialog" aria-modal="true" aria-label={props.headline} class={cx('aa-dialog', props.icon && 'has-icon', props.class)} style={props.style}>
          <Show when={props.icon}><div class="aa-dialog-icon">{ic(props.icon)}</div></Show>
          <Show when={props.headline}><h2 class="aa-dialog-h">{props.headline}</h2></Show>
          <div>{props.children}</div>
          <Show when={props.actions}><div class="aa-dialog-actions">{props.actions}</div></Show>
        </div>
      }>
        <div role="dialog" aria-modal="true" aria-label={props.headline} class="aa-dialog aa-dialog-full">
          <div class="aa-dialog-bar">
            <IconButton icon="close" label="Close" onClick={() => props.onClose?.()} />
            <h2>{props.headline}</h2>
            <Show when={props.confirm}><Button variant={KUMO ? 'primary' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onConfirm?.()}>{props.confirm}</Button></Show>
          </div>
          <div class="aa-dialog-body">{props.children}</div>
        </div>
      </Show>
    </Overlay>
  );
}

export function Divider(props: DividerProps) {
  return <hr class={cx('aa-divider', props.inset && 'is-inset', props.middle && 'is-middle', props.vertical && 'is-vertical', props.class)} aria-orientation={props.vertical ? 'vertical' : undefined} />;
}

export function List(props: ListProps) {
  return <ul class={cx('aa-list', props.class)} role="list" style={props.style}>{props.children}</ul>;
}

/** One row of a List. Leading/trailing take an icon name or any element. */
export function ListItem(props: ListItemProps) {
  const lines = () => props.lines ?? (props.supporting ? (props.overline ? 3 : 2) : 1);
  const cls = () => cx('aa-li', lines() === 2 && 'is-two', lines() === 3 && 'is-three', props.selected && 'is-selected', props.disabled && 'is-disabled');
  const trailing = () => (typeof props.trailing === 'string' && /^[a-z_]+$/.test(props.trailing) ? <Icon name={props.trailing} /> : props.trailing);
  const inner = () => (
    <>
      <Show when={props.leading}><span class="aa-li-lead">{ic(props.leading)}</span></Show>
      <span class="aa-li-text">
        <Show when={props.overline}><div class="aa-li-over">{props.overline}</div></Show>
        <div class="aa-li-head">{props.headline}</div>
        <Show when={props.supporting}><div class="aa-li-sup">{props.supporting}</div></Show>
      </span>
      <Show when={props.trailing}><span class="aa-li-trail">{trailing()}</span></Show>
    </>
  );
  return (
    <li>
      <Show when={props.onClick} fallback={<div class={cls()}>{inner()}</div>}>
        <button type="button" class={cls() + ' aa-sl'} disabled={props.disabled} onClick={(e) => props.onClick?.(e)}>{inner()}</button>
      </Show>
    </li>
  );
}

export function BottomSheet(props: BottomSheetProps) {
  return (
    <Overlay open={props.open} modal={props.modal} inline={props.inline} onClose={props.onClose}>
      <div role="dialog" aria-label={props.label} class={cx('aa-bsheet', props.class)} style={props.style}>
        <Show when={props.handle !== false}><div class="aa-bsheet-handle" /></Show>
        {props.children}
      </div>
    </Overlay>
  );
}

export function SideSheet(props: SideSheetProps) {
  const modal = () => props.modal !== false;
  return (
    <Overlay open={props.open} modal={modal()} inline={props.inline} onClose={props.onClose}>
      <aside role={modal() ? 'dialog' : 'complementary'} aria-label={props.headline} class={cx('aa-ssheet', modal() && 'is-modal', props.class)} style={props.style}>
        <div class="aa-ssheet-head">
          <Show when={props.onBack}><IconButton icon="arrow_back" label="Back" onClick={() => props.onBack?.()} /></Show>
          <h2>{props.headline}</h2>
          <Show when={props.onClose}><IconButton icon="close" label="Close" onClick={() => props.onClose?.()} /></Show>
        </div>
        <div class="aa-ssheet-body">{props.children}</div>
        <Show when={props.actions}><div class="aa-ssheet-actions">{props.actions}</div></Show>
      </aside>
    </Overlay>
  );
}
