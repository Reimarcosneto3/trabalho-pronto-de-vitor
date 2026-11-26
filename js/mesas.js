/* ==========================================================================
   mesas.js — Mesas & Comandas
   ========================================================================== */
DB.pronto(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const { brl, esc, pad, hora, NOMES } = DB;

  const listaCmd   = $('#lista-comandas');
  const vazioHTML  = listaCmd.innerHTML;          // aviso original de "nenhuma comanda"
  const selMesa    = $('#mesa');
  const pForma     = $('#p-forma');
  const pDesc      = $('#p-desc');
  let itemParaExcluir = null;
  let menuSig = '';                                // para só refazer a lista de produtos se o cardápio mudar

  /* ---------- cardápio do formulário "Adicionar produto" ---------- */
  function montarCardapio() {
    const menu = DB.get().menu;
    if (!menu) return; // ainda não foi editado: vale a lista original do HTML
    const sel = $('#a-item');
    const grupos = [['entradas', 'Entradas'], ['pratos', 'Pratos'], ['lanches', 'Lanches'], ['bebidas', 'Bebidas']];
    sel.innerHTML = '<option value=""></option>';
    grupos.forEach(([id, rotulo]) => {
      const itens = menu.filter(m => m.cat === id && m.disponivel);
      if (!itens.length) return;
      const og = document.createElement('optgroup');
      og.label = rotulo;
      itens.forEach(m => {
        const o = new Option(m.nome, m.nome);
        o.dataset.preco = m.preco;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  /* ---------- estado atual ---------- */
  function comandaAtual() {
    const s = DB.get();
    let c = s.comandas.find(x => x.id === DB.selecionada());
    if (!c && s.comandas.length) {
      c = s.comandas[0];
      DB.selecionar(c.id);
    }
    return c || null;
  }

  /* ---------- renderização ---------- */
  function renderMapa(s, atual) {
    $$('.mesas .mesa').forEach(a => {
      const n = Number(a.dataset.mesa);
      const c = s.comandas.find(x => x.mesa === n);
      a.classList.toggle('livre', !c);
      a.classList.toggle('ocupada', !!c);
      a.classList.toggle('ativa', !!c && !!atual && c.id === atual.id);
      $('small', a).textContent = c ? 'Ocupada' : 'Livre';
      a.setAttribute('href', c ? '#comanda' : '#nova-comanda');
      if (c) a.dataset.cmd = c.id; else delete a.dataset.cmd;
    });
  }

  function renderLista(s, atual) {
    if (!s.comandas.length) { listaCmd.innerHTML = vazioHTML; return; }
    listaCmd.innerHTML = '<ul>' + s.comandas.map(c => {
      const t = DB.totais(c, 0);
      const n = c.itens.reduce((a, i) => a + i.qtd, 0);
      return '<li><a href="#comanda" data-cmd="' + c.id + '"' + (atual && atual.id === c.id ? ' class="ativa"' : '') + '>' +
        '<div class="cartao"><h3>' + pad(c.num) + '</h3><mark>Mesa ' + c.mesa + '</mark>' +
        '<p class="cli">' + esc(c.cliente) + '</p>' +
        '<p class="n-itens">' + n + (n === 1 ? ' item' : ' itens') + '</p>' +
        '<strong>' + brl(t.total) + '</strong></div></a></li>';
    }).join('') + '</ul>';
  }

  function renderComanda(s, atual) {
    $('.salao').classList.toggle('tem-comanda', !!atual);
    if (!atual) return;

    $('#c-id').textContent = 'Comanda ' + pad(atual.num);
    $('#c-mesa').textContent = 'Mesa ' + atual.mesa;
    $('#c-cliente').textContent = atual.cliente;
    const t = $('#c-hora');
    t.textContent = hora(atual.aberta);
    t.setAttribute('datetime', atual.aberta);

    const pedidos = {};
    s.pedidos.forEach(p => { pedidos[p.itemId] = p; });

    $('#c-vazio').hidden = atual.itens.length > 0;
    $('#c-itens').hidden = atual.itens.length === 0;

    $('#c-corpo').innerHTML = atual.itens.map(i => {
      const p = pedidos[i.id];
      const st = p ? p.status : 'entregue';
      return '<tr data-item="' + i.id + '">' +
        '<th scope="row">' + esc(i.nome) + (i.obs ? '<span class="obs">Obs.: ' + esc(i.obs) + '</span>' : '') + '</th>' +
        '<td class="qtd">' +
          '<button type="button" data-acao="menos" data-item="' + i.id + '" aria-label="Diminuir quantidade"' + (i.qtd <= 1 ? ' disabled' : '') + '>−</button>' +
          '<data value="' + i.qtd + '">' + i.qtd + '</data>' +
          '<button type="button" data-acao="mais" data-item="' + i.id + '" aria-label="Aumentar quantidade">+</button>' +
        '</td>' +
        '<td>' + brl(i.preco) + '</td>' +
        '<td>' + brl(i.preco * i.qtd) + '</td>' +
        '<td><span class="selo">' + NOMES[st] + '</span></td>' +
        '<td><a href="#excluir-item" class="btn-icone" data-acao="excluir" data-item="' + i.id + '" aria-label="Excluir item"></a></td>' +
        '</tr>';
    }).join('');

    const tt = DB.totais(atual, 0);
    $('#c-taxa').checked = atual.taxa;
    $('#c-sub').textContent = brl(tt.sub);
    $('#c-taxa-v').textContent = brl(tt.taxa);
    $('#c-total').textContent = brl(tt.total);
    $('#c-total-btn').textContent = brl(tt.total);
  }

  function renderSelectMesa(s) {
    Array.from(selMesa.options).forEach(o => {
      if (!o.value) return;
      const ocupada = s.comandas.some(c => c.mesa === Number(o.value));
      o.disabled = ocupada;
      o.textContent = 'Mesa ' + o.value + (ocupada ? ' (ocupada)' : '');
    });
  }

  function render() {
    const s = DB.get();
    const atual = comandaAtual();
    renderMapa(s, atual);
    renderLista(s, atual);
    renderComanda(s, atual);
    renderSelectMesa(s);
  }

  /* ---------- pagamento ---------- */
  function atualizarPagamento() {
    const c = comandaAtual();
    if (!c) return;
    const t = DB.totais(c, Number(pDesc.value) || 0);
    const bruto = DB.totais(c, 0);
    $('#p-taxa').checked = c.taxa;
    $('#p-sub').textContent = brl(t.sub);
    $('#p-taxa-v').textContent = brl(t.taxa);
    $('#p-total').textContent = brl(t.total);
    pDesc.max = (bruto.sub + bruto.taxa).toFixed(2);
  }

  function prepararPagamento() {
    pForma.value = '';
    pDesc.value = '';
    atualizarPagamento();
  }

  /* ---------- eventos ---------- */
  // Mapa de mesas e lista de comandas
  document.addEventListener('click', e => {
    const mesa = e.target.closest('.mesas .mesa');
    if (mesa) {
      if (mesa.dataset.cmd) {
        DB.selecionar(Number(mesa.dataset.cmd));
        render();
      } else {
        selMesa.value = mesa.dataset.mesa;
      }
      return;
    }
    const cmd = e.target.closest('#lista-comandas a[data-cmd]');
    if (cmd) {
      DB.selecionar(Number(cmd.dataset.cmd));
      render();
    }
  });

  // Quantidade e exclusão de itens
  $('#c-corpo').addEventListener('click', async e => {
    const b = e.target.closest('[data-acao]');
    const c = comandaAtual();
    if (!b || !c) return;
    const id = Number(b.dataset.item);
    const item = c.itens.find(i => i.id === id);
    if (!item) return;

    if (b.dataset.acao === 'mais') { await DB.setQtd(c.id, id, item.qtd + 1); render(); }
    if (b.dataset.acao === 'menos') { await DB.setQtd(c.id, id, item.qtd - 1); render(); }
    if (b.dataset.acao === 'excluir') {
      itemParaExcluir = id;
      $('#excluir-nome').textContent = item.nome;
    }
  });

  // Taxa de serviço (tela e pagamento ficam sincronizadas)
  $('#c-taxa').addEventListener('change', async e => {
    const c = comandaAtual();
    if (!c) return;
    await DB.setTaxa(c.id, e.target.checked);
    render();
  });
  $('#p-taxa').addEventListener('change', async e => {
    const c = comandaAtual();
    if (!c) return;
    await DB.setTaxa(c.id, e.target.checked);
    render();
    atualizarPagamento();
  });
  pDesc.addEventListener('input', atualizarPagamento);

  // Abrir nova comanda
  $('#form-comanda').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const f = form.elements;
    const mesa = Number(f.mesa.value);
    const cliente = f.cliente.value.trim();
    if (!mesa || !cliente) return;
    if (DB.mesaOcupada(mesa)) { DB.aviso('Essa mesa já tem uma comanda aberta.'); return; }
    const c = await DB.abrirComanda({ mesa: mesa, cliente: cliente, taxa: f.taxa.checked });
    if (!c) return;
    DB.selecionar(c.id);
    form.reset();
    render();
    location.hash = '#comanda';
  });

  // Adicionar produto
  $('#form-produto').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const c = comandaAtual();
    if (!c) { DB.aviso('Abra ou selecione uma comanda primeiro.'); location.hash = '#topo'; return; }
    const opt = $('#a-item').selectedOptions[0];
    if (!opt || !opt.value) return;
    const ok = await DB.addItem(c.id, {
      nome: opt.value,
      preco: Number(opt.dataset.preco),
      qtd: Math.max(1, parseInt($('#a-qtd').value, 10) || 1),
      obs: $('#a-obs').value.trim()
    });
    if (!ok) return;
    form.reset();
    render();
    location.hash = '#comanda';
    DB.aviso('Pedido enviado para a cozinha.');
  });

  // Excluir item
  $('#form-excluir').addEventListener('submit', async e => {
    e.preventDefault();
    const c = comandaAtual();
    if (c && itemParaExcluir) await DB.removerItem(c.id, itemParaExcluir);
    itemParaExcluir = null;
    render();
    location.hash = '#comanda';
  });

  // Cancelar comanda
  $('#form-cancelar').addEventListener('submit', async e => {
    e.preventDefault();
    const c = comandaAtual();
    if (c) { await DB.cancelar(c.id); DB.selecionar(null); }
    render();
    location.hash = '#topo';
  });

  // Abrir pagamento: só com comanda e itens
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href="#pagamento"]');
    if (!a) return;
    const c = comandaAtual();
    if (!c) { e.preventDefault(); DB.aviso('Selecione uma comanda para fechar.'); return; }
    if (!c.itens.length) { e.preventDefault(); DB.aviso('Adicione ao menos um item antes de fechar a comanda.'); }
  });

  // Confirmar pagamento e mostrar comprovante
  let fechando = false;
  document.addEventListener('click', async e => {
    const a = e.target.closest('a[href="#comprovante"]');
    if (!a) return;
    e.preventDefault();                       // o comprovante só abre depois que o banco confirmar
    if (fechando) return;
    const c = comandaAtual();
    if (!c || !c.itens.length) return;
    if (!pForma.reportValidity() || !pDesc.reportValidity()) return;
    fechando = true;
    try {
      const rec = await DB.fechar(c.id, { pagamento: pForma.value, desconto: Number(pDesc.value) || 0 });
      if (!rec) return;
      DB.preencherRecibo(rec);
      DB.selecionar(null);
      render();
      location.hash = '#comprovante';
    } finally { fechando = false; }
  });

  // Prepara os diálogos quando abrem (por :target)
  function aoMudarHash() {
    const c = comandaAtual();
    if (location.hash === '#pagamento') prepararPagamento();
    if (location.hash === '#cancelar-comanda') {
      $('#cancelar-id').textContent = c ? pad(c.num) + ' · Mesa ' + c.mesa : '';
    }
  }
  window.addEventListener('hashchange', aoMudarHash);

  // Atualiza quando outro aparelho (ex.: cozinha) altera os dados
  DB.onChange(() => {
    const sig = JSON.stringify(DB.get().menu);
    if (sig !== menuSig) {
      menuSig = sig;
      const sel = $('#a-item').value;
      montarCardapio();
      $('#a-item').value = sel;
    }
    render();
  });

  /* ---------- início ---------- */
  menuSig = JSON.stringify(DB.get().menu);
  montarCardapio();
  render();
  aoMudarHash();
});
