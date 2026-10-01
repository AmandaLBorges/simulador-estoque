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
    $('base').value = base; products();
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
    const melhores = new Map();
    for (const dia of dias) {
      const arvore = porDia[dia] || {};
      for (const porChave of Object.values(arvore)) {
        for (const chaveNode of Object.values(porChave)) {
          const versoes = Object.values(chaveNode.versoes || {});
          if (!versoes.length) continue;
          const ultima = versoes.reduce((a, b) => (a.versao > b.versao ? a : b));
          const chaveGlobal = `${ultima.base}|${ultima.deposito || ''}|${ultima.produto}|${ultima.cenario}`;
          const atual = melhores.get(chaveGlobal);
          if (!atual || (ultima.atualizadoEm || 0) > (atual.atualizadoEm || 0)) melhores.set(chaveGlobal, {...ultima, dia});
        }
      }
    }
    return [...melhores.values()];
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
    itens.sort((a, b) => peso[a.indicadores.situacao] - peso[b.indicadores.situacao] || a.base.localeCompare(b.base));
    const semanaNum = numeroSemanaISO(segunda);
    const periodo = `${new Date(dias[0] + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(dias[6] + 'T12:00:00').toLocaleDateString('pt-BR')}`;
    if (!itens.length) {
      statusSemana.textContent = `Semana ${semanaNum} (${periodo}): nenhuma visão salva com os filtros atuais.`;
      return;
    }
    const resumo = itens.reduce((c, it) => ({...c, [it.indicadores.situacao]: (c[it.indicadores.situacao] || 0) + 1}), {});
    statusSemana.textContent = `Semana ${semanaNum} (${periodo}) · ${itens.length} visão(ões) — `
      + `${resumo.critico || 0} crítica(s) · ${resumo.atencao || 0} em atenção · ${resumo.ok || 0} ok.`;
    barra.innerHTML = ['critico', 'atencao', 'ok'].filter(s => resumo[s]).map(s =>
      `<span class="${s}" style="flex:${resumo[s]}">${resumo[s]}</span>`).join('');
    lista.innerHTML = itens.map(it => `<div class="card dia-${it.indicadores.situacao}">
      <h3>${esc(it.base)}</h3>
      <small>${esc(it.deposito || '—')} · ${esc(it.produto)} · ${esc(it.cenario)}</small>
      <p><strong>${rotuloSituacao[it.indicadores.situacao]}</strong> — menor estoque ${fmt(it.indicadores.menorEstoque)} m³
      ${it.indicadores.diaMenorEstoque ? `em ${new Date(it.indicadores.diaMenorEstoque + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}</p>
      <small>Salvo em ${new Date(it.dia + 'T12:00:00').toLocaleDateString('pt-BR')} · v${it.versao} · ${esc(it.autorNome)}</small>
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
