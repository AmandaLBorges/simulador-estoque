'use strict';
// Visao do dia (refeita a pedido da usuaria, 2026-10-14): matriz cidade x produto, OK/NOK, olhando hoje
// + 5 dias com a VMD reprojetada como saida. Calculada na hora para todas as bases do snapshot (nao
// depende de cenario salvo); a cidade fica com a situacao do PIOR deposito. As abas antigas de
// simulacoes salvas ("Simulações de hoje" e "Por data") sairam: "nao faz sentido isso aqui".
(() => {
  const cloud = window.SIM_CLOUD;
  const view = $('dia-view'), abrir = $('ver-dia'), fechar = $('dia-fechar');
  abrir.hidden = false;

  // Janela e regras (mesmas de antes, so' que em hoje + 5 dias, nao 14):
  // critico = fechamento negativo ou abaixo do lastro em algum dia; atencao = sem critico, mas algum dia
  // com fechamento igual ou abaixo do minimo. Critico HOJE tem cor propria (vermelho sangue).
  const DIAS_A_FRENTE = 5;
  const CENARIO = 'VMD';
  const SITUACOES = {
    'critico-hoje': {rotulo: 'Crítico hoje', peso: 0},
    critico: {rotulo: 'Crítico até D+' + DIAS_A_FRENTE, peso: 1},
    atencao: {rotulo: 'Atenção', peso: 2},
    ok: {rotulo: 'OK', peso: 3},
  };
  // Colunas na ordem da planilha da usuaria; produto que nao estiver aqui entra no fim com o proprio nome.
  const COLUNAS = [['Gasolina A', 'Gasolina'], ['Gasolina Premium', 'Gasolina Premium'], ['Diesel S10 A', 'S10'],
    ['Diesel S500 A', 'S500'], ['Etanol Anidro', 'Anidro'], ['Etanol Hidratado', 'Hidratado'], ['Biodiesel', 'B100']];

  function abrirCenario(base, produto) {
    view.hidden = true; document.body.classList.remove('visao-dia-aberta');
    // Mesmo caminho de quem escolhe na mao (onchange), pra marcar os chips de deposito/empresa —
    // so' trocar o .value dos selects deixava a tela sem base selecionada.
    const registro = D.records.find(r => r.base === base && r.product === produto) || D.records.find(r => r.base === base);
    if (registro) {
      $('cidade').value = cidadeDe(registro); $('cidade').onchange();
      $('deposito').value = depositoDe(registro); $('deposito').onchange();
      $('empresa').value = empresaDe(registro); $('empresa').onchange();
    }
    if ([...$('product').options].some(o => o.value === produto)) $('product').value = produto;
    $('scenario').value = CENARIO; select();
    scrollTo({top: 0, behavior: 'smooth'});
  }

  const iso = i => day(i);
  const dataCurta = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
  const indiceHoje = () => Math.max(0, Math.round((new Date(simulationToday() + 'T12:00:00') - new Date(D.date + 'T12:00:00')) / 86400000));

  // Situacao de um registro (base + deposito + empresa + produto) na janela hoje..hoje+5.
  function avaliar(r) {
    const content = fresh(r, CENARIO, 'auto'), resultado = E.calculate(content, n);
    const inicio = indiceHoje(), fim = Math.min(resultado.length - 1, inicio + DIAS_A_FRENTE);
    if (inicio > fim) return null;
    let primeiroCritico = null, atencao = false, menor = Infinity, diaMenor = null, ruptura = null;
    for (let i = inicio; i <= fim; i++) {
      const fechamento = resultado[i].close;
      if (fechamento < menor) { menor = fechamento; diaMenor = i; }
      const critico = fechamento < 0 || (content.lastro !== null && fechamento < content.lastro);
      if (critico && primeiroCritico === null) primeiroCritico = i;
      if (!critico && content.min !== null && fechamento <= content.min) atencao = true;
      if (fechamento < 0 && ruptura === null) ruptura = i;
    }
    const situacao = primeiroCritico !== null ? (primeiroCritico === inicio ? 'critico-hoje' : 'critico') : atencao ? 'atencao' : 'ok';
    // Pro ranking de dias de estoque: abertura de hoje (ja' projetada, se a planilha for de dia anterior)
    // e a VMD reprojetada de hoje.
    return {situacao, aberturaHoje: resultado[inicio].opening, vmdHoje: content.movements.sale[inicio] || 0, menor, diaMenor: iso(diaMenor), primeiroCritico: primeiroCritico === null ? null : iso(primeiroCritico),
      ruptura: ruptura === null ? null : iso(ruptura), inicio: iso(inicio), fim: iso(fim)};
  }

  function calcular() {
    const itens = [];
    for (const r of D.records) {
      try { const av = avaliar(r); if (av) itens.push({registro: r, cidade: cidadeDe(r), produto: r.product, ...av}); }
      catch { /* registro sem dado suficiente pro calculo (ex.: sem abertura); fica fora */ }
    }
    return itens;
  }

  // Pior deposito da cidade por produto (pedido da usuaria: "nao precisa abrir por deposito").
  function matriz(itens) {
    const celulas = new Map();
    for (const it of itens) {
      const chave = `${it.cidade}|${it.produto}`, atual = celulas.get(chave);
      if (!atual) { celulas.set(chave, {pior: it, itens: [it]}); continue; }
      atual.itens.push(it);
      const p = SITUACOES[it.situacao].peso - SITUACOES[atual.pior.situacao].peso;
      if (p < 0 || (p === 0 && it.menor < atual.pior.menor)) atual.pior = it;
    }
    return celulas;
  }

  function textoCelula(c) {
    const it = c.pior;
    if (it.situacao === 'ok') return 'OK';
    if (it.situacao === 'atencao') return 'Atenção';
    return it.situacao === 'critico-hoje' ? 'NOK · hoje' : `NOK · ${dataCurta(it.primeiroCritico)}`;
  }
  function dicaCelula(c) {
    const it = c.pior, onde = `${depositoDe(it.registro)} · ${empresaDe(it.registro)}`;
    const linhas = [`${it.cidade} · ${it.produto}: ${SITUACOES[it.situacao].rotulo}`,
      `Pior depósito: ${onde}`, `Menor fechamento: ${fmt(it.menor)} m³ em ${dataCurta(it.diaMenor)}`];
    if (it.ruptura) linhas.push(`Ruptura (estoque negativo) a partir de ${dataCurta(it.ruptura)}`);
    if (c.itens.length > 1) linhas.push(`${c.itens.length} depósitos/empresas nesta cidade; clique para abrir o pior no simulador.`);
    else linhas.push('Clique para abrir no simulador.');
    return linhas.join('\n');
  }

  const campoRegiao = $('semana-regiao'), campoBusca = $('semana-base'), campoSituacao = $('semana-situacao'),
    statusEl = $('semana-status'), barra = $('semana-barra'), tabela = $('matriz-risco'), lista = $('semana-lista'),
    campoProdutoRanking = $('ranking-produto'), ranking = $('ranking-lista');

  // Ranking de dias de estoque por cidade (pedido da usuaria, 2026-10-14, igual ao visual "Ranking Dias
  // de Estoque" do BI): dias = abertura de hoje / VMD reprojetada de hoje, somando todos os depositos
  // (e todos os produtos, se nenhum for escolhido). A cor da barra e' a pior situacao da matriz.
  function renderRanking(itens, colunas, celulas) {
    const produto = campoProdutoRanking.value;
    const opcoes = [['', 'Todos os produtos'], ...colunas];
    if (campoProdutoRanking.options.length !== opcoes.length) {
      campoProdutoRanking.innerHTML = opcoes.map(([v, r]) => `<option value="${esc(v)}">${esc(r)}</option>`).join('');
      campoProdutoRanking.value = opcoes.some(([v]) => v === produto) ? produto : '';
    }
    const escolhido = campoProdutoRanking.value;
    const porCidade = new Map();
    for (const it of itens) {
      if (escolhido && it.produto !== escolhido) continue;
      const c = porCidade.get(it.cidade) || {abertura: 0, vmd: 0};
      c.abertura += Math.max(it.aberturaHoje, 0); c.vmd += Math.max(it.vmdHoje, 0);
      porCidade.set(it.cidade, c);
    }
    const piorSituacao = cid => {
      const pesos = colunas.filter(([p]) => !escolhido || p === escolhido).map(([p]) => celulas.get(`${cid}|${p}`)).filter(Boolean).map(c => c.pior.situacao);
      return pesos.sort((a, b) => SITUACOES[a].peso - SITUACOES[b].peso)[0] || 'ok';
    };
    // Com todos os produtos juntos, a barra fica na cor neutra (um produto ruim pintaria a cidade inteira).
    const linhas = [...porCidade.entries()].filter(([, c]) => c.vmd > 0).map(([cidade, c]) => ({cidade, dias: c.abertura / c.vmd, ...c, situacao: escolhido ? piorSituacao(cidade) : 'neutra'}))
      .sort((a, b) => b.dias - a.dias);
    const maximo = Math.max(...linhas.map(l => l.dias), 1);
    ranking.innerHTML = !linhas.length ? '<p class="muted">Sem VMD para calcular os dias de estoque.</p>'
      : linhas.map(l => `<div class="ranking-linha" title="${esc(`${l.cidade}: abertura ${fmt(l.abertura)} m³ ÷ VMD ${fmt(l.vmd)} m³/dia = ${l.dias.toFixed(1).replace('.', ',')} dias`)}">
        <span class="ranking-cidade">${esc(l.cidade)}</span>
        <span class="ranking-trilho"><span class="ranking-barra ${l.situacao}" style="width:${Math.max(1, l.dias / maximo * 100)}%"></span></span>
        <span class="ranking-valor">${l.dias.toFixed(1).replace('.', ',')}</span></div>`).join('');
  }

  function render() {
    statusEl.textContent = 'Calculando…'; barra.innerHTML = ''; tabela.innerHTML = ''; lista.innerHTML = ''; ranking.innerHTML = '';
    let itens = calcular();
    const regiao = campoRegiao.value, busca = campoBusca.value.trim().toLowerCase();
    itens = itens.filter(it => (!regiao || cloud.regionOf(it.registro.base) === regiao) && (!busca || it.cidade.toLowerCase().includes(busca)));
    const celulas = matriz(itens);
    const filtroSituacao = campoSituacao.value;
    const passaSituacao = c => !filtroSituacao || (filtroSituacao === 'critico' ? c.pior.situacao.startsWith('critico') : c.pior.situacao === filtroSituacao);
    const cidades = [...new Set(itens.map(it => it.cidade))].filter(cid => [...celulas.entries()].some(([k, c]) => k.startsWith(cid + '|') && passaSituacao(c)));
    const produtosPresentes = new Set(itens.map(it => it.produto));
    const colunas = COLUNAS.filter(([p]) => produtosPresentes.has(p))
      .concat([...produtosPresentes].filter(p => !COLUNAS.some(([c]) => c === p)).sort().map(p => [p, p]));
    renderRanking(itens, colunas, celulas);
    if (!cidades.length) { statusEl.textContent = 'Nenhuma cidade encontrada com os filtros atuais.'; return; }

    const piorDaCidade = cid => Math.min(...colunas.map(([p]) => celulas.get(`${cid}|${p}`)).filter(Boolean).map(c => SITUACOES[c.pior.situacao].peso));
    cidades.sort((a, b) => piorDaCidade(a) - piorDaCidade(b) || a.localeCompare(b, 'pt-BR'));

    const visiveis = cidades.flatMap(cid => colunas.map(([p]) => celulas.get(`${cid}|${p}`)).filter(c => c && passaSituacao(c)));
    const resumo = visiveis.reduce((acc, c) => ({...acc, [c.pior.situacao]: (acc[c.pior.situacao] || 0) + 1}), {});
    const amostra = itens[0];
    statusEl.textContent = `Hoje (${dataCurta(amostra.inicio)}) até ${dataCurta(amostra.fim)} · vendas pela VMD reprojetada · `
      + `${cidades.length} cidade(s), ${visiveis.length} combinação(ões) cidade × produto: `
      + Object.keys(SITUACOES).map(s => `${resumo[s] || 0} ${SITUACOES[s].rotulo.toLowerCase()}`).join(' · ') + '.';
    barra.innerHTML = Object.keys(SITUACOES).filter(s => resumo[s]).map(s =>
      `<span class="${s}" style="flex:${resumo[s]}" title="${SITUACOES[s].rotulo}">${resumo[s]}</span>`).join('');

    tabela.innerHTML = `<thead><tr><th>Cidade / produto</th>${colunas.map(([, rotulo]) => `<th>${esc(rotulo)}</th>`).join('')}</tr></thead><tbody>`
      + cidades.map(cid => `<tr><th>${esc(cid)}</th>${colunas.map(([p]) => {
        const c = celulas.get(`${cid}|${p}`);
        if (!c || !passaSituacao(c)) return '<td class="vazio">—</td>';
        return `<td class="${c.pior.situacao}"><button type="button" data-abrir="${esc(c.pior.registro.base)}|${esc(p)}" title="${esc(dicaCelula(c))}">${textoCelula(c)}</button></td>`;
      }).join('')}</tr>`).join('') + '</tbody>';

    // Embaixo da matriz: so' as cidades com problema, 1 linha por produto NOK com o pior deposito.
    lista.innerHTML = cidades.map(cid => {
      const ruins = colunas.map(([p, rotulo]) => [rotulo, celulas.get(`${cid}|${p}`)]).filter(([, c]) => c && c.pior.situacao !== 'ok' && passaSituacao(c));
      if (!ruins.length) return '';
      const pior = ruins.reduce((a, b) => (SITUACOES[a[1].pior.situacao].peso <= SITUACOES[b[1].pior.situacao].peso ? a : b))[1].pior.situacao;
      return `<div class="card dia-${pior}"><h3>${esc(cid)}</h3><ul class="causas-lista">${ruins.map(([rotulo, c]) => {
        const it = c.pior;
        return `<li><b>${esc(rotulo)}</b> <span class="tag">${esc(depositoDe(it.registro))} · ${esc(empresaDe(it.registro))}</span> — ${SITUACOES[it.situacao].rotulo}, menor fechamento ${fmt(it.menor)} m³ em ${dataCurta(it.diaMenor)}${it.ruptura ? ` · ruptura ${dataCurta(it.ruptura)}` : ''}</li>`;
      }).join('')}</ul></div>`;
    }).join('');
  }

  for (const el of [tabela, lista]) el.addEventListener('click', event => {
    const botao = event.target.closest('[data-abrir]'); if (!botao) return;
    const [base, produto] = botao.dataset.abrir.split('|');
    abrirCenario(base, produto);
  });
  [campoRegiao, campoSituacao, campoProdutoRanking].forEach(el => el.onchange = render);
  let atraso;
  campoBusca.oninput = () => { clearTimeout(atraso); atraso = setTimeout(render, 250); };

  // A Visao do dia ocupa a tela sozinha: o simulador some enquanto ela esta' aberta.
  abrir.onclick = () => { view.hidden = false; document.body.classList.add('visao-dia-aberta'); render(); scrollTo({top: 0, behavior: 'smooth'}); };
  fechar.onclick = () => { view.hidden = true; document.body.classList.remove('visao-dia-aberta'); };
})();
