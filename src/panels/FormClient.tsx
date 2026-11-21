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
    for (const field of formFieldList(form)) if (field.type === 'hidden' && field.fromQuery && params.get(field.fromQuery)) fromQuery[field.name] = params.get(field.fromQuery)!.slice(0, 500);
    setHidden(fromQuery);
    if (preview) return;
    const controller = new AbortController();
    fetch(`${endpoint}?form=${encodeURIComponent(form.id)}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ token?: string }>) : {}))
      .then((data: { token?: string }) => setToken(data.token ?? null))
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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || sending) return;
    const body = new FormData(event.currentTarget);
    body.set(PAGE_FIELD, window.location.pathname);
    setState({ kind: 'sending' });
    try {
      let current = token;
      if (!current) {
        const tokenResponse = (await (await fetch(`${endpoint}?form=${encodeURIComponent(form.id)}`, { cache: 'no-store' })).json()) as { token?: string };
        current = tokenResponse.token ?? '';
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

  const fieldsWithErrors = formFieldList(form).filter((field) => errors[field.name]);

  return (
    <form ref={formRef} className={`cera-form${sending ? ' is-sending' : ''}`} noValidate onSubmit={send} aria-label={form.title} aria-busy={sending || undefined}>
      {preview && <p className="cera-form__notice">Preview: this form can’t be sent from here.</p>}
      {state.kind === 'error' && (
        <div className="cera-form__summary" role="alert" tabIndex={-1} ref={summary}>
          <p>{state.message}</p>
          {fieldsWithErrors.length > 0 && (
            <ul>
              {fieldsWithErrors.map((field) => (
                <li key={field.name}>
                  <a
                    href={`#${idFor(field.name)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(idFor(field.name))?.focus();
                    }}
                  >
                    {errors[field.name]!.startsWith(field.label) ? errors[field.name] : `${field.label}: ${errors[field.name]}`}
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
            {item.fields.map((field) => (
              <Field key={field.name} field={field} id={idFor(field.name)} error={errors[field.name]} hiddenValue={hidden[field.name]} />
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

function Field({ field, id, error, hiddenValue }: { field: FormField; id: string; error?: string; hiddenValue?: string }) {
  if (field.type === 'hidden') return <input type="hidden" name={field.name} value={hiddenValue ?? field.value ?? ''} />;

  const noteId = field.note ? `${id}-note` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [noteId, errorId].filter(Boolean).join(' ') || undefined;
  const aria = { 'aria-required': field.required || undefined, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;
  const labelText = (
    <>
      {field.label}
      {field.required && (
        <span className="cera-form__required" aria-hidden="true">
          {' '}*
        </span>
      )}
    </>
  );
  const labelClass = `cera-form__label${field.hideLabel ? ' cera-visually-hidden' : ''}`;
  const extras: ReactNode = (
    <>
      {field.note && (
        <p className="cera-form__note" id={noteId}>
          {field.note}
        </p>
      )}
      {error && (
        <p className="cera-form__error" id={errorId}>
          {error}
        </p>
      )}
    </>
  );
  const wrap = (children: ReactNode) => <div className={`cera-form__field cera-form__field--${field.type}${error ? ' has-error' : ''}`}>{children}</div>;

  // Groups of choices: a fieldset whose legend is the label.
  if (field.type === 'radio' || field.type === 'button-select' || field.type === 'checkbox') {
    const multiple = field.type === 'checkbox';
    return wrap(
      <fieldset
        className="cera-form__choices"
        {...(!multiple && { role: 'radiogroup' })}
        aria-required={field.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <legend className={labelClass}>
          {labelText}
          {field.required && multiple && <span className="cera-visually-hidden"> (required)</span>}
        </legend>
        {(field.options ?? []).map((option, i) => {
          const optionId = i === 0 ? id : `${id}-${i}`;
          const descId = option.description ? `${optionId}-desc` : undefined;
          return (
            <div key={option.value} className="cera-form__choice">
              <input id={optionId} type={multiple ? 'checkbox' : 'radio'} name={field.name} value={option.value} aria-describedby={descId} />
              <label htmlFor={optionId}>
                <span>{option.label}</span>
                {option.description && <span id={descId} className="cera-form__choice-desc">{option.description}</span>}
              </label>
            </div>
          );
        })}
        {extras}
      </fieldset>,
    );
  }

  if (field.type === 'binary') {
    return wrap(
      <>
        <div className="cera-form__choice">
          <input id={id} type="checkbox" name={field.name} value="yes" {...aria} />
          <label htmlFor={id} className={field.hideLabel ? 'cera-visually-hidden' : undefined}>
            {labelText}
          </label>
        </div>
        {extras}
      </>,
    );
  }

  if (field.type === 'toggle') return wrap(<Toggle field={field} id={id} aria={aria} label={labelText} labelClass={labelClass} extras={extras} />);

  if (field.type === 'range') return wrap(<Range field={field} id={id} aria={aria} label={labelText} labelClass={labelClass} extras={extras} />);

  const input =
    field.type === 'textarea' ? (
      <textarea id={id} name={field.name} rows={5} maxLength={10_000} {...aria} />
    ) : field.type === 'select' ? (
      <select id={id} name={field.name} defaultValue="" {...aria}>
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        name={field.name}
        type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
        autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.autocomplete}
        maxLength={field.type === 'email' ? 254 : field.type === 'phone' ? 40 : 500}
        {...(field.type === 'email' && { spellCheck: false, autoCapitalize: 'off' })}
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
function Toggle({ field, id, aria, label, labelClass, extras }: FieldPartProps) {
  const [on, setOn] = useState(false);
  const stateId = `${id}-state`;
  return (
    <>
      <div className="cera-form__toggle">
        <input
          id={id}
          type="checkbox"
          role="switch"
          name={field.name}
          value="on"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          {...aria}
          aria-describedby={[stateId, aria['aria-describedby']].filter(Boolean).join(' ')}
        />
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span id={stateId} className="cera-form__toggle-state">
          {on ? field.onLabel : field.offLabel}
        </span>
      </div>
      {extras}
    </>
  );
}

/** A slider that starts at its minimum and shows its value. */
function Range({ field, id, aria, label, labelClass, extras }: FieldPartProps) {
  const [value, setValue] = useState(field.min ?? 0);
  return (
    <>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="cera-form__range">
        <input id={id} type="range" name={field.name} min={field.min} max={field.max} step={field.step} value={value} onChange={(event) => setValue(Number(event.target.value))} {...aria} />
        <output htmlFor={id} aria-live="off">
          {value}
        </output>
      </div>
      {extras}
    </>
  );
}
