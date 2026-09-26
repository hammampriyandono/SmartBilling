import React,{useEffect,useState,useRef} from 'react';
import {setAccountId} from './data.js';
async function request(path,options={}) {
  const response=await fetch(`/api/auth/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000),...options});
  if(!response.ok) throw Object.assign(new Error(response.status===401?'Email atau password salah, akun nonaktif, atau sesi berakhir.':response.status===429?'Terlalu banyak percobaan. Coba kembali setelah 15 menit.':'Layanan login belum tersedia. Coba lagi.'),{status:response.status});
  return response.status===204?null:response.json();
}
function activationFromHash(){
 const match=/^#\/aktivasi(?:\?(.*))?$/.exec(window.location.hash);
 if(!match)return{active:false,token:''};
 return{active:true,token:new URLSearchParams(match[1]||'').get('token')||''};
}
const activationErrors={
 invalid_activation_input:'Password aktivasi minimal 8 karakter dan token harus diisi.',
 invalid_or_expired_invitation:'Tautan tidak valid, sudah dipakai, atau kedaluwarsa. Minta owner membuat undangan baru.',
 account_already_active:'Akun ini sudah aktif. Silakan masuk menggunakan email dan password Anda.',
 invalid_csrf:'Sesi aktivasi kedaluwarsa. Muat ulang tautan dan coba lagi.',
};
export function AuthGate({Dashboard}) {
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [activation,setActivation]=useState(activationFromHash),[activationBusy,setActivationBusy]=useState(false),[activationError,setActivationError]=useState(''),[activationSuccess,setActivationSuccess]=useState(false);
  const generation=useRef(0);
  function changeUser(next) {setAccountId(next?.id||null);setUser(next);}
  useEffect(()=>{if(activation.active)window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}`);},[]);
  useEffect(()=>{
    let stopped=false,running=false;
    const expired=()=>{generation.current++;changeUser(null);setLoading(false);};
    window.addEventListener('session-expired',expired);
    async function check() {
      if(running || stopped) return; running=true;const version=generation.current;
      try {const result=await request('me');if(!stopped&&version===generation.current){changeUser(result.user);setError('');}}
      catch(e) {if(!stopped&&version===generation.current){if(e.status===401)changeUser(null);else setError('Tidak dapat memeriksa sesi. Periksa backend lokal.');}}
      finally {running=false;if(!stopped)setLoading(false);}
    }
    check();const timer=setInterval(check,5000);
    return()=>{stopped=true;clearInterval(timer);window.removeEventListener('session-expired',expired);};
  },[]);
  async function submit(event) {
    event.preventDefault();generation.current++;setBusy(true);setError('');
    const form=event.currentTarget,fields=new FormData(form);
    try {
      const {csrf}=await request('csrf');
      await request('login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:fields.get('email'),password:fields.get('password')})});
      form.reset();const result=await request('me');changeUser(result.user);
    } catch(e){setError(e.message);form.elements.password.value='';} finally {generation.current++;setBusy(false);}
  }
  async function logout() {
    generation.current++;setBusy(true);setError('');
    try {const {csrf}=await request('csrf');await request('logout',{method:'POST',headers:{'X-CSRF-Token':csrf}});changeUser(null);}
    catch(e){setError(e.message);} finally {generation.current++;setBusy(false);}
  }
  async function activate(event){
    event.preventDefault();if(activationBusy)return;setActivationBusy(true);setActivationError('');
    const form=event.currentTarget,fields=new FormData(form),token=String(fields.get('token')||'').trim(),password=String(fields.get('password')||''),confirmation=String(fields.get('password_confirmation')||'');
    if(password!==confirmation){setActivationError('Kedua password belum sama.');setActivationBusy(false);return;}
    try{
      const {csrf}=await request('csrf');
      const response=await fetch('/api/auth/activate',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({token,password})});
      if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(activationErrors[payload.error]||'Aktivasi belum berhasil. Periksa koneksi atau minta owner memeriksa undangan.');}
      setActivationSuccess(true);setActivation(current=>({...current,token:''}));form.reset();
    }catch(e){setActivationError(e.message);}finally{setActivationBusy(false);}
  }
  async function leaveActivation(){
    if(user)await logout();
    setActivation({active:false,token:''});setActivationSuccess(false);setActivationError('');
  }
  if(activation.active)return <main className="login-page"><section className="login-card activation-card">
    <a className="login-brand" href="/" aria-label="SmartBilling"><span className="brand-icon">ϟ</span><span>SmartBilling<span className="brand-dot">.</span></span></a>
    <p className="eyebrow">AKTIVASI AKUN TENANT</p>
    {activationSuccess?<><h1>Akun berhasil diaktifkan</h1><p>Gunakan email yang didaftarkan owner dan password baru Anda untuk masuk.</p>{user?<button className="apply" type="button" onClick={leaveActivation} disabled={busy}>{busy?'Keluar…':'Keluar dan ke halaman masuk'}</button>:<a className="activation-login-link" href="/">Ke halaman masuk</a>}</>:<>
      <h1>Buat password Anda</h1><p>Atur password untuk akun SmartBilling Anda. Password minimal 8 karakter.</p>
      <form onSubmit={activate}>
       <label>Token undangan<input name="token" type="text" autoComplete="off" required maxLength={200} value={activation.token} onChange={e=>setActivation(current=>({...current,token:e.target.value}))}/></label>
       <label>Password baru<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>
       <label>Ulangi password<input name="password_confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>
       {activationError&&<p role="alert" className="error">{activationError}</p>}
       <button className="apply" type="submit" disabled={activationBusy}>{activationBusy?'Mengaktifkan…':'Aktifkan akun'}</button>
      </form>
      <small>Token hanya dapat digunakan satu kali. SmartBilling tidak mengirim atau menyimpan password dalam bentuk teks.</small>
    </>}
   </section></main>;
  if(loading) return <main className="login-page"><div className="login-card login-loading"><a className="login-brand" href="/" aria-label="SmartBilling"><span className="brand-icon">ϟ</span><span>SmartBilling<span className="brand-dot">.</span></span></a><p>Memeriksa sesi…</p></div></main>;
  if(user) return <div className="authenticated-app"><div className="account-bar"><span>{user.name} · {user.role==='owner'?'Owner':'Tenant'}</span><button onClick={logout} disabled={busy}>Keluar</button>{error&&<span role="alert">{error}</span>}</div><Dashboard key={user.id} user={user}/></div>;
  return <main className="login-page"><form className="login-card" onSubmit={submit}><a className="login-brand" href="/" aria-label="SmartBilling"><span className="brand-icon">ϟ</span><span>SmartBilling<span className="brand-dot">.</span></span></a><p className="eyebrow">MONITORING LISTRIK · LOKAL</p><h1>Masuk ke monitoring</h1><p>Akun owner atau tenant yang sudah diprovisioning.</p><label>Email<input type="email" name="email" autoComplete="username" required maxLength={254}/></label><label>Password<input type="password" name="password" autoComplete="current-password" required maxLength={1024}/></label>{error&&<p role="alert" className="error">{error}</p>}<button className="apply" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button><small>Data simulasi. Akses tenant dibatasi masa tinggal.</small></form></main>;
}
