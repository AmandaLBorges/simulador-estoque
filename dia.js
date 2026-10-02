'use strict';
// Visao do dia: consolidado dos cenarios salvos pela equipe, em duas abas.
// - "Riscos da semana": junta os 7 dias da semana selecionada e mostra, por base+deposito+produto,
//   a versao mais recente salva na semana (visao gerencial resumida, sem grafico de biblioteca externa).
// - "Por data": tabela de um dia so, igual existia antes.
// So le o que ja foi gravado (registros imutaveis) — nao recalcula nada, nao gerencia estado da simulacao.
(() => {
  const cloud = window.SIM_CLOUD;
  const view = $('dia-view'), abrir = $('ver-dia'), fechar = $('dia-fechar');
  const rotuloSituacao = {ok: 'OK', atencao: 'Atenção', critico: 'Crítico'};
  const peso = {critico: 0, atencao: 1, ok: 2};
  abrir.hidden = false;

  function abrirCenario(base, produto, cenario) {
    view.hidden = true;
    const registro = D.records.find(r => r.base === base);
    if (registro) { $('cidade').value = cidadeDe(registro); refreshDepositoOptions(); $('deposito').value = depositoDe(registro); refreshEmpresaOptions(); $('empresa').value = empresaDe(registro); }
    products();
    if ([...$('product').options].some(o => o.value === produto)) $('product').value = produto;
    $('scenario').value = cenario; select();
  }

  // ---- Abas ----
  const tabs = view.querySelectorAll('[data-dia-tab]');
  const paineis = {semana: $('semana-view'), data: $('data-view')};
  tabs.forEach(botao => botao.onclick = () => {
    tabs.forEach(b => b.setAttribute('aria-selected', String(b === botao)));
    for (const [nome, painel] of Object.entries(paineis)) painel.hidden = nome !== botao.dataset.diaTab;
    if (botao.dataset.diaTab === 'semana') renderSemana(); else renderDia();
  });

  // ================= Por data =================
  const campoData = $('dia-data'), campoRegiaoDia = $('dia-regiao'), campoBaseDia = $('dia-base'),
    campoSituacaoDia = $('dia-situacao'), corpoDia = $('dia-tbody'), statusDia = $('dia-status');
  campoData.value = D.date;
  let geracaoDia = 0;

  async function linhasDoDia(dia) {
    const arvore = await cloud.listDay(dia);
    const linhas = [];
    for (const porChave of Object.values(arvore || {})) {
      for (const chaveNode of Object.values(porChave)) {
        const versoes = Object.values(chaveNode.versoes || {});
        if (!versoes.length) continue;
        linhas.push(versoes.reduce((a, b) => (a.versao > b.versao ? a : b)));
      }
    }
    return linhas;
  }

  async function renderDia() {
    const minha = ++geracaoDia;
    statusDia.textContent = 'Carregando…'; corpoDia.innerHTML = '';
    const dia = campoData.value || D.date;
    let itens;
    try { itens = await linhasDoDia(dia); }
    catch (error) { if (minha === geracaoDia) statusDia.textContent = `Não foi possível carregar: ${error.message}`; return; }
    if (minha !== geracaoDia) return;
    const regiao = campoRegiaoDia.value, base = campoBaseDia.value.trim().toLowerCase(), situacao = campoSituacaoDia.value;
    itens = itens.filter(it => (!regiao || cloud.regionOf(it.base) === regiao)
      && (!base || it.base.toLowerCase().includes(base))
      && (!situacao || it.indicadores.situacao === situacao));
    itens.sort((a, b) => peso[a.indicadores.situacao] - peso[b.indicadores.situacao] || a.base.localeCompare(b.base));
    if (!itens.length) { statusDia.textContent = 'Nenhuma visão salva para este dia com os filtros atuais.'; return; }
    const resumo = itens.reduce((c, it) => ({...c, [it.indicadores.situacao]: (c[it.indicadores.situacao] || 0) + 1}), {});
    statusDia.textContent = `${itens.length} visão(ões) · ${resumo.critico || 0} crítica(s) · ${resumo.atencao || 0} em atenção · ${resumo.ok || 0} ok.`;
    corpoDia.innerHTML = itens.map(it => `<tr class="dia-${it.indicadores.situacao}">
      <td>${esc(it.base)}</td><td>${esc(it.deposito || '—')}</td><td>${esc(it.produto)}</td><td>${esc(it.cenario)}</td>
      <td>${rotuloSituacao[it.indicadores.situacao]}</td>
      <td>${fmt(it.indicadores.menorEstoque)}</td>
      <td>${it.indicadores.diaMenorEstoque ? new Date(it.indicadores.diaMenorEstoque + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td>${it.indicadores.diasCritico}</td><td>${it.indicadores.diasAtencao}</td>
      <td>v${it.versao}</td>
      <td>${esc(it.autorNome)}${it.motivo ? `<br><small>${esc(it.motivo)}</small>` : ''}</td>
      <td><button type="button" data-abrir="${esc(it.base)}|${esc(it.produto)}|${esc(it.cenario)}">Abrir</button></td>
    </tr>`).join('');
  }

  corpoDia.addEventListener('click', event => {
    const botao = event.target.closest('[data-abrir]'); if (!botao) return;
    const [base, produto, cenario] = botao.dataset.abrir.split('|');
    abrirCenario(base, produto, cenario);
  });
  [campoData, campoRegiaoDia, campoSituacaoDia].forEach(el => el.onchange = renderDia);
  let atrasoDia;
  campoBaseDia.oninput = () => { clearTimeout(atrasoDia); atrasoDia = setTimeout(renderDia, 250); };

  // ================= Riscos da semana =================
  const pills = $('semana-pills'), botaoAnterior = $('semana-anterior'), botaoProxima = $('semana-proxima'),
    campoRegiaoSemana = $('semana-regiao'), campoBaseSemana = $('semana-base'), campoSituacaoSemana = $('semana-situacao'),
    statusSemana = $('semana-status'), barra = $('semana-barra'), lista = $('semana-lista');
  let semanaOffset = 0; // 0 = semana atual (calendario, segunda a domingo), a partir de hoje de verdade
  let geracaoSemana = 0;

  function segundaFeira(data) {
    const d = new Date(data); d.setHours(12, 0, 0, 0);
    const diasDesdeSegunda = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diasDesdeSegunda);
    return d;
  }
  function isoData(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function numeroSemanaISO(data) {
    const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
    const diaSemana = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diaSemana + 3);
    const primeiraQuinta = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const diffSemanas = Math.round((d - primeiraQuinta) / (7 * 86400000));
    return diffSemanas + 1;
  }
  function diasDaSemana(segunda) {
    return Array.from({length: 7}, (_, i) => { const d = new Date(segunda); d.setDate(d.getDate() + i); return isoData(d); });
  }
  function segundaComOffset(offset) {
    const base = segundaFeira(new Date());
    base.setDate(base.getDate() + offset * 7);
    return base;
  }

  function renderPills() {
    const hojeSegunda = segundaFeira(new Date());
    pills.innerHTML = '';
    for (let i = -2; i <= 2; i++) {
      const offset = semanaOffset + i;
      const segunda = segundaComOffset(offset);
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = String(numeroSemanaISO(segunda));
      const dias = diasDaSemana(segunda);
      botao.title = `${dias[0]} a ${dias[6]}`.split('-').join('/');
      if (offset === semanaOffset) botao.classList.add('active');
      if (segunda.getTime() === hojeSegunda.getTime()) botao.classList.add('hoje');
      botao.onclick = () => { semanaOffset = offset; renderSemana(); };
      pills.appendChild(botao);
    }
  }

  async function linhasDaSemana(dias) {
    const porDia = await cloud.listRange(dias);
    // Salvos: a versao mais recente da semana por base+deposito+produto, QUALQUER cenario (nao separa
    // mais por cenario — pra visao gerencial, uma linha por base+produto e' o que faz sentido).
    const salvos = new Map();
    for (const dia of dias) {
      const arvore = porDia[dia] || {};
      for (const porChave of Object.values(arvore)) {
        for (const chaveNode of Object.values(porChave)) {
          const versoes = Object.values(chaveNode.versoes || {});
          if (!versoes.length) continue;
          const ultima = versoes.reduce((a, b) => (a.versao > b.versao ? a : b));
          const chaveGlobal = `${ultima.base}|${ultima.deposito || ''}|${ultima.produto}`;
          const atual = salvos.get(chaveGlobal);
          if (!atual || (ultima.atualizadoEm || 0) > (atual.atualizadoEm || 0)) salvos.set(chaveGlobal, {...ultima, dia, salvo: true});
        }
      }
    }
    // Cobertura completa (pedido da usuaria, 2026-10-01: "considere o cenario do dia, caso salvo; se
    // nao for salvo, considere o cenario padrao, pela simulacao do LE" — antes so' aparecia o que
    // alguem tinha salvo, ficando vazio a maior parte do tempo). Toda base+deposito+produto do
    // snapshot atual entra na lista: usa o salvo quando existir essa semana, senao calcula o LE
    // padrao na hora (sem gravar nada, sem precisar de ninguem ter salvo antes).
    const vistos = new Set(), linhas = [];
    for (const r of D.records) {
      const deposito = r.bi?.emp_dep || '';
      const chaveGlobal = `${r.base}|${deposito}|${r.product}`;
      if (vistos.has(chaveGlobal)) continue;
      vistos.add(chaveGlobal);
      // % do LE da semana ja' vendido (pedido da usuaria, 2026-10-01) — vem do mesmo campo usado na
      // barrinha "Ritmo da semana"; so' existe pros 4 produtos cobertos pela reprojecao. Preenchido
      // pro registro ATUAL (hoje), independente de ser um item salvo ou calculado agora.
      const semana = r.bi?.semana && r.bi.semana.leSemana > 0 ? r.bi.semana : null;
      const existente = salvos.get(chaveGlobal);
      if (existente) { linhas.push({...existente, semana}); continue; }
      try {
        const content = fresh(r, 'LE'), resultado = E.calculate(content, n), indicadores = window.SIM_INDICATORS(content);
        const diaIdx = indicadores.diaMenorEstoque == null ? null
          : Math.round((new Date(indicadores.diaMenorEstoque + 'T12:00:00') - new Date(D.date + 'T12:00:00')) / 86400000);
        const fluxoDia = diaIdx != null && resultado[diaIdx] ? {incoming: resultado[diaIdx].incoming, outgoing: resultado[diaIdx].outgoing} : null;
        linhas.push({base: r.base, deposito, produto: r.product, cenario: 'LE', salvo: false, indicadores, fluxoDia, semana});
      } catch { /* registro sem dado suficiente pro calculo (ex.: sem abertura); ignora */ }
    }
    return linhas;
  }
  // Texto curto explicando a causa (pedido da usuaria, 2026-10-01: "resumo de causas" pra diretoria
  // bater o olho). So' descreve o que da' pra ver nos dados — nao tenta adivinhar motivo de negocio.
  function causaTexto(it) {
    const ind = it.indicadores;
    if (ind.situacao === 'ok') return null;
    const partes = [];
    const diaFmt = ind.diaMenorEstoque ? new Date(ind.diaMenorEstoque + 'T12:00:00').toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'}) : null;
    partes.push(`menor estoque ${fmt(ind.menorEstoque)} m³${diaFmt ? ' em ' + diaFmt : ''}`);
    if (it.fluxoDia) {
      const {incoming, outgoing} = it.fluxoDia;
      if (outgoing > incoming) partes.push(`saiu ${fmt(outgoing)} m³ e entrou só ${fmt(incoming)} m³ nesse dia`);
      else if (incoming === 0) partes.push('nenhuma entrada programada nesse dia');
    }
    if (it.semana) partes.push(`${Math.round(it.semana.realSemana / it.semana.leSemana * 100)}% do LE da semana já vendido`);
    if (ind.primeiraRuptura) partes.push(`ruptura a partir de ${new Date(ind.primeiraRuptura + 'T12:00:00').toLocaleDateString('pt-BR')}`);
    return partes.join(' · ');
  }
  // Urgencia (pedido da usuaria, 2026-10-02: "quanto mais proximo de termos ruptura e maior for o
  // volume dessa ruptura" — usado pra ranquear o TOP 10, porque 87 criticos de uma vez "fica confuso
  // pra diretores e gerentes tomarem acao"). Deficit (m³ negativos) dividido pelos dias ate' a ruptura
  // — deficit grande chegando logo pesa mais que deficit grande daqui a 2 semanas.
  function urgencia(it) {
    const ind = it.indicadores;
    if (ind.situacao === 'ok') return -Infinity;
    const diaRuptura = ind.primeiraRuptura || ind.diaMenorEstoque;
    const diasAte = diaRuptura ? Math.max(0, Math.round((new Date(diaRuptura + 'T12:00:00') - new Date(D.date + 'T12:00:00')) / 86400000)) : 14;
    const deficit = Math.max(0, -ind.menorEstoque);
    return deficit / (diasAte + 1);
  }

  async function renderSemana() {
    const minha = ++geracaoSemana;
    renderPills();
    statusSemana.textContent = 'Carregando…'; barra.innerHTML = ''; lista.innerHTML = '';
    const segunda = segundaComOffset(semanaOffset), dias = diasDaSemana(segunda);
    let itens;
    try { itens = await linhasDaSemana(dias); }
    catch (error) { if (minha === geracaoSemana) statusSemana.textContent = `Não foi possível carregar: ${error.message}`; return; }
    if (minha !== geracaoSemana) return;
    const regiao = campoRegiaoSemana.value, base = campoBaseSemana.value.trim().toLowerCase(), situacao = campoSituacaoSemana.value;
    itens = itens.filter(it => (!regiao || cloud.regionOf(it.base) === regiao)
      && (!base || it.base.toLowerCase().includes(base))
      && (!situacao || it.indicadores.situacao === situacao));
    itens.sort((a, b) => peso[a.indicadores.situacao] - peso[b.indicadores.situacao] || urgencia(b) - urgencia(a) || a.base.localeCompare(b.base));
    const semanaNum = numeroSemanaISO(segunda);
    const periodo = `${new Date(dias[0] + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(dias[6] + 'T12:00:00').toLocaleDateString('pt-BR')}`;
    if (!itens.length) {
      statusSemana.textContent = `Semana ${semanaNum} (${periodo}): nenhuma base encontrada com os filtros atuais.`;
      return;
    }
    const resumo = itens.reduce((c, it) => ({...c, [it.indicadores.situacao]: (c[it.indicadores.situacao] || 0) + 1}), {});
    const salvos = itens.filter(it => it.salvo).length;
    // So' os 10 piores casos entram na lista (pedido da usuaria, 2026-10-02: "fica confusa pra
    // diretores e gerentes tomarem ação" com os 87 criticos de uma vez) — ranqueados por urgencia()
    // (deficit x proximidade da ruptura), dentro da ordem critico > atencao > ok ja aplicada acima.
    // O status e a barra continuam mostrando a CONTAGEM TOTAL (contexto), so' a lista fica curta.
    const top10 = itens.slice(0, 10);
    statusSemana.textContent = `Semana ${semanaNum} (${periodo}) · ${itens.length} base(s) no total — `
      + `${resumo.critico || 0} crítica(s) · ${resumo.atencao || 0} em atenção · ${resumo.ok || 0} ok `
      + `· ${salvos} salva(s) pela equipe, ${itens.length - salvos} calculada(s) agora pelo LE padrão. `
      + `Mostrando os 10 piores casos (mais urgentes), de ${itens.length}.`;
    barra.innerHTML = ['critico', 'atencao', 'ok'].filter(s => resumo[s]).map(s =>
      `<span class="${s}" style="flex:${resumo[s]}">${resumo[s]}</span>`).join('');
    // Resumo executivo em texto (pedido da usuaria: "consolidar em formato de texto, com as principais
    // causas, pra diretoria bater o olho") — os mesmos top 10 que aparecem nos cards abaixo, nao mais
    // so' os criticos truncados em 8; agora resumo e cards mostram exatamente a mesma lista.
    const resumoEl = $('semana-resumo');
    const piores = top10.filter(it => it.indicadores.situacao !== 'ok');
    resumoEl.innerHTML = !piores.length ? '' : `<p><strong>Top ${piores.length} caso(s) mais urgente(s) esta semana` +
      `${itens.length > piores.length ? ` (de ${resumo.critico || 0} crítica(s) + ${resumo.atencao || 0} em atenção)` : ''}:</strong></p><ul>`
      + piores.map(it => `<li><strong>${esc(it.base)}</strong> (${esc(it.produto)}) — ${esc(causaTexto(it))}</li>`).join('') + '</ul>';
    lista.innerHTML = top10.map(it => `<div class="card dia-${it.indicadores.situacao}">
      <h3>${esc(it.base)}</h3>
      <small>${esc(it.deposito || '—')} · ${esc(it.produto)} · ${esc(it.cenario)}</small>
      <p><strong>${rotuloSituacao[it.indicadores.situacao]}</strong> — ${esc(causaTexto(it) || `menor estoque ${fmt(it.indicadores.menorEstoque)} m³`)}</p>
      ${it.semana ? `<small>${Math.round(it.semana.realSemana / it.semana.leSemana * 100)}% do LE da semana vendido (${fmt(it.semana.realSemana)} de ${fmt(it.semana.leSemana)} m³)</small>` : ''}
      <small>${it.salvo ? `Salvo em ${new Date(it.dia + 'T12:00:00').toLocaleDateString('pt-BR')} · v${it.versao} · ${esc(it.autorNome)}` : 'Não salvo · LE padrão calculado agora'}</small>
      <div><button type="button" data-abrir="${esc(it.base)}|${esc(it.produto)}|${esc(it.cenario)}">Abrir</button></div>
    </div>`).join('');
  }

  lista.addEventListener('click', event => {
    const botao = event.target.closest('[data-abrir]'); if (!botao) return;
    const [base, produto, cenario] = botao.dataset.abrir.split('|');
    abrirCenario(base, produto, cenario);
  });
  botaoAnterior.onclick = () => { semanaOffset--; renderSemana(); };
  botaoProxima.onclick = () => { semanaOffset++; renderSemana(); };
  [campoRegiaoSemana, campoSituacaoSemana].forEach(el => el.onchange = renderSemana);
  let atrasoSemana;
  campoBaseSemana.oninput = () => { clearTimeout(atrasoSemana); atrasoSemana = setTimeout(renderSemana, 250); };

  // Rola pro topo ao abrir — a secao #dia-view ja fica no comeco do HTML (antes do header/main), mas
  // sem isso a pagina pode continuar com o scroll de onde o usuario estava na simulacao.
  abrir.onclick = () => { view.hidden = false; renderSemana(); scrollTo({top: 0, behavior: 'smooth'}); };
  fechar.onclick = () => { view.hidden = true; };
  document.addEventListener('visao-dia:atualizar', event => {
    view.hidden = false;
    tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.diaTab === 'data')));
    paineis.semana.hidden = true; paineis.data.hidden = false;
    campoData.value = event.detail.dia; renderDia();
    scrollTo({top: 0, behavior: 'smooth'});
  });
})();
