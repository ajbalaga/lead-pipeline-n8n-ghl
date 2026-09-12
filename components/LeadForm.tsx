"use client";

import { useState, FormEvent } from "react";

type Status = "idle" | "submitting" | "done" | "error";

const SERVICES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hvac", label: "HVAC" },
  { value: "other", label: "Something else" },
];

export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value,
      service: (form.elements.namedItem("service") as HTMLSelectElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Request failed");
      }

      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        "Something went wrong sending your request. Try again, or call us directly at (555) 019-2044."
      );
    }
  }

  if (status === "done") {
    return (
      <div className="ticket ticket--done">
        <div className="ticket__bar">
          Request a quote
          <span className="ticket__bar-note">Submitted</span>
        </div>
        <div className="ticket__body">
          <div className="confirm">
            <div className="confirm__mark">✓</div>
            <p className="confirm__title">Quote request received</p>
            <p className="confirm__body">
              A technician will call you back shortly, most days before noon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket">
      <div className="ticket__bar">
        Request a quote
        <span className="ticket__bar-note">~1 min</span>
      </div>
      <div className="ticket__body">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" type="text" required minLength={2} maxLength={120} />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" required minLength={7} maxLength={20} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="service">What do you need?</label>
            <select id="service" name="service" defaultValue="plumbing" required>
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="message">Tell us what&apos;s going on</label>
            <textarea id="message" name="message" maxLength={1000} />
          </div>

          <button className="submit-btn" type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Sending…" : "Request my quote"}
          </button>

          {status === "error" && <p className="form-error">{errorMsg}</p>}
        </form>
      </div>
    </div>
  );
}
