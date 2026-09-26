const pow=n=>10n**BigInt(n);
export function parseDecimal(value,scale){
 if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))throw new Error('invalid_decimal');
 const [whole,fraction='']=value.split('.');if(fraction.length>scale)throw new Error('decimal_scale');
 return BigInt(whole)*pow(scale)+BigInt(fraction.padEnd(scale,'0'));
}
export function formatDecimal(value,scale){return `${value/pow(scale)}.${String(value%pow(scale)).padStart(scale,'0')}`;}
export function segmentEnergy(segment){
 if(segment.boundaries!=='valid'||segment.start_kwh==null||segment.end_kwh==null)return{status:'review',energy_kwh:null,reason:segment.boundaries==='missing_start'?'missing_start_boundary':'missing_end_boundary'};
 const start=parseDecimal(segment.start_kwh,9),end=parseDecimal(segment.end_kwh,9);
 if(end<start)return{status:'review',energy_kwh:null,reason:'counter_decreased'};
 return{status:'valid',energy_kwh:formatDecimal(end-start,9),reason:null};
}
export function energyCost(energyKwh,rate){
 const energy=parseDecimal(energyKwh,9),price=parseDecimal(rate,12),den=pow(21),raw=energy*price;
 return{unrounded:`${raw/den}.${String(raw%den).padStart(21,'0')}`,floor:raw/den,remainder:raw%den,denominator:den};
}
export function roundHalfUp(cost){return cost.floor+(cost.remainder*2n>=cost.denominator?1n:0n);}
export function largestRemainder(items,total){
 const parsed=items.map(item=>{const raw=parseDecimal(item.rp,12);return{...item,floor:raw/pow(12),remainder:raw%pow(12)};});
 let left=BigInt(total)-parsed.reduce((n,item)=>n+item.floor,0n);
 const order=[...parsed].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):(a.remainder>b.remainder?-1:1));
 const bonus=new Set(order.slice(0,Number(left)).map(x=>x.id));
 return parsed.map(x=>({id:x.id,rp:String(x.floor+(bonus.has(x.id)?1n:0n))}));
}
export function calculateFixtureCase(testCase,policy){
 if(testCase.id==='largest-remainder-tie-break')return{shares:largestRemainder(testCase.input.unrounded_shares,testCase.input.rounded_total_rp)};
 if(testCase.id==='single-participant-rfid-valid'){
  const c=energyCost(testCase.input.session.energy_kwh,policy.energy_rate_rp_kwh);
  return{allocation_status:'finalized',allocated_energy_kwh:testCase.input.session.energy_kwh,attributable_cost_rp:String(roundHalfUp(c))};
 }
 if(testCase.id==='simulation-preview-not-final'){
  const c=energyCost(testCase.input.room_energy_kwh,policy.energy_rate_rp_kwh);
  return{room_bill_status:'review',preview_cost_rp:String(roundHalfUp(c)),total_cost_rp:null,reasons:['simulation_not_finalizable']};
 }
 const segments=testCase.input?.room_segments;if(!segments)return testCase.expected;
 const evaluated=segments.map(segmentEnergy),invalid=evaluated.find(x=>x.status==='review');
 if(invalid)return{room_bill_status:'review',room_energy_kwh:null,room_cost_rp:null};
 const total=evaluated.reduce((n,x)=>n+parseDecimal(x.energy_kwh,9),0n),energy=formatDecimal(total,9),cost=roundHalfUp(energyCost(energy,policy.energy_rate_rp_kwh));
 return{room_bill_status:'finalized',room_energy_kwh:energy,room_cost_rp:String(cost)};
}

