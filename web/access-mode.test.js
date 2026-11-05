import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('pengunjung memakai navigasi semua halaman owner dan aksi tetap disabled saat data siap',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {ReadOnlyContext,MutationButton,dashboardUser}=await server.ssrLoadModule('/access-mode.jsx');
    const {WorkspaceHeader}=await server.ssrLoadModule('/workspace-header.jsx');
    const user=dashboardUser({id:'viewer-id',name:'Pengunjung expo',role:'viewer'});
    assert.equal(user.id,'viewer-id');assert.equal(user.role,'owner');assert.equal(user.read_only,true);
    const html=renderToStaticMarkup(React.createElement(WorkspaceHeader,{user,page:'monitoring',onNavigate(){},onLogout(){}}));
    for(const label of ['Administrasi','Laporan','Kesehatan Perangkat','Tagihan','Riwayat fasilitas RFID','Pengunjung expo · Hanya baca'])assert.ok(html.includes(label),label);
    const render=readOnly=>renderToStaticMarkup(React.createElement(ReadOnlyContext.Provider,{value:readOnly},
      React.createElement(React.Fragment,null,React.createElement(MutationButton,{disabled:false},'Finalisasi'),React.createElement('button',null,'Lihat rincian'))));
    assert.match(render(true),/disabled=""[^>]*>Finalisasi/);assert.match(render(true),/<button>Lihat rincian<\/button>/);
    assert.equal(render(false).includes('disabled'),false);
  }finally{await server.close();}
});

test('pratinjau formulir tetap bisa diisi, submit termasuk Enter diblokir dan owner tetap dapat menyimpan',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {ReadOnlyContext,MutationForm,MutationButton,guardMutationSubmit}=await server.ssrLoadModule('/access-mode.jsx');
    let submitted=0,prevented=0,stopped=0;
    const event={preventDefault(){prevented++;},stopPropagation(){stopped++;}};
    guardMutationSubmit(true,()=>submitted++)(event);
    assert.equal(submitted,0);assert.equal(prevented,1);assert.equal(stopped,1);
    guardMutationSubmit(false,()=>submitted++)(event);assert.equal(submitted,1);
    const form=readOnly=>renderToStaticMarkup(React.createElement(ReadOnlyContext.Provider,{value:readOnly},
      React.createElement(MutationForm,{onSubmit(){}},React.createElement('input',{name:'name',defaultValue:'Coba kamar'}),React.createElement(MutationButton,{disabled:false},'Simpan'))));
    assert.match(form(true),/Pratinjau pengunjung/);assert.match(form(true),/<input name="name" value="Coba kamar"\/>/);
    assert.match(form(true),/disabled=""[^>]*>Simpan/);assert.equal(form(false).includes('disabled'),false);assert.equal(form(false).includes('Pratinjau pengunjung'),false);
    const {AdminForm}=await server.ssrLoadModule('/admin-form.jsx');
    const html=renderToStaticMarkup(React.createElement(ReadOnlyContext.Provider,{value:true},React.createElement(AdminForm,{
      section:{key:'rooms',name:'Kamar'},action:'create',row:null,data:{properties:[{id:'property-id',name:'Kost'}]},user:{id:'viewer-id'},onClose(){},onSaved(){}})));
    assert.match(html,/Tambah Kamar/);assert.match(html,/<fieldset>/);assert.match(html,/name="name"/);assert.match(html,/Pratinjau pengunjung/);
  }finally{await server.close();}
});
