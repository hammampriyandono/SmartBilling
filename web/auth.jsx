import React,{useEffect,useState,useRef} from 'react';
import {setAccountId} from './data.js';
async function request(path,options={}) {
  const response=await fetch(`/api/auth/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000),...options});
  if(!response.ok) throw Object.assign(new Error(response.status===401?'Email atau password salah, akun nonaktif, atau sesi berakhir.':response.status===429?'Terlalu banyak percobaan. Coba kembali setelah 15 menit.':'Layanan login belum tersedia. Coba lagi.'),{status:response.status});
  return response.status===204?null:response.json();
}
export function AuthGate({Dashboard}) {
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const generation=useRef(0);
  function changeUser(next) {setAccountId(next?.id||null);setUser(next);}
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
  if(loading) return <main className="login-page"><p>Memeriksa sesi…</p></main>;
  if(user) return <><div className="account-bar"><span>{user.name} · {user.role==='owner'?'Owner':'Tenant'}</span><button onClick={logout} disabled={busy}>Keluar</button>{error&&<span role="alert">{error}</span>}</div><Dashboard key={user.id}/></>;
  return <main className="login-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">SMARTBILLING · LOKAL</p><h1>Masuk ke monitoring</h1><p>Akun owner atau tenant yang sudah diprovisioning.</p><label>Email<input type="email" name="email" autoComplete="username" required maxLength={254}/></label><label>Password<input type="password" name="password" autoComplete="current-password" required maxLength={1024}/></label>{error&&<p role="alert" className="error">{error}</p>}<button className="apply" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button><small>Data simulasi. Akses tenant dibatasi masa tinggal.</small></form></main>;
}
