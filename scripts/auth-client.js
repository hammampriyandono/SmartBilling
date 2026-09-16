import {readFile} from 'node:fs/promises';
export async function authenticatedFetch(base=process.env.AUTH_TEST_BASE_URL||'http://127.0.0.1:3000') {
  if(!process.env.AUTH_TEST_PASSWORD_FILE) throw new Error('AUTH_TEST_PASSWORD_FILE wajib untuk API terautentikasi');
  const password=(await readFile(process.env.AUTH_TEST_PASSWORD_FILE,'utf8')).trim();
  let cookie='';
  async function request(path,options={}) {
    const result=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Cookie:cookie,Origin:process.env.AUTH_ORIGIN||base,...options.headers}});
    if(result.headers.get('set-cookie'))cookie=result.headers.get('set-cookie').split(';')[0];
    return result;
  }
  const csrfResponse=await request('/api/auth/csrf');if(!csrfResponse.ok)throw new Error('CSRF tidak tersedia');
  const {csrf}=await csrfResponse.json();
  const login=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:process.env.AUTH_TEST_EMAIL||'owner@simulation.invalid',password})});
  if(!login.ok)throw new Error('Login pengujian gagal');
  return request;
}
