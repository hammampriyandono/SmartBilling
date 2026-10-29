import React from 'react';

export function MeterPicker({choices, selectedId, onSelect}) {
  if (!choices.length) return null;
  return <nav className="measurement-picker" aria-label="Pilih titik pengukuran">
    <div className="measurement-picker-heading"><h2>Titik pengukuran</h2><span>{choices.length} meter tersedia</span></div>
    <div className="measurement-picker-grid">{choices.map(meter => <button
      key={meter.id} type="button" className={`measurement-card ${meter.id===selectedId?'selected':''}`}
      aria-pressed={meter.id===selectedId} onClick={()=>onSelect(meter.id)}>
      <span className="measurement-card-icon" aria-hidden="true">{meter.kind==='room'?'▤':'◈'}</span>
      <span><strong>{meter.label}</strong><small>{meter.description}</small><small>Channel {meter.channel_no}{meter.source==='simulation'?' · simulasi':''}</small></span>
      <span className="measurement-card-arrow" aria-hidden="true">›</span>
    </button>)}</div>
  </nav>;
}
