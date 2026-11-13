import { For, Index, Show, createSignal, createEffect } from 'solid-js';
import { cx, ic, Icon, Avatar, createControllable, pad2 } from '../core/util';
import { KUMO } from '../core/edition';
import { Button, IconButton } from './actions';
import { Divider } from './containment';
import type { CheckboxProps, RadioButtonProps, SwitchProps, ChipProps, MenuProps, MenuItem, SliderProps, DatePickerProps, TimePickerProps, Time } from '../types';

export function Checkbox(props: CheckboxProps) {
  const [chk, setChk] = createControllable(() => props.checked, props.defaultChecked ?? false, props.onChange);
  let input!: HTMLInputElement;
  createEffect(() => { input.indeterminate = !!props.indeterminate; });
  const box = () => (
    <span class={cx('aa-sl aa-touch', (chk() || props.indeterminate) && 'is-on', props.error && 'is-error', props.disabled && 'is-disabled')}>
      <input ref={input} type="checkbox" checked={chk()} disabled={props.disabled} aria-invalid={props.error || undefined} aria-label={props.label ? undefined : props['aria-label']} onChange={(e) => setChk(e.currentTarget.checked)} />
      <span class="aa-check-box">{props.indeterminate ? <Icon name="remove" /> : chk() ? <Icon name="check" /> : null}</span>
    </span>
  );
  return <Show when={props.label} fallback={box()}><label class={cx('aa-check-row', props.disabled && 'is-disabled', props.class)} style={props.style}>{box()}{props.label}</label></Show>;
}

/** One radio. Group several with the same `name` and drive `checked` from one value. */
export function RadioButton(props: RadioButtonProps) {
  const box = () => (
    <span class={cx('aa-sl aa-touch', props.checked && 'is-on', props.disabled && 'is-disabled')}>
      <input type="radio" name={props.name} value={props.value ?? ''} checked={!!props.checked} disabled={props.disabled} aria-label={props.label ? undefined : props['aria-label']} onChange={() => props.onChange?.(props.value)} />
      <span class="aa-radio" />
    </span>
  );
  return <Show when={props.label} fallback={box()}><label class={cx('aa-check-row', props.disabled && 'is-disabled', props.class)} style={props.style}>{box()}{props.label}</label></Show>;
}

