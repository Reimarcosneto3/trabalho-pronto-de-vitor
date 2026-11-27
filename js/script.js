/* ==========================================================================
   script.js — Cardápio (index), Pedidos/KDS e Histórico
   ========================================================================== */
DB.pronto(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const { brl, norm, esc, pad, dataHora, NOMES } = DB;

  /* ======================================================================
     CARDÁPIO
     ====================================================================== */
  function iniciarCardapio() {
    const CATS = [['entradas', 'Entradas'], ['pratos', 'Pratos'], ['lanches', 'Lanches'], ['bebidas', 'Bebidas']];
    const campoBusca = $('[name=search]');
    const campoOrdem = $('[name=ordem]');
    let pendente = null;     // item do cardápio clicado em "Comanda+"
    let editandoId = null;
    let excluindoId = null;

    // Mensagem de "nada encontrado"
    const vazio = document.createElement('p');
    vazio.className = 'sem-resultados';
    vazio.hidden = true;
    vazio.textContent = 'Nenhum item encontrado. Tente outro termo ou outra categoria.';
    $('main').appendChild(vazio);

    function ordenar(lista, modo) {
      const l = lista.slice();
      if (modo === 'menorPreco') l.sort((a, b) => a.preco - b.preco);
      if (modo === 'maiorPreco') l.sort((a, b) => b.preco - a.preco);
      if (modo === 'a-z') l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return l;
    }

    function card(m) {
      const acao = m.disponivel
        ? '<a href="#nova-comanda" class="btn-mini" data-acao="comanda">Comanda+</a>'
        : '<span class="btn-mini off">Indisponível</span>';
      return '<li data-id="' + m.id + '"' + (m.disponivel ? '' : ' class="indisponivel"') + '><article>' +
        '<figure><img src="' + esc(m.foto || DB.FOTO_VAZIA) + '" alt="' + esc(m.nome) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=DB.FOTO_VAZIA"></figure>' +
        '<h3>' + esc(m.nome) + '</h3>' +
        '<p>' + esc(m.desc) + '</p>' +
        '<footer><strong>' + brl(m.preco) + '</strong>' + acao +
        '<a href="#editar-item" class="btn-icone" data-acao="editar" aria-label="Editar ' + esc(m.nome) + '"></a>' +
        '<a href="#excluir-item" class="btn-icone" data-acao="excluir" aria-label="Excluir ' + esc(m.nome) + '"></a>' +
        '</footer></article></li>';
    }

    function render() {
      const menu = DB.get().menu;
      const q = norm(campoBusca.value.trim());
      const radio = $('input[name=cat]:checked');
      const catAtiva = radio ? radio.id.replace('c-', '') : 'todos';
      let total = 0;

      CATS.forEach(([id]) => {
        const sec = $('#' + id);
        let itens = menu.filter(m => m.cat === id);
        if (q) itens = itens.filter(m => norm(m.nome + ' ' + m.desc).includes(q));
        itens = ordenar(itens, campoOrdem.value);
        $('ul', sec).innerHTML = itens.map(card).join('');
        const visivel = (catAtiva === 'todos' || catAtiva === id) && itens.length > 0;
        sec.hidden = !visivel;
        if (visivel) total += itens.length;
      });
      vazio.hidden = total > 0;
    }

    /* busca, categorias e ordenação */
    $('.filtros form').addEventListener('submit', e => e.preventDefault());
    campoBusca.addEventListener('input', render);
    campoOrdem.addEventListener('change', render);
    $$('input[name=cat]').forEach(r => r.addEventListener('change', render));

    /* cliques nos cartões */
    $('main').addEventListener('click', e => {
      const a = e.target.closest('[data-acao]');
      if (!a) return;
      const li = a.closest('li[data-id]');
      const item = li && DB.get().menu.find(m => m.id === Number(li.dataset.id));
      if (!item) return;

      if (a.dataset.acao === 'comanda') pendente = item.id;

      if (a.dataset.acao === 'editar') {
        editandoId = item.id;
        $('#e-nome').value = item.nome;
        $('#e-cat').value = (CATS.find(c => c[0] === item.cat) || [])[1] || '';
        $('#e-preco').value = item.preco;
        $('#e-desc').value = item.desc;
        $('#e-foto').value = item.foto;
        $('#e-arq').value = '';
        $('#e-disp').checked = item.disponivel;
      }
      if (a.dataset.acao === 'excluir') {
        excluindoId = item.id;
        $('#excluir-nome').textContent = item.nome;
      }
    });

    /* "Abrir comanda +" do topo começa uma comanda sem item */
    $$('.btn-pill[href="#nova-comanda"]').forEach(b => b.addEventListener('click', () => { pendente = null; }));

    /* novo item */
    $('#novo-item form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        const cat = norm($('#n-cat').value);
        const criado = await DB.menuAdd({
          cat: cat,
          nome: $('#n-nome').value.trim(),
          desc: $('#n-desc').value.trim(),
          preco: Number($('#n-preco').value) || 0,
          foto: $('#n-foto').value.trim(),
          disponivel: $('#n-disp').checked
        });
        if (!criado) return;
        const arq = $('#n-arq').files[0];
        const fotoOk = arq ? await DB.enviarFoto(arq, criado.id) : true;
        form.reset();
        $('#n-disp').checked = true;
        render();
        location.hash = '#' + cat;
        if (fotoOk) DB.aviso('Item adicionado ao cardápio.');
        // se a foto falhou, o motivo já está na tela (não cobrir com outro aviso)
      } finally { btn.disabled = false; }
    });

    /* editar item */
    $('#editar-item form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('[type=submit]', e.target);
      btn.disabled = true;
      try {
        const atual = DB.get().menu.find(x => x.id === editandoId);
        if (!atual) return;
        const foto = $('#e-foto').value.trim();
        const salvo = await DB.menuUpdate(editandoId, {
          cat: norm($('#e-cat').value),
          nome: $('#e-nome').value.trim(),
          desc: $('#e-desc').value.trim(),
          preco: Number($('#e-preco').value) || 0,
          foto: foto,
          disponivel: $('#e-disp').checked,
          limparDrive: foto !== atual.foto
        });
        if (!salvo) return;
        const arq = $('#e-arq').files[0];
        const fotoOk = arq ? await DB.enviarFoto(arq, editandoId) : true;
        editandoId = null;
        render();
        location.hash = '#topo';
        if (fotoOk) DB.aviso('Item atualizado.');
      } finally { btn.disabled = false; }
    });

    /* excluir item */
    $('#excluir-item form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('[type=submit]', e.target);
      btn.disabled = true;
      try {
        if (!(await DB.menuDelete(excluindoId))) return;
        excluindoId = null;
        render();
        location.hash = '#topo';
        DB.aviso('Item removido do cardápio.');
      } finally { btn.disabled = false; }
    });

    /* abrir comanda (com ou sem item) */
    const selMesa = $('#mesa');

    function prepararComanda() {
      const s = DB.get();
      const item = pendente && s.menu.find(m => m.id === pendente);
      $('#t-comanda').textContent = item ? 'Comanda+ ' + item.nome : 'Abrir nova comanda';
      Array.from(selMesa.options).forEach(o => {
        if (!o.value) return;
        const ocupada = s.comandas.some(c => c.mesa === Number(o.value));
        o.disabled = ocupada && !item;
        o.textContent = 'Mesa ' + o.value + (ocupada ? (item ? ' (em uso — soma na comanda)' : ' (ocupada)') : '');
      });
    }

    window.addEventListener('hashchange', () => {
      if (location.hash === '#nova-comanda') prepararComanda();
      else pendente = null;
    });

    $('#nova-comanda form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('[type=submit]', e.target);
      btn.disabled = true;
      try {
        const mesa = Number(selMesa.value);
        const cliente = $('#cliente').value.trim();
        if (!mesa || !cliente) return;

        const item = pendente && DB.get().menu.find(m => m.id === pendente);
        let c = DB.mesaOcupada(mesa);
        if (c && !item) { DB.aviso('Essa mesa já tem uma comanda aberta.'); return; }
        if (!c) c = await DB.abrirComanda({ mesa: mesa, cliente: cliente, taxa: $('#taxa').checked });
        if (!c) return;
        if (item) await DB.addItem(c.id, { nome: item.nome, preco: item.preco, qtd: 1, obs: '' });

        location.href = 'mesas.html?c=' + c.id + '#comanda';
      } finally { btn.disabled = false; }
    });

    render();
    if (location.hash === '#nova-comanda') prepararComanda();
  }

  /* ======================================================================
     PEDIDOS (KDS)
     ====================================================================== */
  function iniciarKDS() {
    const COLUNAS = { recebido: '.col-recebidos', preparo: '.col-preparo', pronto: '.col-prontos', entregue: '.col-entregues' };
    const AVANCAR = { recebido: ['preparo', 'Iniciar preparo'], preparo: ['pronto', 'Marcar pronto'], pronto: ['entregue', 'Marcar entregue'] };
    const VOLTAR  = { preparo: 'recebido', pronto: 'preparo', entregue: 'pronto' };
    const vazios = {};

    Object.keys(COLUNAS).forEach(st => {
      vazios[st] = $('.kds-conteudo p', $(COLUNAS[st])).textContent;
    });

    function ha(iso) {
      const min = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
      if (min < 1) return 'agora';
      if (min < 60) return 'há ' + min + ' min';
      return 'há ' + Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
    }

    function card(p) {
      const prox = AVANCAR[p.status];
      return '<article class="kds-card st-' + p.status + '">' +
        '<div class="kds-topo"><h3>' + p.qtd + '× ' + esc(p.nome) + '</h3>' +
        '<time datetime="' + p.criado + '">' + ha(p.criado) + '</time></div>' +
        '<p class="local">Mesa ' + p.mesa + ' · ' + pad(p.comandaNum) + ' · ' + esc(p.cliente) + '</p>' +
        (p.obs ? '<p class="obs">Obs.: ' + esc(p.obs) + '</p>' : '') +
        '<div class="kds-acoes">' +
        (VOLTAR[p.status] ? '<button type="button" class="btn-voltar" data-id="' + p.id + '" data-para="' + VOLTAR[p.status] + '" aria-label="Voltar para ' + NOMES[VOLTAR[p.status]] + '">←</button>' : '') +
        (prox ? '<button type="button" class="btn-avancar" data-id="' + p.id + '" data-para="' + prox[0] + '">' + prox[1] + '</button>' : '') +
        '</div></article>';
    }

    function render() {
      const pedidos = DB.get().pedidos;
      Object.keys(COLUNAS).forEach(st => {
        const col = $(COLUNAS[st]);
        const lista = pedidos.filter(p => p.status === st);
        lista.sort((a, b) => st === 'entregue'
          ? new Date(b.atualizado) - new Date(a.atualizado)
          : new Date(a.criado) - new Date(b.criado));
        const area = $('.kds-conteudo', col);
        area.classList.toggle('cheio', lista.length > 0);
        area.innerHTML = lista.length ? lista.map(card).join('') : '<p>' + vazios[st] + '</p>';
        const b = $('.badge', col);
        b.value = lista.length;
        b.textContent = lista.length;
      });
    }

    $('.kds-board').addEventListener('click', async e => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      const p = DB.setStatus(Number(b.dataset.id), b.dataset.para);
      render();
      await p;
      render();
    });

    DB.onChange(render);
    setInterval(render, 30000); // atualiza os "há X min"
    render();
  }

  /* ======================================================================
     HISTÓRICO & INDICADORES
     ====================================================================== */
  function iniciarHistorico() {
    const cards = $$('.card-indicador');
    cards.forEach(c => {
      const v = document.createElement('p');
      v.className = 'valor';
      c.appendChild(v);
    });

    const busca = $('.filtros-historico input[type=search]');
    const [selPag, selOrdem] = $$('.filtros-historico select');
    const corpo = $('.tabela-container tbody');

    function indicadores(hist) {
      const fat = hist.reduce((a, h) => a + h.total, 0);
      const itens = hist.reduce((a, h) => a + h.itens.reduce((x, i) => x + i.qtd, 0), 0);
      const vals = [brl(fat), String(hist.length), brl(hist.length ? fat / hist.length : 0), String(itens)];
      cards.forEach((c, i) => { $('.valor', c).textContent = vals[i]; });
    }

    function render() {
      const hist = DB.get().historico;
      indicadores(hist);

      const q = norm(busca.value.trim());
      const pag = selPag.selectedIndex === 0 ? '' : norm(selPag.value);
      let lista = hist.filter(h => {
        if (pag && !norm(h.pagamento).includes(pag)) return false;
        if (!q) return true;
        return norm(pad(h.num) + ' ' + h.num + ' mesa ' + h.mesa + ' ' + h.cliente).includes(q);
      });
      lista.sort((a, b) => selOrdem.selectedIndex === 0
        ? new Date(b.fechada) - new Date(a.fechada)
        : new Date(a.fechada) - new Date(b.fechada));

      if (!lista.length) {
        corpo.innerHTML = '<tr class="sem-dados"><td colspan="7">' +
          (hist.length ? 'Nenhuma comanda encontrada com esses filtros.' : 'Nenhuma comanda finalizada ainda. As comandas pagas aparecem aqui.') +
          '</td></tr>';
        return;
      }
      corpo.innerHTML = lista.map(h =>
        '<tr><td>' + pad(h.num) + '</td><td><span class="badge-mesa">Mesa ' + h.mesa + '</span></td><td>' + esc(h.cliente) + '</td>' +
        '<td>' + dataHora(h.fechada) + '</td>' +
        '<td><span class="tag-pagamento' + (norm(h.pagamento).includes('cartao') ? ' cartao' : '') + '">' + esc(h.pagamento) + '</span></td>' +
        '<td>' + brl(h.total) + '</td>' +
        '<td><a href="#comprovante" class="btn-comprovante" data-id="' + h.id + '">Reimprimir</a></td></tr>'
      ).join('');
    }

    $('.filtros-historico form').addEventListener('submit', e => e.preventDefault());
    busca.addEventListener('input', render);
    selPag.addEventListener('change', render);
    selOrdem.addEventListener('change', render);

    corpo.addEventListener('click', e => {
      const a = e.target.closest('a[data-id]');
      if (!a) return;
      const rec = DB.get().historico.find(h => h.id === Number(a.dataset.id));
      if (rec) DB.preencherRecibo(rec);
    });

    DB.onChange(render);
    render();
  }

  /* ---------- início ---------- */
  if ($('.filtros')) iniciarCardapio();
  if ($('.kds-board')) iniciarKDS();
  if ($('.indicadores-grid')) iniciarHistorico();
}, { historico: !!document.querySelector('.indicadores-grid') });
