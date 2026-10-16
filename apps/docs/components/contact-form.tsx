"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { HONEYPOT_FIELD } from "@/app/api/contact/honeypot-field";
import type { ContactFieldErrors } from "@/app/api/contact/schema";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

type SubmitState = "idle" | "loading" | "success" | "rate_limited" | "error";

type ContactResponseBody =
  | { status: "ok" }
  | { status: "invalid"; errors: ContactFieldErrors }
  | { status: "rate_limited" }
  | { status: "forbidden" }
  | { status: "too_large" }
  | { status: "unsupported_media_type" }
  | { status: "error" };

const INPUT_CLASS =
  "rounded-[10px] border border-(--border-default) bg-(--surface-bg) px-3 py-2 text-sm text-(--text-strong) transition-colors aria-invalid:border-(--border-danger)";

async function submitContactForm(formData: FormData): Promise<ContactResponseBody> {
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(formData.entries())),
  });
  return (await response.json()) as ContactResponseBody;
}

function statusToState(status: ContactResponseBody["status"]): SubmitState {
  return status === "rate_limited" ? "rate_limited" : "error";
}

function StatusMessage({
  state,
  hasFieldErrors,
  t,
}: {
  state: SubmitState;
  hasFieldErrors: boolean;
  t: (key: string) => string;
}): ReactNode {
  if (state === "success") {
    return (
      <p className="text-(--text-success)">
        <strong>{t("successTitle")}</strong> {t("successBody")}
      </p>
    );
  }
  if (state === "rate_limited") {
    return <p className="text-(--text-danger)">{t("rateLimitedBody")}</p>;
  }
  if (state === "error" && hasFieldErrors) {
    return <p className="text-(--text-danger)">{t("validationErrorBody")}</p>;
  }
  if (state === "error") {
    return (
      <p className="text-(--text-danger)">
        <strong>{t("errorTitle")}</strong> {t("errorBody")}
      </p>
    );
  }
  return null;
}

function Field({
  id,
  name,
  label,
  placeholder,
  errorText,
  as = "input",
  type = "text",
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  errorText: string | undefined;
  as?: "input" | "textarea";
  type?: string;
  maxLength?: number;
}): ReactNode {
  const errorId = `${id}-error`;
  const sharedProps = {
    id,
    name,
    placeholder,
    required: true,
    "aria-invalid": errorText ? ("true" as const) : undefined,
    "aria-describedby": errorText ? errorId : undefined,
    className: INPUT_CLASS,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-(--text-strong)">
        {label}
      </label>
      {as === "textarea" ? (
        <textarea {...sharedProps} rows={6} minLength={10} maxLength={5000} />
      ) : (
        <input {...sharedProps} type={type} maxLength={maxLength} />
      )}
      {errorText && (
        <p id={errorId} className="text-sm text-(--text-danger)">
          {errorText}
        </p>
      )}
    </div>
  );
}

export function ContactForm({
  privacyNotice,
  imprintHref,
}: {
  privacyNotice: ReactNode;
  imprintHref: string;
}): ReactNode {
  const t = useTranslations("legal.contact.form");
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();
  const hydrated = useHydrated();

  const [state, setState] = useState<SubmitState>("idle");
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    setState("loading");
    setFieldErrors({});

    try {
      const body = await submitContactForm(new FormData(form));
      if (body.status === "ok") {
        setState("success");
        form.reset();
        return;
      }
      if (body.status === "invalid") {
        setFieldErrors(body.errors);
        setState("error");
        return;
      }
      setState(statusToState(body.status));
    } catch {
      setState("error");
    }
  }

  return (
    <form
      method="post"
      action="/api/contact"
      onSubmit={handleSubmit}
      className="not-prose flex flex-col gap-5"
    >
      <noscript>
        <p className="text-sm text-(--text-strong)">
          {t.rich("noScript", {
            imprint: (chunks: ReactNode) => (
              <a href={imprintHref} className="vk-prose-link">
                {chunks}
              </a>
            ),
          })}
        </p>
      </noscript>
      <Field
        id={nameId}
        name="name"
        label={t("nameLabel")}
        placeholder={t("namePlaceholder")}
        errorText={fieldErrors.name ? t(`errors.${fieldErrors.name}`) : undefined}
        maxLength={100}
      />
      <Field
        id={emailId}
        name="email"
        type="email"
        label={t("emailLabel")}
        placeholder={t("emailPlaceholder")}
        errorText={fieldErrors.email ? t(`errors.${fieldErrors.email}`) : undefined}
      />
      <Field
        id={messageId}
        name="message"
        as="textarea"
        label={t("messageLabel")}
        placeholder={t("messagePlaceholder")}
        errorText={fieldErrors.message ? t(`errors.${fieldErrors.message}`) : undefined}
      />
      <div
        aria-hidden="true"
        className="absolute h-px w-px overflow-hidden"
        style={{ left: "-9999px" }}
      >
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
      </div>
      <button
        type="submit"
        disabled={!hydrated || state === "loading"}
        className={cn(buttonVariants({ variant: "primary" }), "self-start transition-none")}
      >
        {state === "loading" ? t("submitting") : t("submit")}
      </button>
      <p className="-mt-2 text-sm text-(--text-muted)">{privacyNotice}</p>
      <div role="status" aria-live="polite" className="text-sm">
        <StatusMessage state={state} hasFieldErrors={Object.keys(fieldErrors).length > 0} t={t} />
      </div>
    </form>
  );
}
