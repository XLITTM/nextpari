import { useState, type FormEvent } from 'react';
import type { FormSpec } from '../access/model';
import { submitForm } from '../api/operations';
import type { Acceptance } from '../api/parsers';
import type { FailureReason } from '../api/http';
import { trimmedValues, validateFields } from '../forms/validate';
import { fixedRoleLabel } from '../nav/catalog';
import { StatusBanner } from './Status';

export function OfficeForm({ form }: { form: FormSpec }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureReason | null>(null);
  const [acceptance, setAcceptance] = useState<Acceptance | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAcceptance(null);
    const nextErrors = validateFields(form.fields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFailure(null);
      return;
    }
    setPending(true);
    const result = await submitForm(form, { ...form.fixed, ...trimmedValues(form.fields, values) });
    setPending(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setAcceptance(result.data);
  }

  return (
    <form className="rx-form" onSubmit={onSubmit} noValidate>
      <h2>{form.title}</h2>
      {Object.entries(form.fixed).map(([key, value]) => (
        <p key={key} className="rx-fixed">
          {key === 'role' ? `Роль запроса: ${fixedRoleLabel(value)}` : `${key}: ${value}`}
        </p>
      ))}
      <div className="rx-fields">
        {form.fields.map((field) => {
          const id = `${form.id}-${field.name}`;
          const error = errors[field.name];
          const value = values[field.name] ?? '';
          const common = {
            id,
            name: field.name,
            value,
            required: field.required,
            autoComplete: field.autoComplete ?? 'off',
            spellCheck: false,
            'aria-invalid': Boolean(error) || undefined,
            onChange: (event: { target: { value: string } }) => {
              const raw = event.target.value;
              const next = field.kind === 'currency' || field.kind === 'accountCode' ? raw.toUpperCase() : raw;
              setValues((current) => ({ ...current, [field.name]: next }));
            },
          };
          const describedBy = error ? `${id}-error` : undefined;
          const control = { ...common, 'aria-describedby': describedBy };
          return (
            <div key={field.name} className="rx-field">
              <label htmlFor={id}>{field.label}</label>
              {field.kind === 'textarea' ? (
                <textarea {...control} rows={3} maxLength={500} />
              ) : field.kind === 'select' ? (
                <select {...control}>
                  <option value="">Выберите</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...control}
                  type={field.kind === 'password' ? 'password' : field.kind === 'date' ? 'date' : 'text'}
                  inputMode={field.kind === 'amount' ? 'decimal' : field.kind === 'mfa' ? 'numeric' : undefined}
                  maxLength={field.kind === 'mfa' ? 6 : field.kind === 'currency' ? 3 : field.kind === 'email' ? 120 : 128}
                />
              )}
              {error ? (
                <small id={`${id}-error`} role="alert">
                  {error}
                </small>
              ) : null}
            </div>
          );
        })}
      </div>
      <button className="rx-btn" type="submit" disabled={pending}>
        {pending ? 'Отправка…' : form.submitLabel}
      </button>
      {failure ? <StatusBanner reason={failure} /> : null}
      {acceptance ? (
        <div className="rx-accepted" role="status">
          <strong>Сервер принял операцию</strong>
          <p>Журнал {acceptance.auditId}</p>
          <p>Операция {acceptance.operationId}</p>
          <p>Локальные остатки и списки не пересчитываются.</p>
        </div>
      ) : null}
    </form>
  );
}
