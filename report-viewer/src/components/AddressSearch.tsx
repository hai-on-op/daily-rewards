import { useState } from 'react';

interface Props {
  onSearch: (address: string) => void;
  error: string | null;
}

export default function AddressSearch({ onSearch, error }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    onSearch(value.trim());
  };

  return (
    <div>
      <div className="address-search">
        <input
          className="address-input"
          type="text"
          placeholder="Paste wallet address (0x...)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button className="search-btn" onClick={handleSubmit}>
          Search
        </button>
      </div>
      {error && <div className="address-error">{error}</div>}
    </div>
  );
}
