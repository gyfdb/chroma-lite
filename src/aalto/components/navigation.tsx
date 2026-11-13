import { For, Show, type JSX } from 'solid-js';
import { cx, ic, Icon, Avatar, createControllable } from '../core/util';
import { KUMO } from '../core/edition';
import { IconButton, FAB, ExtendedFAB } from './actions';
import { Badge } from './communication';
import { Divider, List, ListItem, Overlay } from './containment';
import type { TopAppBarProps, BottomAppBarProps, NavigationBarProps, NavigationRailProps, NavigationDrawerProps, TabsProps, ToolbarProps, SearchProps, NavItem, AppBarAction } from '../types';

const isAction = (a: unknown): a is AppBarAction => !!a && typeof a === 'object' && 'icon' in (a as object) && 'label' in (a as object) && !(a instanceof Node);

/** App bar: small / center (top bar) or medium / large (page header). */
export function TopAppBar(props: TopAppBarProps) {
  const v = () => props.variant ?? 'small';
  const big = () => v() === 'medium' || v() === 'large';
  const nav = () => (props.navIcon === null ? null : <IconButton icon={props.navIcon ?? 'arrow_back'} label={props.navLabel ?? 'Back'} onClick={() => props.onNav?.()} />);
  const acts = () => (
    <div class="aa-topbar-actions">
      <For each={props.actions ?? []}>{(a) => (isAction(a) ? <IconButton icon={a.icon} label={a.label} onClick={() => a.onClick?.()} /> : (a as JSX.Element))}</For>
    </div>
  );
  const title = () => (
    <h1 class="aa-topbar-title">{props.title}<Show when={props.subtitle}><div class="aa-topbar-sub">{props.subtitle}</div></Show></h1>
  );
  const cls = () => cx('aa-topbar', 'aa-topbar-' + v(), props.scrolled && 'is-scrolled', props.class);
  if (KUMO) {
    return (
      <header class={cls()} style={props.style}>
        <Show when={big()} fallback={<div class="aa-topbar-row">{nav()}{title()}{acts()}</div>}>
          <div class="aa-topbar-big"><div>{nav()}{title()}</div>{acts()}</div>
        </Show>
      </header>
    );
  }
  return (
    <header class={cls()} style={props.style}>
      <div class="aa-topbar-row">{nav()}<Show when={big()} fallback={title()}><span style={{ flex: 1 }} /></Show>{acts()}</div>
      <Show when={big()}><div class="aa-topbar-big">{title()}</div></Show>
    </header>
  );
}

export function BottomAppBar(props: BottomAppBarProps) {
  return (
    <div class={cx('aa-bottombar', props.class)} style={props.style} role="toolbar">
      <For each={props.actions ?? []}>{(a) => <IconButton icon={a.icon} label={a.label} onClick={() => a.onClick?.()} />}</For>
      <Show when={props.fab}>{(f) => <FAB color={KUMO ? 'primary' : 'primary-container'} {...f()} />}</Show>
    </div>
  );
}

function NavPill(p: { item: NavItem; on: boolean }) {
  return (
    <span class="aa-navbar-pill">
      <Icon name={p.item.icon} filled={p.on} />
      <Show when={p.item.badge !== undefined}><Badge count={p.item.badge === true ? undefined : (p.item.badge as number)} /></Show>
    </span>
  );
}

/** Bottom tab bar for 3–5 destinations (compact windows). */
export function NavigationBar(props: NavigationBarProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? props.items[0]?.value ?? '', props.onChange);
  return (
    <nav class={cx('aa-navbar', props.class)} style={props.style} aria-label={props.label ?? 'Main'}>
      <For each={props.items}>{(it) => (
        <button type="button" aria-current={it.value === val() ? 'page' : undefined} class={cx('aa-sl aa-navbar-item', it.value === val() && 'is-active')} onClick={() => setVal(it.value)}>
          <NavPill item={it} on={it.value === val()} />{it.label}
        </button>
      )}</For>
    </nav>
  );
}

/** Navigation rail (M3) / collapsible dashboard sidebar (Kumo). */
export function NavigationRail(props: NavigationRailProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? props.items[0]?.value ?? '', props.onChange);
  const [exp, setExp] = createControllable(() => props.expanded, props.defaultExpanded ?? false, props.onExpandedChange);
  const fabColor = KUMO ? 'primary' : 'tertiary-container';
  return (
    <nav class={cx('aa-rail', exp() && 'is-expanded', props.class)} style={props.style} aria-label={props.label ?? 'Main'}>
      <div class="aa-rail-top">
        <IconButton icon={exp() ? 'menu_open' : 'menu'} label={exp() ? 'Collapse' : 'Expand'} onClick={() => setExp(!exp())} />
        <Show when={props.fab}>{(f) => (
          <Show when={exp()} fallback={<FAB color={fabColor} icon={f().icon} label={f().label} onClick={() => f().onClick?.()} />}>
            <ExtendedFAB color={fabColor} icon={f().icon} label={f().label} onClick={() => f().onClick?.()} />
          </Show>
        )}</Show>
      </div>
      <For each={props.items}>{(it) => (
        <button type="button" aria-current={it.value === val() ? 'page' : undefined} title={exp() ? undefined : it.label}
          class={cx('aa-sl aa-rail-item', it.value === val() && 'is-active')} onClick={() => setVal(it.value)}>
          <NavPill item={it} on={it.value === val()} /><span class="l">{it.label}</span>
        </button>
      )}</For>
    </nav>
  );
}

