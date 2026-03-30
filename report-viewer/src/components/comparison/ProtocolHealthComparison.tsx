import { DailyRewardReport } from '../../types';
import { compareProtocolHealth } from '../../utils/compareReports';
import { formatTokenAmount, formatNumber } from '../../utils/format';
import DeltaCard from './DeltaCard';

interface Props {
  reportA: DailyRewardReport;
  reportB: DailyRewardReport;
}

export default function ProtocolHealthComparison({ reportA, reportB }: Props) {
  const health = compareProtocolHealth(reportA, reportB);

  return (
    <div className="compare-section">
      <div className="section-title">Protocol Health</div>
      <div className="cards-grid">
        {Object.entries(health.rewardsByToken).map(([token, d]) => (
          <DeltaCard
            key={token}
            label={`Avg Daily ${token}`}
            delta={d}
            formatter={formatTokenAmount}
            colorClass={token === 'HAI' ? 'cyan' : 'green'}
          />
        ))}
        <DeltaCard
          label="Rewarded Users"
          delta={health.userCount}
          formatter={(n) => formatNumber(n, 0)}
        />
        <DeltaCard
          label="Avg Boosted Positions"
          delta={health.boostedPositions}
          formatter={(n) => formatNumber(n, 1)}
        />
        <DeltaCard
          label="Days with Data"
          delta={health.daysWithData}
          formatter={(n) => formatNumber(n, 0)}
          colorClass="accent"
        />
      </div>
    </div>
  );
}
