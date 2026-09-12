import LeadForm from "@/components/LeadForm";

const SERVICES = [
  {
    name: "Plumbing",
    body: "Leaks, clogs, water heaters, and full repipes.",
  },
  {
    name: "Electrical",
    body: "Panel upgrades, rewiring, and outlet repairs.",
  },
  {
    name: "HVAC",
    body: "Installs, tune-ups, and emergency repairs.",
  },
];

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="wrap site-header__row">
          <span className="site-header__brand">BrightFix Home Services</span>
          <span className="site-header__meta">Licensed &amp; insured · Metro area</span>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <h1 className="hero__headline">
              Same-day quotes for plumbing, electrical, and HVAC work
            </h1>
            <p className="hero__sub">
              Tell us what&apos;s going on. A licensed technician calls you back
              within the hour, most days before noon.
            </p>
            <div className="hero__facts">
              <span>Serving homes across the metro area since 2015</span>
              <span>No obligation — quotes are always free</span>
            </div>
          </div>

          <LeadForm />
        </section>

        <section className="services">
          <h2 className="services__title">What we handle</h2>
          <div className="services__grid">
            {SERVICES.map((s) => (
              <div className="service-item" key={s.name}>
                <h3>{s.name}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          BrightFix Home Services · (555) 019-2044 · Mon–Sat, 7am–7pm
        </div>
      </footer>
    </>
  );
}
