'use strict';
(() => {
  const cloud = window.SIM_CLOUD;
  let currentId = null, expected = null, context = '', busy = false;
  const bar = document.createElement('div');
  bar.className = 'scenario-controls';
  bar.innerHTML = '<label>Cenários da equipe <select id="cloud-list"><option value="">Selecione um cenário</option></select></label><button id="cloud-refresh">Atualizar lista</button><button id="cloud-open">Abrir cenário</button><button id="cloud-save">Salvar na equipe</button><button id="cloud-copy">Salvar como novo</button><small id="cloud-status" role="status"></small>';
  document.querySelector('.filters').after(bar);
  const note = text => { $('cloud-status').textContent = text; };
  const identity = () => [record.id, D.date, state.scenario].join('|');
  const previousKey = key;
  key = () => `${window.SIM_AUTH.uid}:${previousKey()}`;
  // Não reutilizar rascunhos deixados por outra conta no mesmo navegador.
  select();
  const editable = () => cloud.canEdit(record.base);
  function lock() {
    const allowed = editable();
    document.querySelectorAll('[data-row], [data-param], [data-edit-key], #name').forEach(input => {
      input.disabled = !allowed;
    });
    for (const id of ['reset', 'import', 'repeat-day', 'cloud-save', 'cloud-copy']) {
      $(id).disabled = !allowed || busy;
    }
    if (context !== identity()) {
      context = identity(); currentId = null; expected = null;
      $('cloud-list').replaceChildren(new Option('Selecione um cenário', ''));
      note(allowed ? 'Rascunho local. Use Salvar na equipe para compartilhar.' : 'Consulta: edição desta base não liberada para seu perfil.');
    }
  }
  const previousRender = render;
  render = function(...args) { previousRender(...args); lock(); };
  const previousEditor = renderEditor;
  renderEditor = function(...args) { previousEditor(...args); lock(); };
  async function run(action) {
    if (busy) return;
    busy = true; lock();
    try { await action(); } catch (error) { note(error.message); }
    finally { busy = false; lock(); }
  }
  async function refresh() {
    const selection = identity(), base = record.base;
    const entries = await cloud.list(base);
    if (selection !== identity()) return;
    const options = [new Option('Selecione um cenário', '')];
    for (const [id, entry] of Object.entries(entries)) {
      try {
        const value = E.validate(JSON.parse(entry.conteudo));
        if (value.id === record.id && value.date === D.date && value.scenario === state.scenario)
          options.push(new Option(value.name, id));
      } catch { /* Um registro inválido não impede a leitura dos demais. */ }
    }
    $('cloud-list').replaceChildren(...options);
    if (currentId) $('cloud-list').value = currentId;
    note(`${options.length - 1} cenário(s) da equipe para esta base, produto, data e modo.`);
  }
  $('cloud-refresh').onclick = () => run(refresh);
  $('cloud-open').onclick = () => run(async () => {
    const id = $('cloud-list').value, selection = identity();
    if (!id) throw new Error('Selecione um cenário da equipe.');
    const entry = (await cloud.list(record.base))[id];
    if (selection !== identity()) return;
    if (!entry) throw new Error('Cenário não encontrado. Atualize a lista.');
    const candidate = E.validate(JSON.parse(entry.conteudo));
    if (candidate.id !== record.id || candidate.date !== D.date || candidate.scenario !== state.scenario)
      throw new Error('O cenário pertence a outro recorte.');
    if (!confirm('Abrir este cenário e substituir o rascunho atual deste recorte?')) return;
    state = candidate; currentId = id; expected = entry;
    persist(); premises(); render(true); note('Cenário da equipe aberto.');
  });
  async function save(copy) {
    if (!editable()) throw new Error('Seu perfil permite apenas consultar esta base.');
    const content = E.validate(structuredClone(state));
    const name = prompt('Nome do cenário para a equipe:', content.name);
    if (name === null) return;
    content.name = name.trim();
    if (!content.name || content.name.length > 80) throw new Error('Informe um nome de até 80 caracteres.');
    const selection = identity(), base = record.base;
    const id = copy || !currentId ? crypto.randomUUID() : currentId;
    // Buscar antes da transação também preenche o cache usado no primeiro callback.
    const latest = (await cloud.list(base))[id] || null;
    const prior = copy || !currentId ? null : expected;
    if ((latest === null) !== (prior === null) || (latest && ['base', 'conteudo', 'atualizadoPor', 'atualizadoEm'].some(key => latest[key] !== prior[key]))) throw new Error('Cenário alterado por outra pessoa. Abra a versão atual antes de salvar.');
    const saved = await cloud.save(base, id, content, prior);
    if (selection !== identity()) return;
    currentId = id; expected = saved; state.name = content.name;
    persist(); await refresh(); note('Cenário salvo para a equipe.');
  }
  $('cloud-save').onclick = () => run(() => save(false));
  $('cloud-copy').onclick = () => run(() => save(true));
  lock();
})();
