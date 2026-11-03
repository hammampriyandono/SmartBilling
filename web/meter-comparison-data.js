// Preserve decimal strings from PostgreSQL, including large counters and a
// negative residual smaller than one unit. Avoid binary floating-point rounding.
export function measurementDecimal(value){
 if(value==null)return 'Belum tersedia';
 const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));if(!match)return 'Belum tersedia';
 const fraction=(match[3]||'').replace(/0+$/,'');
 const whole=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(BigInt(match[2]));
 const sign=match[1]&&(BigInt(match[2])!==0n||fraction)?'-':'';
 return sign+whole+(fraction?','+fraction:'');
}