/** Navigation drawer (M3) / the dashboard sidebar (Kumo). Sections get headlines and dividers. */
export function NavigationDrawer(props: NavigationDrawerProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? '', props.onChange);
  const sections = () => props.sections ?? [{ headline: props.headline, items: props.items ?? [] }];
  const body = () => (
    <nav class={cx('aa-drawer', props.modal ? 'is-modal' : 'is-standard', props.class)} style={props.style} aria-label={props.label ?? 'Main'}>
      <For each={sections()}>{(s, si) => (
        <>
          <Show when={si() > 0}><Divider /></Show>
          <Show when={s.headline}><h2 class="aa-drawer-h">{s.headline}</h2></Show>
          <For each={s.items}>{(it) => (
            <button type="button" aria-current={it.value === val() ? 'page' : undefined} class={cx('aa-sl aa-drawer-item', it.value === val() && 'is-active')} onClick={() => setVal(it.value)}>
              {ic(it.icon, it.value === val())}<span class="l">{it.label}</span>{it.badge}
            </button>
          )}</For>
        </>
      )}</For>
    </nav>
  );
  return (
    <Show when={props.modal} fallback={body()}>
      <Overlay open={props.open} inline={props.inline} onClose={props.onClose}><div style={{ 'align-self': 'stretch', 'margin-right': 'auto' }}>{body()}</div></Overlay>
    </Show>
  );
}

/** Primary (underline) or secondary tabs. */
export function Tabs(props: TabsProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? props.items[0]?.value ?? '', props.onChange);
  const sec = () => props.variant === 'secondary';
  return (
    <div role="tablist" class={cx('aa-tabs', 'aa-tabs-' + (props.variant ?? 'primary'), props.class)} style={props.style}>
      <For each={props.items}>{(it) => (
        <button type="button" role="tab" aria-selected={it.value === val()} class={cx('aa-sl aa-tab', it.value === val() && 'is-active', it.icon && !sec() && 'has-icon')} onClick={() => setVal(it.value)}>
          <span class="aa-tab-inner">
            <Show when={it.icon && !sec()}><Icon name={it.icon!} filled={it.value === val()} /></Show>
            {it.label}
            <Show when={it.badge !== undefined}><Badge count={it.badge === true ? undefined : (it.badge as number)} /></Show>
          </span>
        </button>
      )}</For>
    </div>
  );
}

/** Docked or floating toolbar, standard or vibrant, optional FAB. */
export function Toolbar(props: ToolbarProps) {
  const bar = () => (
    <div role="toolbar" aria-label={props.label} style={props.style}
      class={cx('aa-toolbar', 'aa-toolbar-' + (props.variant ?? 'floating'), props.color === 'vibrant' && 'aa-toolbar-vibrant', props.vertical && 'aa-toolbar-vert', props.class)}>
      <Show when={props.items} fallback={props.children}>
        <For each={props.items}>{(it) => <IconButton {...it} />}</For>
      </Show>
    </div>
  );
  return (
    <Show when={props.fab} fallback={bar()}>{(f) => (
      <div class="aa-toolbar-with-fab">{bar()}<FAB color={props.color === 'vibrant' ? 'tertiary-container' : 'primary-container'} icon={f().icon} label={f().label} onClick={() => f().onClick?.()} /></div>
    )}</Show>
  );
}

/** Search bar, or the search view (bar + results) when `results` is given. */
export function Search(props: SearchProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? '', props.onChange);
  const bar = () => (
    <div class={cx('aa-search', !props.results && props.class)} role="search">
      <IconButton icon={props.results ? 'arrow_back' : props.leadingIcon ?? 'search'} label={props.results ? 'Back' : 'Search'} onClick={() => props.onBack?.()} />
      <input type="search" aria-label={props.placeholder ?? 'Search'} placeholder={props.placeholder ?? 'Search'} value={val()} onInput={(e) => setVal(e.currentTarget.value)} />
      <Show when={val() && props.results} fallback={<Show when={props.trailingIcon}><IconButton icon={props.trailingIcon!} label={props.trailingLabel ?? props.trailingIcon!} /></Show>}>
        <IconButton icon="close" label="Clear" onClick={() => setVal('')} />
      </Show>
      <Show when={!props.results && props.shortcut}><span class="aa-kbd" style={{ 'margin-right': '4px' }}>{props.shortcut}</span></Show>
      <Show when={!props.results && props.avatar}><Avatar>{props.avatar}</Avatar></Show>
    </div>
  );
  return (
    <Show when={props.results} fallback={bar()}>
      <div class={cx('aa-searchview', props.class)} style={props.style}>
        {bar()}
        <List><For each={props.results}>{(r) => <ListItem leading="history" {...r} onClick={() => setVal(String(r.headline))} />}</For></List>
      </div>
    </Show>
  );
}
