import React, {useRef} from 'react';
import {Icon} from './interface-icon.jsx';
import {BrandLogo} from './brand-logo.jsx';

export function WorkspaceHeader({user, page, onNavigate, onLogout, busy, error}) {
  const menu = useRef(null);
  const owner = user.role === 'owner';
  const pages = [
    ['monitoring', 'Monitoring listrik', 'Monitoring'],
    ['sessions', owner ? 'Riwayat fasilitas RFID' : 'Sesi fasilitas RFID', 'Fasilitas'],
    ['billing', owner ? 'Tagihan' : 'Tagihan Saya', 'Tagihan'],
    ...(owner ? [['reports', 'Laporan'], ['health', 'Kesehatan Perangkat'], ['admin', 'Administrasi']] : []),
  ];
  const moreActive = pages.slice(3).some(([key]) => key === page);

  function navButton([key, label, shortLabel], compact = false) {
    return <button key={key} type="button" aria-label={label} aria-current={key === page ? 'page' : undefined}
      onClick={() => { menu.current?.close(); onNavigate(key); }}>
      <Icon name={key}/><span>{compact ? shortLabel : label}</span>
    </button>;
  }

  return <header className="app-header">
    <div className="masthead"><div className="masthead-inner">
      <a className="app-brand" href="/" aria-label="SplitzBill"><BrandLogo tone="light"/></a>
      <span className="masthead-date"><Icon name="calendar" size={16}/>{new Intl.DateTimeFormat('id-ID', {dateStyle:'full', timeZone:'Asia/Jakarta'}).format(new Date())}</span>
      <div className="user-identity"><span className="user-initial" aria-hidden="true">{user.name?.trim().charAt(0) || '•'}</span>
        <span className="user-name"><strong>{user.name}</strong><small>{user.read_only ? 'Pengunjung expo · Hanya baca' : owner ? 'Pemilik' : 'Penghuni'}</small></span>
      </div>
      <button className="logout-button" type="button" onClick={onLogout} disabled={busy} aria-label="Keluar"><Icon name="logout" size={17}/><span>Keluar</span></button>
    </div></div>
    {error && <p className="error" role="alert">{error}</p>}
    <nav className="desktop-nav" aria-label="Menu utama"><div>{pages.map(item => navButton(item))}</div></nav>
    <nav className="mobile-nav" aria-label="Menu utama">{pages.slice(0, 3).map(item => navButton(item, true))}
      {owner && <button type="button" className={moreActive ? 'contains-current' : ''} aria-haspopup="dialog" onClick={() => menu.current.showModal()}><Icon name="more"/><span>Lainnya</span></button>}
    </nav>
    {owner && <dialog className="mobile-menu" ref={menu} aria-labelledby="mobile-menu-title" onClick={event => { if (event.target === menu.current) menu.current.close(); }}>
      <div><header><h2 id="mobile-menu-title">Menu pemilik</h2><button type="button" aria-label="Tutup menu" onClick={() => menu.current.close()}><Icon name="close"/></button></header>
      <nav aria-label="Halaman lainnya">{pages.slice(3).map(item => navButton(item))}</nav></div>
    </dialog>}
  </header>;
}
