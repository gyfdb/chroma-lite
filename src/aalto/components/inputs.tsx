import { Show, createSignal, createUniqueId } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cx, ic, Icon, createControllable } from '../core/util';
import { KUMO } from '../core/edition';
import type { TextFieldProps } from '../types';

/** Text input: M3 filled/outlined with a floating label, or Kumo outlined/filled with the label on top. */
export function TextField(props: TextFieldProps) {
  const [val, setVal] = createControllable(() => props.value, props.defaultValue ?? '', props.onChange);
  const [focused, setFocused] = createSignal(false);
  const id = 'aa-tf-' + createUniqueId();
  const v = () => props.variant ?? (KUMO ? 'outlined' : 'filled');
  const floating = () => !!val() || focused() || !props.label;

  const field = () => (
    <Dynamic component={props.multiline ? 'textarea' : 'input'} id={id} value={val()}
      type={props.multiline ? undefined : props.type ?? 'text'} rows={props.multiline ? props.rows ?? 3 : undefined}
      placeholder={KUMO || floating() ? props.placeholder : undefined} disabled={props.disabled} required={props.required} maxLength={props.maxLength}
      aria-invalid={props.error || undefined} aria-describedby={props.supporting ? id + '-s' : undefined}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) => setVal(e.currentTarget.value)} />
  );
  const trail = () => (props.error && !props.trailingIcon
    ? <span class="aa-tf-trail" style={{ display: 'inline-flex' }}><Icon name="error" filled={!KUMO} /></span>
    : <Show when={props.trailingIcon}><span class="aa-tf-trail" style={{ display: 'inline-flex' }}>{ic(props.trailingIcon)}</span></Show>);
  const sup = () => (
    <Show when={props.supporting || props.maxLength}>
      <div class="aa-tf-sup" id={id + '-s'}><span>{props.supporting}</span><Show when={props.maxLength}><span>{(val() ?? '').length + '/' + props.maxLength}</span></Show></div>
    </Show>
  );

  return (
    <div style={props.style} class={cx('aa-tf', 'aa-tf-' + v(), !KUMO && floating() && 'is-floating', !KUMO && focused() && 'is-focused', !KUMO && !val() && 'is-empty',
      props.error && 'is-error', props.disabled && 'is-disabled', !KUMO && props.leadingIcon && 'has-lead', !KUMO && props.trailingIcon && 'has-trail', props.class)}>
      <Show when={KUMO && props.label}>
        <label class="aa-tf-top" for={id}>{props.label}<Show when={props.required}><span style={{ color: 'var(--text-danger)' }}> *</span></Show></label>
      </Show>
      <div class="aa-tf-box">
        {ic(props.leadingIcon)}
        <div class="aa-tf-field">
          <Show when={!KUMO && props.label}><label class="aa-tf-label" for={id}>{props.label}{props.required ? ' *' : ''}</label></Show>
          <div class="aa-tf-in">
            <Show when={props.prefix}><span class="aa-tf-prefix">{props.prefix}</span></Show>
            {field()}
            <Show when={props.suffix}><span class="aa-tf-suffix">{props.suffix}</span></Show>
          </div>
        </div>
        {trail()}
      </div>
      {sup()}
    </div>
  );
}
