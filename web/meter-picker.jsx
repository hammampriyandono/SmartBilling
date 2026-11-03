import React from 'react';
import {Icon} from './interface-icon.jsx';

export function MeterPicker({choices, selectedId, onSelect, loading=false, error='', children}) {
  return <section className="point-picker" aria-labelledby="points-title">
    <header><div><p className="eyebrow">DAFTAR METER</p><h2 id="points-title">Titik pengukuran</h2></div><span className="point-count">{choices.length} meter</span></header>
    {choices.length ? <>
      <div className="point-list">{choices.map(meter => <button
        key={meter.id} type="button" aria-pressed={meter.id === selectedId} onClick={() => onSelect(meter.id)}>
        <span className="point-icon"><Icon name={meter.kind === 'room' ? 'room' : 'meter'}/></span>
        <span><strong>{meter.label}</strong><small>Channel {meter.channel_no}{meter.source === 'simulation' && ' · simulasi'}</small></span>
        <Icon name={meter.id === selectedId ? 'check' : 'chevron'} size={16}/>
      </button>)}</div>
      <label className="point-mobile"><Icon name="meter"/><select aria-label="Pilih meter" value={selectedId} onChange={e => onSelect(e.target.value)}>
        {choices.map(meter => <option key={meter.id} value={meter.id}>{meter.label} · channel {meter.channel_no}{meter.source === 'simulation' && ' · simulasi'}</option>)}
      </select></label>
    </> : <p className="point-status" role="status">{loading ? 'Memuat meter…' : error ? 'Meter belum dapat dimuat.' : 'Meter pengamatan belum dipasang.'}</p>}
    {children}
  </section>;
}
