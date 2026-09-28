'use strict';
// Visao do dia: consolidado dos cenarios salvos pela equipe num dia, com filtros e indicadores.
// So le o que ja foi gravado (registros imutaveis) — nao recalcula nada, nao gerencia estado da simulacao.
(() => {
  const cloud = window.SIM_CLOUD;
  const view = $('dia-view'), abrir = $('ver-dia'), fechar = $('dia-fechar');
  const campoData = $('dia-data'), campoRegiao = $('dia-regiao'), campoBase = $('dia-base'),
    campoSituacao = $('dia-situacao'), corpo = $('dia-tbody'), status = $('dia-status');
  const rotuloSituacao = {ok: 'OK', atencao: 'Atenção', critico: 'Crítico'};
  abrir.hidden = false;
  campoData.value = D.date;
  let geracao = 0;

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

  async function render() {
    const minha = ++geracao;
    status.textContent = 'Carregando…'; corpo.innerHTML = '';
    const dia = campoData.value || D.date;
    let itens;
    try { itens = await linhasDoDia(dia); }
    catch (error) { if (minha === geracao) status.textContent = `Não foi possível carregar: ${error.message}`; return; }
    if (minha !== geracao) return;
    const regiao = campoRegiao.value, base = campoBase.value.trim().toLowerCase(), situacao = campoSituacao.value;
    itens = itens.filter(it => (!regiao || cloud.regionOf(it.base) === regiao)
      && (!base || it.base.toLowerCase().includes(base))
      && (!situacao || it.indicadores.situacao === situacao));
    const peso = {critico: 0, atencao: 1, ok: 2};
    itens.sort((a, b) => peso[a.indicadores.situacao] - peso[b.indicadores.situacao] || a.base.localeCompare(b.base));
    if (!itens.length) { status.textContent = 'Nenhuma visão salva para este dia com os filtros atuais.'; return; }
    const resumo = itens.reduce((c, it) => ({...c, [it.indicadores.situacao]: (c[it.indicadores.situacao] || 0) + 1}), {});
    status.textContent = `${itens.length} visão(ões) · ${resumo.critico || 0} crítica(s) · ${resumo.atencao || 0} em atenção · ${resumo.ok || 0} ok.`;
    corpo.innerHTML = itens.map(it => `<tr class="dia-${it.indicadores.situacao}">
      <td>${esc(it.base)}</td><td>${esc(it.produto)}</td><td>${esc(it.cenario)}</td>
      <td>${rotuloSituacao[it.indicadores.situacao]}</td>
      <td>${fmt(it.indicadores.menorEstoque)}</td>
      <td>${it.indicadores.diaMenorEstoque ? new Date(it.indicadores.diaMenorEstoque + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td>${it.indicadores.diasCritico}</td><td>${it.indicadores.diasAtencao}</td>
      <td>v${it.versao}</td>
      <td>${esc(it.autorNome)}${it.motivo ? `<br><small>${esc(it.motivo)}</small>` : ''}</td>
      <td><button type="button" data-abrir="${esc(it.base)}|${esc(it.produto)}|${esc(it.cenario)}">Abrir</button></td>
    </tr>`).join('');
  }

  corpo.addEventListener('click', event => {
    const botao = event.target.closest('[data-abrir]'); if (!botao) return;
    const [base, produto, cenario] = botao.dataset.abrir.split('|');
    view.hidden = true;
    $('base').value = base; products();
    if ([...$('product').options].some(o => o.value === produto)) $('product').value = produto;
    $('scenario').value = cenario; select();
  });
  abrir.onclick = () => { view.hidden = false; render(); };
  fechar.onclick = () => { view.hidden = true; };
  [campoData, campoRegiao, campoSituacao].forEach(el => el.onchange = render);
  let atraso;
  campoBase.oninput = () => { clearTimeout(atraso); atraso = setTimeout(render, 250); };
  document.addEventListener('visao-dia:atualizar', event => {
    campoData.value = event.detail.dia; view.hidden = false; render();
  });
})();
