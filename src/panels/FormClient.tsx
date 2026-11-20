'use client';
/**
 * A form as visitors use it. The server checks everything (checkSubmission);
 * this only sends the form and shows the answer.
 *
 * Accessibility, as in the theme: labels above fields; required fields marked
 * with aria-required and a visible asterisk; after a failed send, a summary
 * (role=alert) linking to each field with a problem, and each field gets
 * aria-invalid and its message via aria-describedby; once sent, the thank-you
 * message replaces the form and takes focus. Hidden labels stay readable by
 * screen readers.
 *
 * Spam: a honeypot field people never see, and a token fetched when the form
 * appears, which the server needs to be a few seconds old.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FORM_ID_FIELD, HONEYPOT_FIELD, PAGE_FIELD, TOKEN_FIELD, formFieldList, type FormField, type FormResponse, type PublicForm } from '../forms/model.ts';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string; errors: Record<string, string> };

export function FormClient({ form, endpoint, preview = false }: { form: PublicForm; endpoint: string; preview?: boolean }) {
  const uid = useId();
  const idFor = (name: string) => `${uid}-${name}`;
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [token, setToken] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null);
  const thanks = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // A token as the form appears (the server wants it a few seconds old), and
  // hidden fields filled from the address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery: Record<string, string> = {};
    for (const f of formFieldList(form)) if (f.type === 'hidden' && f.fromQuery && params.get(f.fromQuery)) fromQuery[f.name] = params.get(f.fromQuery)!.slice(0, 500);
    setHidden(fromQuery);
    if (preview) return;
    const controller = new AbortController();
    fetch(`${endpoint}?form=${encodeURIComponent(form.id)}`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ token?: string }>) : {}))
      .then((r: { token?: string }) => setToken(r.token ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [endpoint, form, preview]);

  useEffect(() => {
    if (state.kind === 'error') summary.current?.focus();
    if (state.kind === 'sent') thanks.current?.focus();
  }, [state]);

  if (state.kind === 'sent') {
    return (
      <div className="cera-form__thanks" role="status" tabIndex={-1} ref={thanks} dangerouslySetInnerHTML={{ __html: form.thankYouText }} />
    );
  }

  const errors = state.kind === 'error' ? state.errors : {};
  const sending = state.kind === 'sending';

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview || sending) return;
    const body = new FormData(e.currentTarget);
    body.set(PAGE_FIELD, window.location.pathname);
    setState({ kind: 'sending' });
    try {
      let current = token;
      if (!current) {
        const r = (await (await fetch(`${endpoint}?form=${encodeURIComponent(form.id)}`, { cache: 'no-store' })).json()) as { token?: string };
        current = r.token ?? '';
        setToken(current);
      }
      body.set(TOKEN_FIELD, current);
      const res = await fetch(endpoint, { method: 'POST', body, headers: { Accept: 'application/json' } });
      const result = (await res.json()) as FormResponse;
      if (result.ok) {
        if (form.thankYouRedirect) window.location.assign(form.thankYouRedirect);
        else setState({ kind: 'sent' });
        return;
      }
      if (result.reason !== 'invalid' && result.token) setToken(result.token);
      setState({ kind: 'error', message: result.message, errors: result.reason === 'invalid' ? result.errors : {} });
    } catch {
      setState({ kind: 'error', message: 'Sorry, the form couldn’t be sent. Check your connection and try again.', errors: {} });
    }
  }

  const fieldsWithErrors = formFieldList(form).filter((f) => errors[f.name]);

  return (
    <form ref={formRef} className={`cera-form${sending ? ' is-sending' : ''}`} noValidate onSubmit={send} aria-label={form.title} aria-busy={sending || undefined}>
      {preview && <p className="cera-form__notice">Preview: this form can’t be sent from here.</p>}
      {state.kind === 'error' && (
        <div className="cera-form__summary" role="alert" tabIndex={-1} ref={summary}>
          <p>{state.message}</p>
          {fieldsWithErrors.length > 0 && (
            <ul>
              {fieldsWithErrors.map((f) => (
                <li key={f.name}>
                  <a
                    href={`#${idFor(f.name)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(idFor(f.name))?.focus();
                    }}
                  >
                    {errors[f.name]!.startsWith(f.label) ? errors[f.name] : `${f.label}: ${errors[f.name]}`}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input type="hidden" name={FORM_ID_FIELD} value={form.id} />
      {/* People never see or fill this; bots that fill every field get a polite fake success. */}
      <div className="cera-form__hp" aria-hidden="true">
        <label>
          Leave this field empty
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {form.items.map((item, i) =>
        item.type === 'section' ? (
          <fieldset key={`section-${i}`} className="cera-form__section">
            <legend>{item.legend}</legend>
            {item.note && <p className="cera-form__note">{item.note}</p>}
            {item.fields.map((f) => (
              <Field key={f.name} field={f} id={idFor(f.name)} error={errors[f.name]} hiddenValue={hidden[f.name]} />
            ))}
          </fieldset>
        ) : (
          <Field key={item.name} field={item} id={idFor(item.name)} error={errors[item.name]} hiddenValue={hidden[item.name]} />
        ),
      )}

      {form.privacyNote && <div className="cera-form__privacy" dangerouslySetInnerHTML={{ __html: form.privacyNote }} />}
      <div className="cera-form__actions">
        <button type="submit" className="cera-form__submit" disabled={preview} aria-disabled={sending || undefined}>
          {sending ? 'Sending…' : form.submitText}
        </button>
      </div>
    </form>
  );
}

