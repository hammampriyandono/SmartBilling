import {allPages,getJson} from './data.js';
import {facilityPages} from './sessions-data.js';
import {activeCatalog} from './monitoring-view.js';
import {visibleRecords,viewPath} from '../src/display-policy.js';

// Follow actual installations, rather than a fixed ESP, channel, or facility ID.
export function facilityMeters(meters,facilities,{facilityId='',showTestData=false,now=Date.now()}={}) {
 const loads=new Map(visibleRecords(facilities,showTestData)
  .filter(f=>f.is_active&&(!facilityId||f.id===facilityId)).map(f=>[f.id,f]));
 return activeCatalog({rooms:[],meters:visibleRecords(meters,showTestData)},now).meters
  .filter(m=>m.kind==='communal'&&loads.get(m.communal_load_id)?.property_id===m.property_id&&loads.has(m.communal_load_id))
  .map(m=>({...m,facility:loads.get(m.communal_load_id)}))
  .sort((a,b)=>a.facility.name.localeCompare(b.facility.name,'id',{numeric:true})||a.channel_no-b.channel_no||a.id.localeCompare(b.id));
}

export async function loadFacilityMonitoring(signal,{facilityId='',showTestData=false,request=getJson,now=Date.now()}={}) {
 const scoped=(path,s)=>request(viewPath(path,showTestData),s);
 const [catalog,facilities]=await Promise.all([
  allPages('/api/meters','next_after',signal,undefined,scoped),facilityPages(signal,scoped),
 ]);
 const meters=facilityMeters(catalog.rows,facilities,{facilityId,showTestData,now});
 return Promise.all(meters.map(async meter=>{
  try {
   const result=await scoped(`/api/meters/${encodeURIComponent(meter.id)}/latest`,signal);
   const reading=visibleRecords(result.data?[result.data]:[],showTestData)[0]||null;
   return {meter,reading,error:''};
  } catch(error) {
   if(signal.aborted)throw error;
   return {meter,reading:null,error:error.message};
  }
 }));
}

export function facilityReadingState(reading,now=Date.now()) {
 if(!reading)return {label:'Belum ada pembacaan',tone:''};
 if(reading.quality!=='valid')return {label:'Kualitas pembacaan perlu diperiksa',tone:'amber'};
 const time=Date.parse(reading.measured_at);
 if(!Number.isFinite(time)||time>now+5000)return {label:'Waktu pengukuran perlu diperiksa',tone:'amber'};
 if(now-time>120000)return {label:'Pembacaan lama',tone:'amber'};
 return {label:reading.data_source==='production'?'Pembacaan perangkat terbaru':reading.data_source==='simulation'?'Pembacaan simulasi terbaru':'Sumber pembacaan belum tersedia',tone:reading.data_source==='production'?'green':''};
}
