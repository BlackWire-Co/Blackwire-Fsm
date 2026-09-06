import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";

type Step = "service" | "provider" | "slot" | "details" | "done";
const STEP_ORDER: Step[] = ["service", "provider", "slot", "details"];

// Fully public, unauthenticated booking flow - no sidebar, no auth check.
// Mirrors the shape of a tool like Easy!Appointments: pick a service, pick
// a provider (or "Any Available"), pick an open time, leave contact info,
// done. Every write goes through the /api/booking router, which is
// separately rate-limited on the backend since anyone on the internet can
// hit it.
export default function PublicBooking() {
  const [settings, setSettings] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(""); // "" = Any Available
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    addressLine1: "", addressLine2: "", city: "", state: "", zip: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<any | null>(null);

  useEffect(() => {
    // If this fetch fails outright (server unreachable, 500, etc.) that's a
    // different problem than booking being genuinely turned off - flagged
    // separately below so the two don't look identical on screen.
    api("/booking/settings")
      .then(setSettings)
      .catch((err) => {
        console.error("Failed to load booking settings:", err);
        const rateLimited = /too many requests/i.test(err.message || "");
        setSettings({ enabled: false, loadError: true, rateLimited });
      });
    api("/booking/services").then(setServices).catch(() => setServices([]));
    api("/booking/providers").then(setProviders).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (step !== "slot" || !selectedService) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    const providerParam = selectedProviderId ? `&providerId=${selectedProviderId}` : "";
    api(`/booking/availability?serviceId=${selectedService.id}&date=${date}${providerParam}`)
      .then((data: any) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [step, selectedService, selectedProviderId, date]);

  async function submitBooking(e: FormEvent) {
    e.preventDefault();
    if (!selectedService || !selectedSlot) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await api("/booking", {
        method: "POST",
        body: {
          serviceId: selectedService.id,
          providerId: selectedProviderId || undefined,
          start: selectedSlot.start,
          ...form,
        },
      });
      setConfirmation(result);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Could not complete booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!settings) {
    return <div className="booking-shell"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  }

  if (!settings.enabled) {
    return (
      <div className="booking-shell">
        <div className="booking-card">
          <span className="tag">BlackWire FSM</span>
          <h1>
            {settings.rateLimited
              ? "Just a moment"
              : settings.loadError
              ? "Something went wrong loading this page"
              : "Online booking isn't available right now"}
          </h1>
          <p style={{ color: "var(--muted)" }}>
            {settings.rateLimited
              ? "This page has been checked a lot in a short time, so it's briefly rate-limited. Please wait a few minutes and refresh."
              : settings.loadError
              ? "We couldn't reach the booking system just now. Please refresh, or give us a call to schedule."
              : "Please give us a call to schedule an appointment."}
          </p>
        </div>
      </div>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="booking-shell">
      <div className="booking-card">
        <span className="tag">BlackWire FSM</span>
        <h1>Book an Appointment</h1>

        {step !== "done" && (
          <div className="booking-steps">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className={"booking-step" + (i === stepIndex ? " active" : "") + (i < stepIndex ? " done" : "")}>
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {step === "service" && (
          <div>
            <h3 style={{ marginBottom: 12 }}>What do you need done?</h3>
            <div className="booking-option-list">
              {services.map((s) => (
                <button key={s.id} type="button" className="booking-option" onClick={() => { setSelectedService(s); setStep("provider"); }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.description && <div className="who">{s.description}</div>}
                    <div className="who">{s.durationMin} min</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)", fontWeight: 600 }}>${Number(s.price).toFixed(2)}</div>
                </button>
              ))}
              {services.length === 0 && <p className="empty-note">No services are available for booking right now.</p>}
            </div>
          </div>
        )}

        {step === "provider" && (
          <div>
            <h3 style={{ marginBottom: 12 }}>Who would you like?</h3>
            <div className="booking-option-list">
              <button type="button" className="booking-option" onClick={() => { setSelectedProviderId(""); setStep("slot"); }}>
                <div style={{ fontWeight: 600 }}>Any Available</div>
              </button>
              {providers.map((p) => (
                <button key={p.id} type="button" className="booking-option" onClick={() => { setSelectedProviderId(p.id); setStep("slot"); }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                </button>
              ))}
            </div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setStep("service")}>← Back</button>
          </div>
        )}

        {step === "slot" && (
          <div>
            <h3 style={{ marginBottom: 12 }}>Pick a date and time</h3>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {loadingSlots && <p className="who">Checking availability…</p>}
            {!loadingSlots && (
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    disabled={s.blocked}
                    title={s.blocked ? "Too soon to book - please pick a later time" : undefined}
                    className={"slot-btn" + (selectedSlot?.start === s.start ? " selected" : "") + (s.blocked ? " blocked" : "")}
                    onClick={() => !s.blocked && setSelectedSlot(s)}
                  >
                    {new Date(s.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
                {slots.length === 0 && <p className="empty-note">No open times on this date - try another day.</p>}
              </div>
            )}
            {slots.some((s) => s.blocked) && (
              <p className="who" style={{ marginTop: -4, marginBottom: 10 }}>Crossed-out times are too soon to book - please call for last-minute appointments.</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn ghost" type="button" onClick={() => setStep("provider")}>← Back</button>
              <button className="btn primary" type="button" disabled={!selectedSlot} onClick={() => setStep("details")}>Continue</button>
            </div>
          </div>
        )}

        {step === "details" && (
          <form onSubmit={submitBooking}>
            <h3 style={{ marginBottom: 12 }}>Your info</h3>
            <div className="grid cols-2">
              <div className="field">
                <label>First name</label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Last name</label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Email{settings.requireEmail ? "" : " (optional)"}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required={settings.requireEmail} />
              </div>
              <div className="field">
                <label>Phone{settings.requirePhone ? "" : " (optional)"}</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required={settings.requirePhone} />
              </div>
            </div>

            {settings.requireAddress && (
              <>
                <div className="field">
                  <label>Address</label>
                  <input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} required />
                </div>
                <div className="grid cols-3">
                  <div className="field">
                    <label>City</label>
                    <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>State</label>
                    <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>ZIP</label>
                    <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} required />
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label>Notes{settings.requireNotes ? "" : " (optional)"}</label>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} required={settings.requireNotes} placeholder="Tell us what's going on" />
            </div>

            <div className="card" style={{ marginBottom: 14, background: "var(--surface-2)" }}>
              <div className="who">Booking summary</div>
              <div style={{ marginTop: 6 }}>
                <strong>{selectedService?.name}</strong> - ${Number(selectedService?.price).toFixed(2)}<br />
                {selectedSlot && new Date(selectedSlot.start).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>

            {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" type="button" onClick={() => setStep("slot")}>← Back</button>
              <button className="btn primary" type="submit" disabled={submitting}>{submitting ? "Booking…" : "Confirm Booking"}</button>
            </div>
          </form>
        )}

        {step === "done" && confirmation && (
          <div>
            <h3 style={{ color: "var(--cyan)" }}>You're all set!</h3>
            <p className="who">Confirmation #{confirmation.jobNumber}</p>
            <div className="card" style={{ marginBottom: 14 }}>
              <div><strong>{confirmation.service?.name}</strong> - ${Number(confirmation.service?.price).toFixed(2)}</div>
              <div style={{ marginTop: 6 }}>
                {new Date(confirmation.scheduledDate).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="who" style={{ marginTop: 4 }}>Arrival window: {confirmation.arrivalWindow}</div>
            </div>
            {confirmation.confirmationNote && <p className="who">{confirmation.confirmationNote}</p>}
            <p className="who">A confirmation email is on its way if you gave us an email address.</p>
          </div>
        )}
      </div>
    </div>
  );
}
