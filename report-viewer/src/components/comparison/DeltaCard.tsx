import { DeltaValue } from '../../utils/compareReports';
import { formatDelta, formatPctChange } from '../../utils/format';

interface Props {
  label: string;
  delta: DeltaValue;
  formatter: (n: number) => string;
  colorClass?: string;
}

export default function DeltaCard({ label, delta, formatter, colorClass }: Props) {
  const changeClass = delta.diff > 0 ? 'delta-positive' : delta.diff < 0 ? 'delta-negative' : 'delta-neutral';

  return (
    <div className="delta-card">
      <div className="delta-card-label">{label}</div>
      <div className="delta-card-pair">
        <div>
          <div className="pair-label">Report A</div>
          <div className={`pair-value ${colorClass || ''}`}>{formatter(delta.valueA)}</div>
        </div>
        <div>
          <div className="pair-label">Report B</div>
          <div className={`pair-value ${colorClass || ''}`}>{formatter(delta.valueB)}</div>
        </div>
      </div>
      <div className={`delta-card-change ${changeClass}`}>
        {formatDelta(delta.diff)}
      </div>
      <div className={`delta-card-pct ${changeClass}`}>
        {isFinite(delta.pctChange) ? formatPctChange(delta.pctChange) : 'new'}
      </div>
    </div>
  );
}
