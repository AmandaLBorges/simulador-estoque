'use strict';
(() => {
 const modes=['Disp MIS','LE','Real'];
 const today=simulationToday;
 const dateLabel=value=>new Date(value+'T12:00:00').toLocaleDateString('pt-BR');
 const popup=$('sales-popover');
 let anchor=null;
 const selector=$('scenario');
 selector.parentElement.firstChild.textContent='Cenário de venda';
 options(selector,modes);
 selector.value=state.scenario;
 if(D.validationStart){
  $('history-grid').closest('section').hidden=true;
  const period=document.querySelector('.filters input[value]');
  if(period)period.value='22/09 a 06/10';
  const chartSection=$('chart').closest('section');
  chartSection.querySelector('h2').textContent='Projeção a partir de 22/09';
  chartSection.querySelector('p').textContent=D.validationWarning;
  const oldChart=chart;
  chart=function(result,original){oldChart(result,original,Array.from({length:n},(_,i)=>i));};
 }
 const tableSection=$('grid').closest('section');
 tableSection.classList.add('simulation-table');
 document.querySelector('.filters').after(tableSection);
 document.querySelector('.editor-panel').hidden=true;
 tableSection.querySelector('.section-title').append($('saved'));
 const sourceDetails=$('source').closest('details');
 for(const id of ['bi-loaded','auto-status','scenario-note'])sourceDetails.append($(id));
 document.querySelector('.product-options').hidden=true;
 document.querySelector('.base-options').hidden=true;
 selector.parentElement.hidden=true;
 const controls=document.createElement('div');
 controls.className='scenario-controls';
 controls.innerHTML='<span class="eyebrow">CENÁRIO DE VENDA</span><div id="scenario-buttons" role="group" aria-label="Cenário de venda">'+modes.map(mode=>`<button type="button" data-scenario="${mode}" aria-pressed="false">${mode}</button>`).join('')+'</div><small id="scenario-period"></small>';
 selector.parentElement.after(controls);
 function syncButtons(){
  controls.querySelectorAll('button').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.scenario===state.scenario));});
  $('scenario-period').textContent=`A partir de ${dateLabel(today())} · abertura disponível: ${dateLabel(D.date)}`;
 }

 function closePopup(){if(anchor)anchor.removeAttribute('aria-describedby');anchor=null;popup.hidden=true;}
 // Ate 2026-09-28 esta funcao travava (readOnly) qualquer dia anterior a hoje, mesmo dentro da janela
 // carregada (abertura + 14 dias). Por pedido da usuaria, qualquer dia da janela agora e' editavel —
 // corrigir um recebimento de um dia passado precisa refletir no fechamento dos dias seguintes. A
 // tabela "Semana anterior · historico da fonte" continua so-leitura (nao tem campo de edicao; e' outro
 // modelo de dado, fora de state.movements).
 function limparDicaVenda(){
  document.querySelectorAll('[data-row="sale"], [data-edit-key="sale"]').forEach(input=>{input.removeAttribute('title');input.closest('label')?.removeAttribute('title');});
 }
 const previousRender=render,previousEditor=renderEditor;
 render=function(rebuild=false){closePopup();previousRender(rebuild);limparDicaVenda();syncButtons();};
 renderEditor=function(){previousEditor();limparDicaVenda();};
 function choose(mode){
  if(!modes.includes(mode)||mode===state.scenario)return;
  if(today()>day(n-1)){message('Sem datas disponíveis de hoje em diante. Atualize as fontes para iniciar a simulação.');return;}
  persist();
  selector.value=mode;
  select();
  editDay=Math.max(0,Math.min(n-1,Math.round((new Date(today()+'T12:00:00')-new Date(D.date+'T12:00:00'))/86400000)));
  renderEditor();describeScenario();syncButtons();
 }
 controls.addEventListener('click',event=>{const button=event.target.closest('[data-scenario]');if(button)choose(button.dataset.scenario);});
 selector.onchange=()=>choose(selector.value);

 function showPopup(input){
  closePopup();anchor=input;
  const index=input.dataset.day===undefined?editDay:Number(input.dataset.day);
  const loaded=record.bi?.days[day(index)],scenarios=loaded?.scenarios||{};
  const values=[['VMD',loaded?.vmd],['LE',scenarios.LE?.plannedSales],['Pedidos em aberto',loaded?.ordersOnScreen]];
  popup.innerHTML=`<strong>Vendas · ${dateLabel(day(index))}</strong><dl>${values.map(([name,value])=>`<div><dt>${name}</dt><dd>${value==null?'Sem dado':fmt(value)+' m³'}</dd></div>`).join('')}</dl><p>${day(index)<today()?'Anterior à simulação':`Cenário: <strong>${esc(state.scenario)}</strong>`}</p><p>Aplicado: <strong>${fmt(state.movements.sale[index])} m³</strong>${state.movements.sale[index]!==baseline.movements.sale[index]?' · editado':''}</p>${state.scenario==='Real'&&day(index)>D.bi.extractedAt.slice(0,10)?'<p>Valor aplicado com projeção futura.</p>':''}`;
  input.setAttribute('aria-describedby','sales-popover');
  popup.hidden=false;
  const rect=input.getBoundingClientRect(),width=popup.offsetWidth,height=popup.offsetHeight;
  popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
  popup.style.top=Math.max(8,rect.bottom+height+8<=innerHeight?rect.bottom+8:rect.top-height-8)+'px';
 }
 const salesInput=target=>target instanceof Element?(target.closest('[data-row="sale"], [data-edit-key="sale"]')||target.closest('td, label')?.querySelector('[data-row="sale"], [data-edit-key="sale"]')):null;
 document.addEventListener('pointerover',event=>{const input=salesInput(event.target);if(input)showPopup(input);});
 document.addEventListener('focusin',event=>{const input=salesInput(event.target);if(input){requestAnimationFrame(()=>{if(document.activeElement===input)showPopup(input);});}else closePopup();});
 document.addEventListener('pointerout',event=>{if(salesInput(event.target)&&document.activeElement!==event.target)closePopup();});
 document.addEventListener('pointerdown',event=>{const input=salesInput(event.target);if(input)showPopup(input);else if(!popup.contains(event.target))closePopup();});
 document.addEventListener('input',event=>{const input=salesInput(event.target);if(input)showPopup(input);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closePopup();});
 document.addEventListener('scroll',closePopup,true);
 window.addEventListener('resize',closePopup);
 editDay=Math.max(0,Math.min(n-1,Math.round((new Date(today()+'T12:00:00')-new Date(D.date+'T12:00:00'))/86400000)));
 renderEditor();syncButtons();
})();
