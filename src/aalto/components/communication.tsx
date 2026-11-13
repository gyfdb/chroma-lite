import { Show, onCleanup, onMount } from 'solid-js';
import { cx, Icon } from '../core/util';
import { KUMO } from '../core/edition';
import { Button, IconButton } from './actions';
import type { BadgeProps, LoadingIndicatorProps, ProgressIndicatorProps, SnackbarProps, TooltipProps } from '../types';

/** Count badge or "new" dot; wrap an icon to anchor it. */
export function Badge(props: BadgeProps) {
  const text = () => (props.count === undefined ? null : props.count > (props.max ?? 999) ? (props.max ?? 999) + '+' : String(props.count));
  const b = () => <span class={cx('aa-badge', props.count === undefined && 'aa-badge-dot')} aria-label={props.label}>{text()}</span>;
  return (
    <Show when={props.children} fallback={b()}>
      <span class={cx('aa-badge-anchor', props.class)} style={props.style}>{props.children}{b()}</span>
    </Show>
  );
}

/* M3 Expressive loader: polar "cookie" shapes morphing on rAF. */
const SHAPES: [number, number][] = [[7, 0.1], [4, 0.18], [9, 0.07], [5, 0.16], [3, 0.14], [8, 0.09]];
function shapePath(a: [number, number], b: [number, number], t: number, rot: number) {
  const N = 96, R = 17; let d = '';
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const ra = (R * (1 + a[1] * Math.cos(a[0] * th))) / (1 + a[1]);
    const rb = (R * (1 + b[1] * Math.cos(b[0] * th))) / (1 + b[1]);
    const r = ra + (rb - ra) * t, q = th + rot;
    d += (i ? 'L' : 'M') + (19 + r * Math.cos(q)).toFixed(2) + ' ' + (19 + r * Math.sin(q)).toFixed(2);
  }
  return d + 'Z';
}

/** Indeterminate loader: shape-morphing (M3) or a spinner (Kumo). */
export function LoadingIndicator(props: LoadingIndicatorProps) {
  if (KUMO) {
    return (
      <span class={cx('aa-loading', props.contained && 'is-contained', props.class)} role="progressbar" aria-label={props.label ?? 'Loading'} style={props.size ? { width: props.size + 'px', height: props.size + 'px' } : undefined}>
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="2.5" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
      </span>
    );
  }
  let path!: SVGPathElement;
  onMount(() => {
    let raf = 0; const start = performance.now();
    const slow = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const el = Math.max(0, now - start) / (slow ? 2600 : 650), i = Math.floor(el), f = el - i;
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      path.setAttribute('d', shapePath(SHAPES[i % SHAPES.length], SHAPES[(i + 1) % SHAPES.length], e, el * 0.9));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });
  return (
    <span class={cx('aa-loading', props.contained && 'is-contained', props.class)} role="progressbar" aria-label={props.label ?? 'Loading'}>
      <svg viewBox="0 0 38 38"><path ref={path} d={shapePath(SHAPES[0], SHAPES[0], 0, 0)} /></svg>
    </span>
  );
}

function wave(w: number, amp: number, len: number) {
  let d = 'M0 5';
  for (let x = 0; x <= w; x += 2) d += 'L' + x + ' ' + (5 + amp * Math.sin((x / len) * Math.PI * 2)).toFixed(2);
  return d;
}

/** Determinate (0–1) or indeterminate progress, linear or circular. */
export function ProgressIndicator(props: ProgressIndicatorProps) {
  const indet = () => props.value === undefined || props.value === null;
  const pct = () => Math.max(0, Math.min(1, props.value ?? 0)) * 100;
  const aria = () => ({ role: 'progressbar' as const, 'aria-label': props.label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': indet() ? undefined : Math.round(pct()) });
  const C = 2 * Math.PI * 20;
  if ((props.type ?? 'linear') === 'circular') {
    return (
      <span class={cx('aa-cprog', indet() && 'is-indet', props.class)} {...aria()}>
        <svg viewBox="0 0 48 48">
          <circle class="t" cx="24" cy="24" r="20" fill="none" stroke-width="4" />
          <circle class="a" cx="24" cy="24" r="20" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray={(indet() ? C * 0.3 : (C * pct()) / 100) + ' ' + C} />
        </svg>
      </span>
    );
  }
  return (
    <Show when={!indet()} fallback={<div class={cx('aa-lprog is-indet', props.class)} {...aria()}><span class="aa-lprog-t" /><span class="aa-lprog-a" /></div>}>
      <div class={cx('aa-lprog', props.wavy && 'is-wavy', props.class)} style={props.style} {...aria()}>
        <Show when={pct() > 0}>
          <span class="aa-lprog-a" style={{ width: KUMO ? pct() + '%' : 'calc(' + pct() + '% - 2px)' }}>
            <Show when={props.wavy && !KUMO}>
              <svg preserveAspectRatio="none" viewBox="0 0 400 10"><path d={wave(400, 3, 40)} fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" /></svg>
            </Show>
          </span>
        </Show>
        <Show when={pct() < 100}><span class="aa-lprog-t" /><span class="aa-lprog-stop" /></Show>
      </div>
    </Show>
  );
}

/** Brief feedback (M3 snackbar / Kumo toast). */
export function Snackbar(props: SnackbarProps) {
  return (
    <div role="status" class={cx('aa-snack', props.multiline && 'is-multi', props.class)} style={props.style}>
      <span class="aa-snack-msg">{props.message}</span>
      <Show when={props.action}>
        <span class="aa-snack-act"><Button variant={KUMO ? 'secondary' : 'text'} size={KUMO ? 's' : undefined} onClick={() => props.onAction?.()}>{props.action}</Button></span>
      </Show>
      <Show when={props.onClose}><IconButton icon="close" label="Dismiss" size="xs" onClick={() => props.onClose?.()} /></Show>
    </div>
  );
}

/** Plain or rich tooltip around a trigger; shows on hover/focus, or always with `open`. */
export function Tooltip(props: TooltipProps) {
  const rich = () => !!(props.title || props.action || props.variant === 'rich');
  return (
    <span class={cx('aa-tip-wrap', props.open && 'is-open', props.class)} style={props.style}>
      {props.children}
      <span role="tooltip" class={cx('aa-tip', rich() && 'aa-tip-rich')}>
        <Show when={rich() && props.title}><div class="t">{props.title}</div></Show>
        {props.text}
        <Show when={rich() && props.action}>
          <div><Button variant={KUMO ? 'secondary' : 'text'} size={KUMO ? 'xs' : undefined} onClick={() => props.onAction?.()}>{props.action}</Button></div>
        </Show>
      </span>
    </span>
  );
}

export { Icon };
