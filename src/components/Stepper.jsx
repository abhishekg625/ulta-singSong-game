const STEPS = [
  { key: 'sing', label: 'Sing' },
  { key: 'mimic', label: 'Sing it backwards' },
  { key: 'result', label: 'Result' },
];

export default function Stepper({ stage }) {
  const current = STEPS.findIndex((s) => s.key === stage);
  return (
    <ol className="stepper">
      {STEPS.map((step, i) => (
        <li
          key={step.key}
          className={i === current ? 'is-current' : i < current ? 'is-done' : undefined}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="stepper__num">{i < current ? '✓' : i + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}