function Field({ field: f, id, error, hiddenValue }: { field: FormField; id: string; error?: string; hiddenValue?: string }) {
  if (f.type === 'hidden') return <input type="hidden" name={f.name} value={hiddenValue ?? f.value ?? ''} />;

  const noteId = f.note ? `${id}-note` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [noteId, errorId].filter(Boolean).join(' ') || undefined;
  const aria = { 'aria-required': f.required || undefined, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;
  const labelText = (
    <>
      {f.label}
      {f.required && (
        <span className="cera-form__required" aria-hidden="true">
          {' '}*
        </span>
      )}
    </>
  );
  const labelClass = `cera-form__label${f.hideLabel ? ' cera-visually-hidden' : ''}`;
  const extras: ReactNode = (
    <>
      {f.note && (
        <p className="cera-form__note" id={noteId}>
          {f.note}
        </p>
      )}
      {error && (
        <p className="cera-form__error" id={errorId}>
          {error}
        </p>
      )}
    </>
  );
  const wrap = (children: ReactNode) => <div className={`cera-form__field cera-form__field--${f.type}${error ? ' has-error' : ''}`}>{children}</div>;

  // Groups of choices: a fieldset whose legend is the label.
  if (f.type === 'radio' || f.type === 'button-select' || f.type === 'checkbox') {
    const multiple = f.type === 'checkbox';
    return wrap(
      <fieldset
        className="cera-form__choices"
        {...(!multiple && { role: 'radiogroup' })}
        aria-required={f.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <legend className={labelClass}>
          {labelText}
          {f.required && multiple && <span className="cera-visually-hidden"> (required)</span>}
        </legend>
        {(f.options ?? []).map((o, i) => {
          const optionId = i === 0 ? id : `${id}-${i}`;
          const descId = o.description ? `${optionId}-desc` : undefined;
          return (
            <div key={o.value} className="cera-form__choice">
              <input id={optionId} type={multiple ? 'checkbox' : 'radio'} name={f.name} value={o.value} aria-describedby={descId} />
              <label htmlFor={optionId}>
                <span>{o.label}</span>
                {o.description && <span id={descId} className="cera-form__choice-desc">{o.description}</span>}
              </label>
            </div>
          );
        })}
        {extras}
      </fieldset>,
    );
  }

  if (f.type === 'binary') {
    return wrap(
      <>
        <div className="cera-form__choice">
          <input id={id} type="checkbox" name={f.name} value="yes" {...aria} />
          <label htmlFor={id} className={f.hideLabel ? 'cera-visually-hidden' : undefined}>
            {labelText}
          </label>
        </div>
        {extras}
      </>,
    );
  }

  if (f.type === 'toggle') return wrap(<Toggle field={f} id={id} aria={aria} label={labelText} labelClass={labelClass} extras={extras} />);

  if (f.type === 'range') return wrap(<Range field={f} id={id} aria={aria} label={labelText} labelClass={labelClass} extras={extras} />);

  const input =
    f.type === 'textarea' ? (
      <textarea id={id} name={f.name} rows={5} maxLength={10_000} {...aria} />
    ) : f.type === 'select' ? (
      <select id={id} name={f.name} defaultValue="" {...aria}>
        <option value="">Select…</option>
        {(f.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        name={f.name}
        type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
        autoComplete={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.autocomplete}
        maxLength={f.type === 'email' ? 254 : f.type === 'phone' ? 40 : 500}
        {...(f.type === 'email' && { spellCheck: false, autoCapitalize: 'off' })}
        {...aria}
      />
    );
  return wrap(
    <>
      <label htmlFor={id} className={labelClass}>
        {labelText}
      </label>
      {input}
      {extras}
    </>,
  );
}

type FieldPartProps = { field: FormField; id: string; aria: Record<string, unknown>; label: ReactNode; labelClass: string; extras: ReactNode };

/** An on/off switch: sends "on" when on and nothing when off. Its answers are read out as its description. */
function Toggle({ field: f, id, aria, label, labelClass, extras }: FieldPartProps) {
  const [on, setOn] = useState(false);
  const stateId = `${id}-state`;
  return (
    <>
      <div className="cera-form__toggle">
        <input
          id={id}
          type="checkbox"
          role="switch"
          name={f.name}
          value="on"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          {...aria}
          aria-describedby={[stateId, aria['aria-describedby']].filter(Boolean).join(' ')}
        />
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span id={stateId} className="cera-form__toggle-state">
          {on ? f.onLabel : f.offLabel}
        </span>
      </div>
      {extras}
    </>
  );
}

/** A slider that starts at its minimum and shows its value. */
function Range({ field: f, id, aria, label, labelClass, extras }: FieldPartProps) {
  const [value, setValue] = useState(f.min ?? 0);
  return (
    <>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="cera-form__range">
        <input id={id} type="range" name={f.name} min={f.min} max={f.max} step={f.step} value={value} onChange={(e) => setValue(Number(e.target.value))} {...aria} />
        <output htmlFor={id} aria-live="off">
          {value}
        </output>
      </div>
      {extras}
    </>
  );
}
