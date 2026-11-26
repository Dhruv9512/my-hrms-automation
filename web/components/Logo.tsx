// Flat mark: a clock face with the hand on the end of the day.
export default function Logo({ label = "Auto Checkout" }: { label?: string }) {
  return (
    <span className="logo">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".9" />
        <path d="M10 5.5V10l3.5 2" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}
