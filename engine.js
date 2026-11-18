/* Motor financiero: importes enteros COP, libro de movimientos reconstruible. */
(function(root){
'use strict';
const categories=['Vivienda','Servicios','Alimentación','Transporte','Salud','Educación','Familia','Impuestos','Seguros','Entretenimiento','Compras','Ofrendas','Intereses','Otros'];
const types={income:'Ingreso',expense:'Gasto',transfer:'Transferencia',save:'Apartar ahorro',release:'Liberar ahorro',goalSpend:'Usar ahorro (gasto)',tithe:'Entregar diezmo',loan:'Préstamo recibido',credit:'Compra a crédito',debtPay:'Pago de deuda',adjustIn:'Ajuste positivo',adjustOut:'Ajuste negativo'};
const id=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const money=(n,allowZero=false)=>{if(!Number.isSafeInteger(n)||n<0||(!allowZero&&n===0))throw Error('Introduce un valor válido en pesos enteros.');return n};
const safeAdd=(a,b)=>{let v=a+b;if(!Number.isSafeInteger(v))throw Error('Importe fuera del rango permitido.');return v};
const blank=()=>({version:1,advanced:{sources:[],receivables:[],assets:[],rules:[],audit:[],closedThrough:'',chronological:true},accounts:[],goals:[],debts:[],transactions:[],budgets:{},bills:[],categories:[...categories],settings:{name:'',titheRate:10,essential:0,defaultIncome:0}});
function replay(s,asOf=null){
 if(!s||s.version!==1||!Array.isArray(s.accounts)||!Array.isArray(s.goals)||!Array.isArray(s.debts)||!Array.isArray(s.transactions))throw Error('Archivo de datos inválido.');
 const unique=(arr)=>{let set=new Set();for(let o of arr){if(!o||typeof o.id!=='string'||!o.id||set.has(o.id)||typeof o.name!=='string'||!o.name.trim())throw Error('Registro duplicado o inválido.');set.add(o.id)}};
 unique(s.accounts);unique(s.goals);unique(s.debts);unique(s.bills||[]);
 if(!Array.isArray(s.categories)||!s.categories.every(c=>typeof c==='string'&&c.trim())||!s.budgets||typeof s.budgets!=='object'||!s.settings||!Number.isFinite(s.settings.titheRate)||s.settings.titheRate<0||s.settings.titheRate>100)throw Error('Configuración inválida.');
 money(s.settings.essential||0,true);money(s.settings.defaultIncome||0,true);
 for(const g of s.goals){money(g.target);money(g.plan||0,true);if(g.date&&!validDate(g.date))throw Error('Fecha de meta inválida.');}
 for(const d of s.debts){money(d.opening,true);money(d.min||0,true);if(d.limit!==undefined)money(d.limit,true);if(d.kind==='Tarjeta'&&(!d.limit||d.cut<1||d.cut>31||!Number.isInteger(d.cut)))throw Error('Configura cupo y día de corte válidos.');if(d.due&&!validDate(d.due))throw Error('Fecha de deuda inválida.');}
 for(const b of s.bills||[]){money(b.amount);if(!validDate(b.due))throw Error('Fecha de obligación inválida.');}
 for(const [month, limits] of Object.entries(s.budgets)){if(!/^\d{4}-\d{2}$/.test(month)||!limits||typeof limits!=='object')throw Error('Presupuesto inválido.');for(const n of Object.values(limits))money(n,true)}
 let accounts=Object.fromEntries(s.accounts.map(a=>[a.id,money(a.opening,true)])), goals=Object.fromEntries(s.goals.map(g=>[g.id,0])), debts=Object.fromEntries(s.debts.map(d=>[d.id,money(d.opening,true)]));
 let due=0,paid=0,rows=[],seen=new Set();
 const cash=()=>Object.values(accounts).reduce(safeAdd,0), reserved=()=>Object.values(goals).reduce(safeAdd,0), pending=()=>Math.max(0,due-paid), titheReserve=()=>Math.min(pending(),Math.max(0,cash()-reserved())), free=()=>cash()-reserved()-titheReserve();
 const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const acc=key=>{if(!has(accounts,key))throw Error('Selecciona una cuenta existente.');return key};
 const goal=key=>{if(!has(goals,key))throw Error('Selecciona un bolsillo existente.');return key};
 const debt=key=>{if(!has(debts,key))throw Error('Selecciona una deuda existente.');return key};
 const out=(key,v)=>{key=acc(key);if(accounts[key]<v)throw Error('Saldo insuficiente en la cuenta.');accounts[key]-=v};
 const inCash=(key,v)=>{key=acc(key);accounts[key]=safeAdd(accounts[key],v)};
 const checkFree=(v,t)=>{if(v>free()&&!t.override)throw Error('El importe supera el dinero libre. Libera un bolsillo o confirma uso de reserva de diezmo.');if(v>cash()-reserved())throw Error('Parte del dinero está en bolsillos. Libera el ahorro antes de continuar.')};
 for(const t of (s.advanced?.chronological?s.transactions.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))):s.transactions)){
  if(asOf&&t.date>asOf)continue;
  if(!t||typeof t.id!=='string'||seen.has(t.id)||!validDate(t.date)||t.date>today()||!has(types,t.type))throw Error('Movimiento inválido o con fecha futura.');seen.add(t.id);let v=money(t.amount),r={...t,income:0,expense:0,cashIn:0,cashOut:0,generated:0,tithePaid:0,saved:0,principal:0};
  switch(t.type){
   case 'income': {let base=money(t.base??v,true),rate=t.rate??s.settings.titheRate;if(base>v||!Number.isFinite(rate)||rate<0||rate>100)throw Error('Base o tasa de diezmo inválida.');r.generated=money(Math.round(base*rate/100),true);due=safeAdd(due,r.generated);inCash(t.account,v);r.income=v;r.cashIn=v;break;}
   case 'expense':checkFree(v,t);out(t.account,v);r.expense=v;r.cashOut=v;break;
   case 'transfer':{if(t.account===t.to)throw Error('Las cuentas deben ser distintas.');let fee=money(t.fee??0,true);if(fee)checkFree(fee,t);out(t.account,safeAdd(v,fee));inCash(t.to,v);r.expense=fee;r.cashOut=fee;break;}
   case 'save':if(v>free())throw Error('No hay suficiente dinero libre para aportar.');goals[goal(t.goal)]=safeAdd(goals[t.goal],v);r.saved=v;break;
   case 'release':goal(t.goal);if(goals[t.goal]<v)throw Error('El bolsillo no tiene ese saldo.');goals[t.goal]-=v;r.saved=-v;break;
   case 'goalSpend':goal(t.goal);if(goals[t.goal]<v)throw Error('El bolsillo no tiene ese saldo.');out(t.account,v);goals[t.goal]-=v;r.saved=-v;r.expense=v;r.cashOut=v;break;
   case 'tithe':if(v>pending())throw Error('El pago supera el diezmo pendiente. Usa Ofrendas para donaciones adicionales.');if(v>cash()-reserved())throw Error('No hay saldo libre de bolsillos para entregar el diezmo.');out(t.account,v);paid=safeAdd(paid,v);r.tithePaid=v;r.cashOut=v;break;
   case 'loan':debt(t.debt);debts[t.debt]=safeAdd(debts[t.debt],v);inCash(t.account,v);r.cashIn=v;break;
   case 'credit':{debt(t.debt);let d=s.debts.find(d=>d.id===t.debt);let balance=safeAdd(debts[t.debt],v);if(d.kind==='Tarjeta'&&balance>d.limit)throw Error('La compra supera el cupo de la tarjeta.');debts[t.debt]=balance;r.expense=v;break;}
   case 'debtPay':{debt(t.debt);let p=money(t.principal??v,true);if(p>v||p>debts[t.debt])throw Error('Capital mayor al pago o saldo de deuda.');checkFree(v,t);out(t.account,v);debts[t.debt]-=p;r.principal=p;r.expense=v-p;r.cashOut=v;break;}
   case 'adjustIn':inCash(t.account,v);r.cashIn=v;break;
   case 'adjustOut':checkFree(v,t);out(t.account,v);r.cashOut=v;break;
  }
  if(cash()<reserved())throw Error('Los bolsillos no pueden superar el dinero existente.');rows.push(r);
 }
 const liability=Object.values(debts).reduce(safeAdd,0);
 return {accounts,goals,debts,rows,cash:cash(),reserved:reserved(),due,paid,pending:pending(),titheReserve:titheReserve(),free:free(),liability,net:cash()-liability};
}
function monthly(calc,month){let rows=calc.rows.filter(r=>r.date.startsWith(month)), gross={income:0,expense:0,cashIn:0,cashOut:0,generated:0,tithePaid:0,saved:0,principal:0},by=Object.create(null);for(let r of rows){for(let k of Object.keys(gross))gross[k]=safeAdd(gross[k],r[k]);if(r.expense){let c=r.type==='debtPay'?'Intereses':r.type==='transfer'?'Comisiones':r.category||'Otros';by[c]=safeAdd(by[c]||0,r.expense)}}return {...gross,by,rows,flow:gross.cashIn-gross.cashOut};}
function nextDue(date,frequency,anchor){let [y,m,d]=date.split('-').map(Number);if(frequency==='once')return null;if(frequency==='weekly'||frequency==='biweekly'){let dt=new Date(date+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+(frequency==='weekly'?7:14));return dt.toISOString().slice(0,10)}let step=frequency==='annual'?12:1;let newMonth=new Date(Date.UTC(y,m-1+step,1));let yy=newMonth.getUTCFullYear(),mm=newMonth.getUTCMonth()+1;let last=new Date(Date.UTC(yy,mm,0)).getUTCDate();return `${yy}-${String(mm).padStart(2,'0')}-${String(Math.min(anchor||d,last)).padStart(2,'0')}`}
function goalStatus(g,amount,now=today()){let gap=Math.max(0,g.target-amount),days=g.date?Math.ceil((Date.parse(g.date)-Date.parse(now))/86400000):null,months=days===null?null:Math.max(1,Math.ceil(days/30.4375));return {gap,progress:Math.min(100,amount/g.target*100),days,monthly:months===null||days<0?null:Math.ceil(gap/months)}}
const api={categories,types,id,today,validDate,blank,replay,monthly,nextDue,goalStatus};if(typeof module!=='undefined')module.exports=api;else root.Fin=api;
})(globalThis);
