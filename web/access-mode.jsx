import React,{createContext,useContext} from 'react';

export const ReadOnlyContext=createContext(false);
export function PreviewNotice() {
  const readOnly=useContext(ReadOnlyContext);
  return readOnly?<p className="admin-notice" role="status"><strong>Pratinjau pengunjung</strong> Anda boleh mencoba isi formulir. Perubahan tidak disimpan dan perintah perangkat tidak dikirim.</p>:null;
}
export function guardMutationSubmit(readOnly,submit) {
  return event=>{
    if(readOnly){event.preventDefault();event.stopPropagation();return;}
    submit?.(event);
  };
}
export function MutationForm({onSubmit,children,...props}) {
  const readOnly=useContext(ReadOnlyContext);
  return <form {...props} onSubmit={guardMutationSubmit(readOnly,onSubmit)}><PreviewNotice/>{children}</form>;
}
export function MutationButton({disabled,title,...props}) {
  const readOnly=useContext(ReadOnlyContext);
  return <button {...props} disabled={readOnly||disabled} title={readOnly?'Akun pengunjung expo hanya dapat melihat data.':title}/>;
}
export function dashboardUser(user) {
  return user.role==='viewer'?{...user,role:'owner',account_role:'viewer',read_only:true}:user;
}
