import React, { useMemo, useState } from 'react';
import { extractAddressSeries, listAddresses } from '../utils/analytics';
import { ComposedChart, Line, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const AddressDrilldown: React.FC<{ events: any[] }> = ({ events }) => {
  const addresses = useMemo(() => listAddresses(events), [events]);
  const [address, setAddress] = useState<string>(addresses[0] ?? '');
  const series = useMemo(() => (address ? extractAddressSeries(events, address) : []), [events, address]);
  const [showCumulative, setShowCumulative] = useState(true);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Address drilldown</h3>
      <div className="controls">
        <select value={address} onChange={(e) => setAddress(e.target.value)}>
          {addresses.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="controls" style={{ marginTop: 8 }}>
        <label>
          <input type="checkbox" checked={showCumulative} onChange={(e) => setShowCumulative(e.target.checked)} /> Show cumulative earned
        </label>
      </div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={(v) => String(v)} />
            <YAxis yAxisId="l" />
            <YAxis yAxisId="r" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="l" type="monotone" dataKey="stakingWeight" stroke="#10b981" dot={false} name="Stake" />
            <Bar yAxisId="r" dataKey="deltaEarned" fill="#ef4444" name="Δ Earned" opacity={0.7} />
            {showCumulative && (
              <Line yAxisId="r" type="monotone" dataKey="totalEarned" stroke="#7c3aed" dot={false} strokeWidth={2} name="Cumulative Earned" connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};


