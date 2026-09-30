'use strict';
const $=id=>document.getElementById(id), E=window.StockEngine;let D=window.ESTOQUE_DATA;
const fmt=v=>v===null||v===undefined?'—':Math.round(v).toLocaleString('pt-BR');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=i=>{const d=new Date(D.date+'T12:00:00');d.setDate(d.getDate()+i);return d.toISOString().slice(0,10);};
const label=i=>new Date(day(i)+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
let record,state,baseline,n=15,timer;
function mergeSource(saved,current){const next=structuredClone(current),previous=saved.sourceBaseline;if(previous){for(const [k]of parameters)if(saved[k]!==previous[k])next[k]=saved[k];for(const [k]of E.rows)for(let i=0;i<30;i++)if(saved.movements[k][i]!==previous.movements[k][i])next.movements[k][i]=saved.movements[k][i];}else{for(const [k]of parameters)next[k]=saved[k];next.movements=structuredClone(saved.movements);}next.name=saved.name;return next;}
const parameters=[['opening','Estoque inicial / abertura'],['lastro','Lastro mínimo'],['min','Estoque mínimo'],['mid','Estoque médio'],['max','Estoque máximo'],['capacity','Capacidade física']];
function simulationToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function fresh(r){
 const scenario=$('scenario')?.value||'LE',today=simulationToday();
 const startIndex=Math.max(0,Math.round((new Date(today+'T12:00:00')-new Date(D.date+'T12:00:00'))/86400000));
 const switchIndex=Math.max(startIndex,Math.round((new Date(D.bi.inbound.switchDate+'T12:00:00')-new Date(D.date+'T12:00:00'))/86400000));
 const movements=Object.fromEntries(E.rows.map(([k])=>[k,Array(30).fill(0)]));
 for(let i=0;i<15;i++){
  const loaded=r.bi?.days[day(i)];if(!loaded)continue;
  const future=day(i)>=today;
  for(const k of ['sale','fob','cif','pump','transferIn','transferOut']){
   const mis=future&&scenario==='Inbound + MIS'&&i>=switchIndex&&['fob','cif','pump'].includes(k);
   movements[k][i]=(mis?loaded.inboundMis?.[k]:loaded[k])??0;
  }
  // Datas anteriores usam a mesma base em todos os cenarios.
  if(!future)continue;
  if(['Disp MIS','Inbound + MIS'].includes(scenario))movements.sale[i]=loaded.scenarios?.[scenario]?.availability??0;
  if(scenario==='Real'){
   if(day(i)<=D.bi.extractedAt.slice(0,10))movements.sale[i]=loaded.scenarios?.Real?.actualSales??0;
  }
 }
 return {version:1,id:r.id,date:D.date,sourceRevision:D.revision,name:'Minha simulação',opening:r.opening,lastro:r.bi?.days[day(0)]?.scenarios?.[scenario]?.lastro??r.policy?.lastro??null,min:r.policy?.min??null,mid:r.policy?.mid??null,max:r.policy?.max??null,capacity:r.policy?.capacity??null,clamp:false,scenario,switchIndex,movements};
}
function key(){return 'nexta-stock-auto-v2:'+D.date+':'+record.id+':'+($('scenario')?.value||'LE');}
function sourceNote(k,i){const loaded=record.bi?.days[day(i)],mode=state.scenario;if(['received','planned','purchase','loanIn','loanOut'].includes(k))return 'Ajuste adicional manual; não repetir um volume já importado.';if(['fob','cif'].includes(k)){const mis=mode==='Inbound + MIS'&&i>=state.switchIndex;return `${mis?'Cadências MIS ('+k.toUpperCase()+')':'CSV do portal, com filtro de status e data de descarga'} · ${fmt((mis?loaded?.inboundMis[k]:loaded?.[k])??0)} m³ · ${day(i)}`;}if(k==='sale'&&['Disp MIS','Inbound + MIS'].includes(mode))return `Disp. MIS · ${fmt(loaded?.scenarios?.[mode]?.availability)} m³`;if(k==='sale'&&mode==='Real'&&day(i)<=D.bi.extractedAt.slice(0,10))return `Vendas Real · ${fmt(loaded?.scenarios?.Real?.actualSales)} m³ nos pedidos do SAP`;const field=k==='sale'?'vmd':k;if(loaded?.missingModelRow)return 'Sem linha de dados para este recorte nas fontes; valor inicial zero.';return `${D.bi?.formulas[field]??D.bi?.formulas[k]??k} · ${loaded?.[field]==null?'sem valor na fonte, considerado zero na simulação':fmt(loaded[field])+' m³ importados'} · ${day(i)}`;}
function message(s){$('message').textContent=s;clearTimeout(timer);timer=setTimeout(()=>$('message').textContent='',7000);}
function persist(){try{state.sourceBaseline=baseline;localStorage.setItem(key(),JSON.stringify(state));$('saved').textContent='SALVO NESTE NAVEGADOR';}catch{$('saved').textContent='SEM SALVAMENTO LOCAL';message('Não foi possível salvar no navegador. Exporte o JSON para guardar suas alterações.');}}
function options(el,values){el.replaceChildren(...values.map(v=>new Option(v,v)));}
function products(){options($('product'),[...new Set(D.records.filter(r=>r.base===$('base').value).map(r=>r.product))]);select();}
function select(){record=D.records.find(r=>r.base===$('base').value&&r.product===$('product').value);
 // Filtro de regiao pode deixar a lista de bases vazia (ex.: nao ha base dessa regiao pra este login);
 // sem guarda, fresh(undefined) quebra o resto do render e trava a tela com os chips desatualizados.
 if(!record){for(const id of ['grid','cards','alerts','chart','semana-progresso'])$(id).innerHTML='';if($('bi-measures'))$('bi-measures').innerHTML='';message('Nenhuma base disponível para este filtro. Ajuste a região ou escolha outra base.');return;}
 baseline=fresh(record);state=structuredClone(baseline);try{const saved=localStorage.getItem(key());if(saved){const candidate=E.validate(JSON.parse(saved));if(candidate.id===record.id&&candidate.date===D.date){state=mergeSource(candidate,baseline);}}}catch{message('Cenário local inválido ou indisponível. Abertura original carregada.');}E.rows.find(r=>r[0]==='sale')[1]=state.scenario==='LE'?'Vendas · LE vigente':state.scenario==='Real'?'Vendas Real / projeção futura':'Vendas · Disp. MIS';premises();render(true);}
// Politica de estoque (abertura/lastro/minimo/medio/maximo/capacidade): fixa, vem da planilha e nao
// e' editavel pela simulacao (pedido da usuaria, 2026-09-28) — so os movimentos (entradas/saidas)
// continuam editaveis, na tabela e no editor por dia.
// record.aberturaEm: dia de onde veio a abertura dessa base+produto (pode ser mais antigo que D.date —
// ver JANELA_FALLBACK_ABERTURA_DIAS em atualizar_dados.py). Avisa na tela quando nao e' de hoje.
function aberturaAtrasada(){return record.aberturaEm && record.aberturaEm!==D.date;}
function premises(){$('name').value=state.name;$('clamp').checked=state.clamp;$('premises').innerHTML=parameters.map(([k,l])=>`<label>${l}<input type="number" readonly data-param="${k}" aria-label="${l}" value="${state[k]===null?'':Math.round(state[k])}" placeholder="Ausente na fonte" title="Valor fixo, carregado da planilha de política."><small>${k==='opening'?(aberturaAtrasada()?`⚠ Abertura de ${new Date(record.aberturaEm+'T12:00:00').toLocaleDateString('pt-BR')} (não é de hoje)`:'Abertura importada'):`Política: ${fmt(baseline[k])} m³`}</small></label>`).join('');}
function history(i){return D.history?.[day(i)]?.[record.base+'|'+record.product];}
function status(v){return E.stockBand(v,state);}
function render(rebuild=false){const result=E.calculate(state,n),original=E.calculate(baseline,n);
 $('source').textContent=`Abertura real de ${label(0)}/${D.date.slice(0,4)} • ${record.base} • ${record.product}. Próximos 14 dias preenchidos com o LE vigente, FOB/CIF e programação MIS. Extração: ${D.bi.extractedAt.replace('T',' ')}. Todos os volumes em m³.`;
 $('provenance').textContent=`Fonte: ${D.source} | Aba: ${record.sheet} | Linha: ${record.row}. Abertura original: ${fmt(record.opening)} m³. Histórico extraído das planilhas diárias, sem edição. Ausência de informação é exibida como “—”.`;
 semanaProgresso();
 const low=Math.min(...result.map(x=>Math.min(x.opening,x.close))),last=result.at(-1).close;
 const first=result.findIndex(x=>['danger','warn'].includes(status(x.opening))||['danger','warn'].includes(status(x.close)));
 $('cards').innerHTML=[['Abertura de referência',fmt(state.opening),'m³ · início do dia'],['Fechamento ao fim de 14 dias',fmt(last),`m³ · diferença de ${fmt(last-original.at(-1).close)} vs. original`],['Menor estoque no período',fmt(low),'m³ · abertura e fechamento'],['Primeira atenção',first<0?'Sem alerta de limite':label(first),first<0?'Verifique os limites e campos não preenchidos':'Confira os pontos de atenção abaixo']].map(([title,value,sub],i)=>`<article class="card"><small>${title}</small><strong class="${i===2?status(low):''}">${value}</strong><em>${sub}</em></article>`).join('');
 const offsets=Array.from({length:n},(_,i)=>i);
 if(rebuild){let html='<thead><tr><th>Movimento / m³</th>'+offsets.map(i=>`<th class="${i<0?'history':i===0?'today':''}">${label(i)}<br><small>${i<0?'Histórico':i===0?'Referência':'Simulação'}</small></th>`).join('')+'</tr></thead><tbody>';
 const outputRow=(key,name)=>`<tr class="total"><th>${name}</th>${offsets.map(i=>`<td data-result="${key}" data-day="${i}"></td>`).join('')}</tr>`;
 html+=outputRow('opening','Estoque inicial · abertura');html+=outputRow('lastro','Lastro mínimo');html+=outputRow('openingNet','Abertura menos lastro');
 for(const [k,l,sign] of E.rows){html+=`<tr class="${sign>0?'entry':'exit'}"><th>${sign>0?'+':'−'} ${l}</th>`+offsets.map(i=>i<0?`<td class="history" title="${k==='sale'?'Faturamento pendente de integração':'Informação histórica da fonte'}">${fmt(history(i)?.[k])}</td>`:`<td><input type="number" step="any" min="0" data-row="${k}" data-day="${i}" aria-label="${l} ${label(i)}" value="${Math.round(state.movements[k][i])}" title="${esc(sourceNote(k,i))}"></td>`).join('')+'</tr>';}
 for(const [k,l] of [['incoming','Total de entradas'],['outgoing','Total de saídas'],['close','Fechamento projetado'],['available','Fechamento menos lastro']])html+=outputRow(k,l);
 $('grid').innerHTML=html+'</tbody>';}
 document.querySelectorAll('[data-result]').forEach(td=>{const i=+td.dataset.day,k=td.dataset.result;const v=i<0?(k==='opening'?history(i)?.opening:null):result[i][k];td.textContent=fmt(v);td.className=(i<0?'history ': '')+(['opening','close','available'].includes(k)?(v==null?'':status(v)):'');});
 document.querySelectorAll('[data-row]').forEach(input=>input.parentElement.classList.toggle('edited',state.movements[input.dataset.row][+input.dataset.day]!==baseline.movements[input.dataset.row][+input.dataset.day]));
 chart(result,original,Array.from({length:7+n},(_,i)=>i-7));alerts(result);
}
// record.bi.semana: {leSemana, realSemana} — vem da reprojecao do VMD (cidade+familia de produto);
// so' existe pros 4 produtos cobertos (Gasolina, Diesel S10, Diesel S500, Hidratado) e quando o banco
// de faturamento respondeu na ultima publicacao.
function semanaProgresso(){
 const el=$('semana-progresso');if(!el)return;
 const semana=record.bi.semana;
 if(!semana||!(semana.leSemana>0)){el.innerHTML='';return;}
 const pct=semana.realSemana/semana.leSemana,estourou=pct>1;
 const cor=estourou?'#8DC830':pct>=0.7?'#8DC830':pct>=0.35?'#F97316':'#FF6B5F';
 el.innerHTML=`<div class="semana-progresso-rotulo">Ritmo da semana: <strong>${fmt(semana.realSemana)} de ${fmt(semana.leSemana)} m³ vendidos</strong> (${Math.round(pct*100)}%)${estourou?' · já passou da meta da semana':''}</div><div class="semana-progresso-barra"><div style="width:${Math.min(pct,1)*100}%;background:${cor}"></div></div>`;
}
function chart(result,original,offsets){const W=1200,H=250,L=60,R=20,T=16,B=32;const values=result.flatMap(x=>[x.opening,x.close]).concat(original.map(x=>x.close),offsets.filter(i=>i<0).map(i=>history(i)?.opening).filter(v=>v!=null),parameters.slice(1).map(([k])=>state[k]).filter(v=>v!==null),[0]);const lo=Math.min(...values),hi=Math.max(...values),span=Math.max(hi-lo,1),y=v=>T+(hi+span*.1-v)/(span*1.2)*(H-T-B),x=i=>L+(i+7+.5)*(W-L-R)/offsets.length;
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico de abertura e projeção de estoque em metros cúbicos"><rect x="${L}" y="0" width="${x(0)-L-(W-L-R)/offsets.length/2}" height="${H-B}" fill="#ffffff04"/>`;
 for(let j=0;j<5;j++){const v=lo+(hi-lo)*j/4;svg+=`<path d="M${L} ${y(v)}H${W-R}" stroke="#314A32"/><text x="${L-8}" y="${y(v)+4}" fill="#7FA069" text-anchor="end" font-size="11">${fmt(v)}</text>`;}
 for(const [k,color] of [['min','#FF6B5F'],['capacity','#38BDF8'],['lastro','#F97316'],['max','#8DC830']])if(state[k]!==null)svg+=`<path d="M${L} ${y(state[k])}H${W-R}" stroke="${color}" stroke-dasharray="4 5"><title>${k}: ${fmt(state[k])} m³</title></path>`;
 for(const i of offsets){const v=i<0?history(i)?.opening:result[i].opening;if(v!=null)svg+=`<rect x="${x(i)-12}" y="${Math.min(y(v),y(0))}" width="24" height="${Math.max(1,Math.abs(y(v)-y(0)))}" fill="${i<0?'#527568':status(v)==='danger'?'#FF6B5F':status(v)==='warn'?'#F97316':'#14B8A6'}" opacity=".75"><title>${label(i)} · Abertura: ${fmt(v)} m³</title></rect>`;svg+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" fill="#BFD4A8" font-size="11">${label(i)}</text>`;}
 for(const [series,color,dash] of [[original,'#7FA069','5 5'],[result,'#EEFE7A','']])svg+=`<polyline points="${series.map((v,i)=>`${x(i)},${y(v.close)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}"/>`;
 result.forEach((v,i)=>{svg+=`<circle cx="${x(i)}" cy="${y(v.close)}" r="4" fill="${status(v.close)==='danger'?'#FF6B5F':status(v.close)==='warn'?'#F97316':'#EEFE7A'}"><title>${label(i)} · Fechamento: ${fmt(v.close)} m³</title></circle>`;});$('chart').innerHTML=svg+'</svg>';}
function alerts(result){const items=['O histórico de vendas realizadas não é carregado nesta versão; as vendas futuras usam o LE vigente e, hoje, o maior entre o LE e os pedidos do SAP.',`Valores futuros carregados das fontes (${D.bi.extractedAt.replace('T',' ')}). Portal carregado até ${D.bi.coverage.portal_max.slice(0,10)}; cadências MIS até ${D.bi.coverage.cadencia_max.slice(0,10)}.`];if(parameters.slice(1).some(([k])=>state[k]===null))items.push('A planilha de política tem campos vazios neste recorte; os alertas correspondentes estão indisponíveis.');result.forEach((r,i)=>{const low=Math.min(r.opening,r.close),high=Math.max(r.opening,r.close),a=[];if(low<0)a.push(`déficit físico de ${fmt(-low)} m³`);if(state.lastro!==null&&low<state.lastro)a.push('estoque abaixo do lastro');if(state.min!==null&&low<=state.min)a.push(`no mínimo ou abaixo em ${fmt(state.min-low)} m³`);if(state.capacity!==null&&high>state.capacity)a.push(`capacidade excedida em ${fmt(high-state.capacity)} m³`);else if(state.max!==null&&high>state.max)a.push('acima do estoque máximo');if(a.length)items.push(label(i)+': '+a.join(' • '));});$('alerts').innerHTML=items.map(s=>`<div class="alert">${esc(s)}</div>`).join('');}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('base').onchange=products;$('product').onchange=select;
$('grid').oninput=e=>{const input=e.target,k=input.dataset.row;if(!k)return;if(!input.validity.valid||input.value===''||!Number.isFinite(input.valueAsNumber))return;try{E.setMovement(state,k,+input.dataset.day,input.valueAsNumber);}catch(err){message(err.message);input.value=Math.round(state.movements[k][+input.dataset.day]);return;}persist();render();};
$('grid').addEventListener('focusout',e=>{const input=e.target;if(input.dataset.row)input.value=Math.round(state.movements[input.dataset.row][+input.dataset.day]);});
$('clamp').onchange=()=>{state.clamp=$('clamp').checked;persist();render();};$('name').onchange=()=>{state.name=$('name').value;persist();};
$('reset').onclick=()=>{state=structuredClone(baseline);persist();premises();render(true);message('Recorte restaurado aos dados da fonte.');};
$('save').onclick=()=>download('cenario-estoque-'+D.date+'.json',JSON.stringify(state,null,2),'application/json');
$('export').onclick=()=>{const result=E.calculate(state,n),csv=[['Data','Tipo','Base','Produto','Abertura m3',...E.rows.map(r=>r[1]),'Fechamento m3']];for(let i=-7;i<n;i++)csv.push([day(i),i<0?'Historico':'Simulacao',record.base,record.product,i<0?history(i)?.opening:result[i].opening,...E.rows.map(([k])=>i<0?history(i)?.[k]:state.movements[k][i]),i<0?null:result[i].close]);download('estoque-'+D.date+'.csv','\uFEFF'+csv.map(row=>row.map(v=>'"'+String(typeof v==='number'?v.toFixed(2).replace('.',','):v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8');};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error('Arquivo maior que 2 MB.');const candidate=E.validate(JSON.parse(await file.text()));const r=D.records.find(r=>r.id===candidate.id);if(!r||candidate.date!==D.date)throw Error('O cenário precisa corresponder à data e ao recorte deste snapshot.');$('base').value=r.base;products();$('product').value=r.product;select();state=candidate;persist();premises();render(true);message('Cenário importado.');}catch(err){message(err.message);}e.target.value='';};
// Filtro de regiao (SP/MG+RJ/Centro-Oeste): so aparece quando ha SIM_CLOUD.regionOf (versao hospedada
// com Firebase); no modo local (sem login) nao ha regiao cadastrada, entao o campo fica escondido.
function basesPermitidas(){const todas=[...new Set(D.records.map(r=>r.base))];const regiao=$('regiao-filtro')?.value;return regiao&&window.SIM_CLOUD?.regionOf?todas.filter(b=>window.SIM_CLOUD.regionOf(b)===regiao):todas;}
function refreshBaseOptions(){options($('base'),basesPermitidas().sort((a,b)=>a.localeCompare(b,'pt-BR')));if(typeof renderChips==='function')renderChips();}
// So aparece pra quem enxerga mais de uma regiao (administrador/leitura); regional ja so ve a propria
// regiao, entao filtrar por outra sempre daria lista vazia.
const perfilVeTudo=window.SIM_AUTH?.profile?.admin===true||window.SIM_AUTH?.profile?.perfil==='leitura';
if(perfilVeTudo)$('regiao-filtro-label').hidden=false;
$('regiao-filtro')?.addEventListener('change',()=>{refreshBaseOptions();products();});
refreshBaseOptions();const preferred=D.records.find(r=>r.base.includes('Duque')&&r.product==='Gasolina A');if(preferred)$('base').value=preferred.base;products();if(preferred){$('product').value=preferred.product;select();}$('date').value=D.date;
