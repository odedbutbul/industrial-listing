import type { CustomerRow } from '@/lib/customers/queries'
import { BEHAVIOR, BEHAVIOR_HELP } from './customers'
import { date } from './format'
import { Pill, Tip } from './ui'

/** תג רמת ההתנהלות + טולטיפ: מה הרמה אומרת, למה הלקוח הזה קיבל אותה, ואם נקבעה ידנית — הנימוק. */
export function ConductBadge({ b }: { b: CustomerRow['behavior'] }) {
  const [label, tone] = BEHAVIOR[b.level]
  const reasons = b.signals.filter((s) => s.tone !== 'ok' && s.tone !== 'gray').slice(0, 4)
  return (
    <Tip
      label={`התנהלות: ${label}${b.manual ? ' (נקבע ידנית)' : ''} — הסבר`}
      content={
        <>
          <strong>
            {label}
            {b.manual ? ' · נקבע ידנית' : ''}
          </strong>
          <span>{BEHAVIOR_HELP[b.level]}</span>
          {b.manual ? (
            <span style={{ color: 'var(--ax-text2)' }}>
              הנימוק{b.manual.at ? ` (${date(b.manual.at)})` : ''}: <bdi>{b.manual.note ?? '—'}</bdi>. לפי החישוב האוטומטי: {BEHAVIOR[b.auto][0]}.
            </span>
          ) : (
            reasons.length > 0 && (
              <>
                <span style={{ color: 'var(--ax-muted)', fontSize: 12.5 }}>אצל הלקוח הזה:</span>
                <ul>
                  {reasons.map((s, i) => (
                    <li key={i}>{s.text}</li>
                  ))}
                </ul>
              </>
            )
          )}
        </>
      }
    >
      <Pill t={tone} dot>
        {label}
        {b.manual ? ' · ידני' : ''}
      </Pill>
    </Tip>
  )
}
