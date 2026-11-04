import React, {useState} from 'react';
import {Icon} from './interface-icon.jsx';
import {BrandLogo} from './brand-logo.jsx';
import './login-screen.css';

const features = [
  ['power', 'Monitoring listrik', 'Lihat pemakaian kamar dan fasilitas bersama.'],
  ['sessions', 'Sesi fasilitas RFID', 'Catat penggunaan fasilitas lewat tap kartu.'],
  ['billing', 'Rincian tagihan', 'Telusuri pemakaian dan pembagian biayanya.'],
  ['room', 'Akses sesuai peran', 'Ruang untuk pemilik dan penghuni kost.'],
];

export function LoginScreen({onSubmit, busy, error}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  return <main className="login-page login-experience">
    <div className="login-shell">
      <header className="login-masthead">
        <a className="login-brand" href="/" aria-label="SplitzBill">
          <BrandLogo/>
        </a>
        <span className="login-product-label">MONITORING &amp; FAIR BILLING</span>
        <span className="login-project">CAPSTONE A-05</span>
      </header>

      <div className="login-stage">
        <section className="login-intro" aria-labelledby="login-headline">
          <p className="eyebrow"><span/> LISTRIK KOST, LEBIH TRANSPARAN</p>
          <h1 id="login-headline">Energi terpantau.<br/>Tagihan lebih <em>adil.</em></h1>
          <p>Dari kamar hingga fasilitas bersama, kenali pemakaian listrik dan pembagian biayanya dalam satu tempat.</p>
        </section>

        <figure className="login-model">
          <img src="/maket-kos-a05.webp" width="1536" height="1024" fetchPriority="high" alt="Visualisasi maket tim A-05: dua kamar dengan teras, mesin cuci bersama, pembaca RFID, dan tiga kotak sensor di atas plafon transparan."/>
          <figcaption><span className="model-caption-line"/>KOS A-05<span className="model-caption-detail">Kamar &amp; fasilitas bersama</span></figcaption>
        </figure>

        <form className="login-card login-access" onSubmit={onSubmit} aria-labelledby="login-title">
          <div className="login-access-heading">
            <span className="login-access-icon"><Icon name="room" size={22}/></span>
            <span className="eyebrow">AKSES AKUN</span>
          </div>
          <div className="login-welcome"><h2 id="login-title">Selamat datang.</h2><p>Masuk untuk melihat energi dan tagihan Anda.</p></div>
          <label htmlFor="login-email">Email<input id="login-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="nama@email.com"/></label>
          <label htmlFor="login-password">Password</label>
          <div className="login-password-field">
            <input id="login-password" type={showPassword?'text':'password'} name="password" autoComplete="current-password" required maxLength={1024} placeholder="Masukkan password"/>
            <button type="button" className="password-visibility" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Sembunyikan password':'Tampilkan password'} aria-pressed={showPassword} disabled={busy}><Icon name={showPassword?'eyeOff':'eye'} size={19}/></button>
          </div>
          {error&&<p role="alert" className="error">{error}</p>}
          <button className="apply login-submit" type="submit" disabled={busy}>{busy?'Memeriksa…':'Masuk ke dashboard'}<Icon name="arrowRight" size={18}/></button>
          <small className="login-scope"><Icon name="shield" size={15}/>Akses mengikuti properti dan masa tinggal Anda.</small>
          <p className="login-invitation">Belum punya akun? Hubungi pemilik kost untuk mendapatkan undangan.</p>
        </form>
      </div>

      <section className="login-features-section" aria-label="Fitur SplitzBill">
        <button className="login-features-toggle" type="button" aria-expanded={showFeatures} aria-controls="login-features" onClick={()=>setShowFeatures(value=>!value)}>
          <span>Kenali SplitzBill<span>Monitoring, fasilitas, dan tagihan</span></span>
          <Icon name="chevron" size={18}/>
        </button>
        <div id="login-features" className={`login-features${showFeatures?' is-expanded':''}`}>
          {features.map(([icon,title,description],index)=><article key={icon}>
            <div><span className="login-feature-icon"><Icon name={icon} size={20}/></span><span className="login-feature-number">0{index+1}</span></div>
            <h2>{title}</h2><p>{description}</p>
          </article>)}
        </div>
      </section>
      <footer className="login-footer"><span>SplitzBill · Capstone A-05</span><span>Energi tercatat, biaya lebih jelas.</span></footer>
    </div>
  </main>;
}