export function Switch(props: SwitchProps) {
  const [chk, setChk] = createControllable(() => props.checked, props.defaultChecked ?? false, props.onChange);
  const sw = () => (
    <span class={cx('aa-switch', chk() && 'is-on', props.icons && 'has-icons', props.disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={chk()} disabled={props.disabled} aria-label={props.label ? undefined : props['aria-label']} onChange={(e) => setChk(e.currentTarget.checked)} />
      <span class="aa-switch-handle"><Show when={props.icons}><Icon name={chk() ? 'check' : 'close'} /></Show></span>
    </span>
  );
  return <Show when={props.label} fallback={sw()}><label class={cx('aa-switch-row', props.class)} style={props.style}>{props.label}{sw()}</label></Show>;
}

/** Assist, filter (toggle), input (removable) or suggestion chip. */
export function Chip(props: ChipProps) {
  const v = () => props.variant ?? 'assist';
  const [sel, setSel] = createControllable(() => props.selected, props.defaultSelected ?? false, props.onSelectedChange);
  const on = () => v() === 'filter' && sel();
  const lead = () => (v() === 'filter' ? (on() ? 'check' : props.icon) : props.icon);
  return (
    <button type="button" disabled={props.disabled} aria-pressed={v() === 'filter' ? on() : undefined} style={props.style}
      class={cx('aa-sl aa-chip', 'aa-chip-' + v(), (lead() || props.avatar) && 'has-lead', (props.onRemove || (v() === 'filter' && props.dropdown)) && 'has-trail',
        props.elevated && 'is-elevated', (on() || (v() === 'input' && props.selected)) && 'is-selected', props.class)}
      onClick={(e) => { if (v() === 'filter') setSel(!sel()); props.onClick?.(e); }}>
      {props.avatar ? <Avatar>{props.avatar}</Avatar> : ic(lead())}
      {props.label}
      <Show when={v() === 'filter' && props.dropdown}><Icon name="arrow_drop_down" /></Show>
      <Show when={props.onRemove}>
        <span class="aa-chip-x" role="button" aria-label={'Remove ' + props.label} onClick={(e) => { e.stopPropagation(); props.onRemove?.(); }}><Icon name="close" /></span>
      </Show>
    </button>
  );
}

/** Menu / dropdown of actions or checkable choices. */
export function Menu(props: MenuProps) {
  return (
    <Show when={props.open !== false}>
      <div role="menu" class={cx('aa-menu', props.class)} style={props.style}>
        <For each={props.items}>{(entry) => {
          if ('divider' in entry) return <Divider />;
          const it = entry as MenuItem;
          return (
            <button type="button" role={it.selected !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.selected} disabled={it.disabled}
              class={cx('aa-sl aa-menu-item', it.selected && 'is-selected')} onClick={() => { it.onClick?.(); props.onSelect?.(it); }}>
              {it.selected ? <Icon name="check" /> : ic(it.icon)}
              <span class="l">{it.label}</span>
              <Show when={it.shortcut}><span class="k">{it.shortcut}</span></Show>
              {ic(it.trailingIcon)}
            </button>
          );
        }}</For>
      </div>
    </Show>
  );
}

/** Continuous or discrete slider. A native range input sits on top for keyboard and pointer input. */
export function Slider(props: SliderProps) {
  const min = () => props.min ?? 0, max = () => props.max ?? 100, step = () => props.step ?? 1;
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? props.min ?? 0, props.onChange);
  const pct = () => ((val() - min()) / (max() - min())) * 100;
  const gap = KUMO ? 0 : 6;
  const stops = () => {
    if (!props.discrete) return [];
    const out: { v: number; p: number }[] = [];
    for (let s = min(); s <= max(); s += step()) { const p = ((s - min()) / (max() - min())) * 100; if (Math.abs(p - pct()) > 2) out.push({ v: s, p }); }
    return out;
  };
  return (
    <div class={cx('aa-slider', props.disabled && 'is-disabled', props.showValue && 'show-val', props.class)} style={props.style}>
      <Show when={pct() > 0}><span class="aa-slider-a" style={{ left: 0, width: 'max(0px, calc(' + pct() + '% - ' + gap + 'px))' }} /></Show>
      <Show when={pct() < 100}><span class="aa-slider-t" style={{ right: 0, width: 'max(0px, calc(' + (100 - pct()) + '% - ' + gap + 'px))' }} /></Show>
      <For each={stops()}>{(s) => <span class={cx('aa-slider-dot', s.p < pct() && 'on')} style={{ left: s.p + '%' }} />}</For>
      <span class="aa-slider-h" style={{ left: pct() + '%' }} />
      <Show when={props.discrete !== false}><span class="aa-slider-val" style={{ left: pct() + '%' }}>{props.format ? props.format(val()) : val()}</span></Show>
      <input type="range" min={min()} max={max()} step={step()} value={val()} disabled={props.disabled} aria-label={props.label} onInput={(e) => setVal(Number(e.currentTarget.value))} />
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Calendar date picker: modal (with summary header) or docked. */
export function DatePicker(props: DatePickerProps) {
  const [sel, setSel] = createControllable<Date>(() => props.value, props.defaultValue ?? new Date(), props.onChange);
  const [view, setView] = createSignal({ y: sel().getFullYear(), m: sel().getMonth() });
  const today = () => props.today ?? new Date();
  const cells = () => {
    const first = new Date(view().y, view().m, 1).getDay(), days = new Date(view().y, view().m + 1, 0).getDate();
    const c: (number | null)[] = []; for (let i = 0; i < first; i++) c.push(null); for (let d = 1; d <= days; d++) c.push(d); return c;
  };
  const same = (a: Date | undefined, d: number) => !!a && a.getFullYear() === view().y && a.getMonth() === view().m && a.getDate() === d;
  const move = (n: number) => { const m = view().m + n; setView({ y: view().y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }); };
  const modal = () => props.variant !== 'docked';
  return (
    <div class={cx('aa-dp', !modal() && 'aa-dp-docked', props.class)} style={props.style} role="dialog" aria-label={props.headline ?? 'Select date'}>
      <Show when={modal()}>
        <div class="aa-dp-head">
          <div class="s">{props.headline ?? 'Select date'}</div>
          <div class="d">{sel().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}<IconButton icon={KUMO ? 'edit_calendar' : 'edit'} label="Switch to input" /></div>
        </div>
      </Show>
      <div class="aa-dp-nav">
        <button type="button" class="aa-sl m">{MONTHS[view().m] + ' ' + view().y}<Icon name="arrow_drop_down" /></button>
        <span><IconButton icon="chevron_left" label="Previous month" onClick={() => move(-1)} /><IconButton icon="chevron_right" label="Next month" onClick={() => move(1)} /></span>
      </div>
      <div class="aa-dp-grid" role="grid">
        <For each={['S', 'M', 'T', 'W', 'T', 'F', 'S']}>{(w) => <span class="aa-dp-wd">{w}</span>}</For>
        <For each={cells()}>{(c) => (
          <Show when={c} fallback={<span class="aa-dp-day is-out" />}>
            <button type="button" aria-pressed={same(sel(), c!)} class={cx('aa-sl aa-dp-day', same(today(), c!) && 'is-today', same(sel(), c!) && 'is-sel')} onClick={() => setSel(new Date(view().y, view().m, c!))}>{c}</button>
          </Show>
        )}</For>
      </div>
      <div class="aa-dp-actions">
        <Button variant={KUMO ? 'ghost' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onCancel?.()}>Cancel</Button>
        <Button variant={KUMO ? 'primary' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onConfirm?.(sel())}>{KUMO ? 'Apply' : 'OK'}</Button>
      </div>
    </div>
  );
}

/** Time picker with a clock dial or typed input; the corner button switches between them. */
export function TimePicker(props: TimePickerProps) {
  const [t, setT] = createControllable<Time>(() => props.value, props.defaultValue ?? { hour: 7, minute: 0 }, props.onChange);
  const [variant, setVariant] = createControllable(() => props.variant, props.defaultVariant ?? 'dial', props.onVariantChange);
  const [mode, setMode] = createSignal<'hour' | 'minute'>('hour');
  const pm = () => t().hour >= 12;
  const h12 = () => (t().hour % 12 === 0 ? 12 : t().hour % 12);
  const input = () => variant() === 'input';
  const set = (o: Partial<Time>) => setT({ ...t(), ...o });
  // dial geometry: one source of truth for numbers, hand and knob
  const SIZE = KUMO ? 224 : 256, C = SIZE / 2, R = KUMO ? 84 : 100;
  const nums = () => (mode() === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  const pos = () => (mode() === 'hour' ? h12() % 12 : t().minute / 5);
  const rad = () => (pos() / 12) * 2 * Math.PI - Math.PI / 2;
  const snapped = () => mode() === 'hour' || t().minute % 5 === 0;

  const Field = (fp: { which: 'hour' | 'minute' }) => {
    const value = () => (fp.which === 'hour' ? h12() : t().minute);
    const label = fp.which === 'hour' ? 'Hour' : 'Minute';
    return (
      <Show when={input()} fallback={
        <button type="button" aria-label={label} aria-pressed={mode() === fp.which} class={cx('aa-sl aa-tp-box', mode() === fp.which && 'is-active')} onClick={() => setMode(fp.which)}>{pad2(value())}</button>
      }>
        <input class={cx('aa-tp-box', mode() === fp.which && 'is-active')} inputmode="numeric" maxLength={2} aria-label={label} value={pad2(value())}
          onFocus={(e) => { setMode(fp.which); e.currentTarget.select(); }}
          onInput={(e) => {
            let n = parseInt(e.currentTarget.value.replace(/\D/g, '').slice(-2), 10); if (isNaN(n)) return;
            if (fp.which === 'hour') { n = Math.min(12, Math.max(1, n)); set({ hour: (n % 12) + (pm() ? 12 : 0) }); } else set({ minute: Math.min(59, n) });
          }} />
      </Show>
    );
  };

  return (
    <div class={cx('aa-tp', props.class)} style={props.style} role="dialog" aria-label={props.headline ?? 'Select time'}>
      <div class="aa-tp-h">{props.headline ?? (input() ? 'Enter time' : 'Select time')}</div>
      <div class="aa-tp-row">
        <Field which="hour" /><span class="aa-tp-colon">:</span><Field which="minute" />
        <div class="aa-tp-ampm" role="radiogroup" aria-label="AM or PM">
          <button type="button" role="radio" aria-checked={!pm()} class={cx('aa-sl', !pm() && 'is-on')} onClick={() => { if (pm()) set({ hour: t().hour - 12 }); }}>AM</button>
          <button type="button" role="radio" aria-checked={pm()} class={cx('aa-sl', pm() && 'is-on')} onClick={() => { if (!pm()) set({ hour: t().hour + 12 }); }}>PM</button>
        </div>
      </div>
      <Show when={input()}><div class="aa-tp-sub"><span>Hour</span><span>Minute</span></div></Show>
      <Show when={!input()}>
        <div class="aa-tp-dial" style={{ width: SIZE + 'px', height: SIZE + 'px' }}>
          <span class="aa-tp-hand" style={{ left: C + 'px', top: C + 'px', width: R + 'px', transform: 'rotate(' + (rad() * 180) / Math.PI + 'deg)' }} />
          <span class="aa-tp-knob" style={{ left: C + R * Math.cos(rad()) + 'px', top: C + R * Math.sin(rad()) + 'px', opacity: snapped() ? 1 : 0.9 }} />
          <span class="aa-tp-center" style={{ left: C + 'px', top: C + 'px' }} />
          {/* <Index>, not <For>: a slot keeps its clock position while its label changes (5 and 10 exist as both hours and minutes). */}
          <Index each={nums()}>{(n, i) => {
            const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
            const on = () => snapped() && i === pos();
            return (
              <button type="button" aria-label={mode() === 'hour' ? n() + " o'clock" : pad2(n()) + ' minutes'} aria-pressed={on()} class={cx('aa-sl aa-tp-num', on() && 'is-on')}
                style={{ left: C + R * Math.cos(a) + 'px', top: C + R * Math.sin(a) + 'px' }}
                onClick={() => { if (mode() === 'hour') { set({ hour: (n() % 12) + (pm() ? 12 : 0) }); setMode('minute'); } else set({ minute: n() }); }}>
                {mode() === 'hour' ? n() : pad2(n())}
              </button>
            );
          }}</Index>
        </div>
      </Show>
      <div class="aa-tp-foot">
        <IconButton icon={input() ? 'schedule' : 'keyboard'} label={input() ? 'Switch to dial' : 'Switch to text input'} onClick={() => { setVariant(input() ? 'dial' : 'input'); props.onToggleMode?.(); }} />
        <span class="sp" />
        <Button variant={KUMO ? 'ghost' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onCancel?.()}>Cancel</Button>
        <Button variant={KUMO ? 'primary' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onConfirm?.(t())}>{KUMO ? 'Apply' : 'OK'}</Button>
      </div>
    </div>
  );
}
