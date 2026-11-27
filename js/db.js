/* ==========================================================================
   db.js — dados compartilhados entre todas as páginas (Supabase)
   Mantém as mesmas funções de antes, mas os dados agora vêm do Supabase.
   Cardápio, comandas abertas, pedidos da cozinha (KDS) e histórico.
   Nada do restaurante é salvo no navegador: só o login (token) do Supabase.
   ========================================================================== */
(function (global) {
  'use strict';

  const CFG  = global.JR_CONFIG || {};
  const TAXA = 0.10;
  const NOMES = { recebido: 'Recebido', preparo: 'Em preparo', pronto: 'Pronto', entregue: 'Entregue' };

  // Quais páginas cada perfil pode abrir (a primeira é a página inicial dele)
  const PAGINAS = {
    gerente: ['index.html', 'mesas.html', 'pedidos.html', 'historico.html'],
    garcom:  ['index.html', 'mesas.html', 'pedidos.html'],
    cozinha: ['pedidos.html']
  };

  const FOTO_VAZIA = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ffd28b"/>' +
    '<text x="300" y="210" font-family="sans-serif" font-size="32" font-weight="700" fill="#8c1010" text-anchor="middle">Sem foto</text></svg>');

  /* ---------- utilidades ---------- */
  const r2   = n => Math.round((Number(n) || 0) * 100) / 100;
  const p2   = n => String(n).padStart(2, '0');
  const pad  = n => '#' + String(n).padStart(3, '0');
  const brl  = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc  = t => String(t == null ? '' : t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dataHora(iso) {
    const d = new Date(iso);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function hora(iso) {
    const d = new Date(iso);
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  /* ---------- avisos rápidos ---------- */
  function aviso(msg, ms) {
    document.querySelectorAll('output.toast').forEach(x => x.remove()); // um aviso por vez
    const o = document.createElement('output');
    o.className = 'toast';
    o.setAttribute('role', 'status');
    o.textContent = msg;
    document.body.appendChild(o);
    setTimeout(() => o.remove(), ms || 3200);
  }

  /* ---------- conexão ---------- */
  const sb = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

  let S = { menu: [], comandas: [], pedidos: [], historico: [] };  // cópia em memória (não é salva no navegador)
  let perfil = null;
  let opcoes = {};
  const ouvintes = [];

  function get() { return S; }
  function onChange(fn) { ouvintes.push(fn); }

  /* ---------- conversão banco -> formato que as páginas já usavam ---------- */
  const mapItem = i => ({ id: i.id, nome: i.nome, preco: Number(i.preco), qtd: i.qtd, obs: i.obs || '' });
  const porId = (a, b) => a.id - b.id;

  const mapMenu = m => ({
    id: m.id, cat: m.cat, nome: m.nome, desc: m.descricao || '', preco: Number(m.preco),
    foto: m.foto_url || '', fotoDriveId: m.foto_drive_id || null, disponivel: m.disponivel
  });

  const mapComanda = c => ({
    id: c.id, num: c.id, mesa: c.mesa, cliente: c.cliente, aberta: c.aberta, taxa: c.taxa,
    itens: (c.comanda_itens || []).map(mapItem).sort(porId)
  });

  const mapPedido = p => ({
    id: p.id, comandaId: p.comanda_id, comandaNum: p.comanda_id, mesa: p.mesa, cliente: p.cliente,
    itemId: p.item_id, nome: p.nome, qtd: p.qtd, obs: p.obs || '',
    status: p.status, criado: p.criado, atualizado: p.atualizado
  });

  const mapHistorico = c => ({
    id: c.id, num: c.id, mesa: c.mesa, cliente: c.cliente, aberta: c.aberta, fechada: c.fechada,
    pagamento: c.pagamento || '', subtotal: Number(c.subtotal), taxa: Number(c.taxa_valor),
    desconto: Number(c.desconto), total: Number(c.total),
    itens: (c.comanda_itens || []).map(i => ({ nome: i.nome, qtd: i.qtd, preco: Number(i.preco) }))
  });

  async function carregar() {
    const consultas = [
      sb.from('menu_itens').select('*').order('id'),
      sb.from('comandas').select('*, comanda_itens(*)').eq('status', 'aberta').order('id'),
      sb.from('v_pedidos_kds').select('*').order('criado')
    ];
    if (opcoes.historico) {
      consultas.push(sb.from('comandas').select('*, comanda_itens(*)').eq('status', 'fechada')
        .order('fechada', { ascending: false }).limit(1000));
    }
    const r = await Promise.all(consultas);
    r.forEach(x => { if (x.error) throw x.error; });
    S = {
      menu: r[0].data.map(mapMenu),
      comandas: r[1].data.map(mapComanda),
      pedidos: r[2].data.map(mapPedido),
      historico: opcoes.historico ? r[3].data.map(mapHistorico) : S.historico
    };
  }

  /* ---------- tempo real (a cozinha enxerga na hora) ---------- */
  function assinar() {
    let t = null;
    let ok = false;
    const agendar = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        try { await carregar(); ouvintes.forEach(f => f()); } catch (e) { /* tenta de novo no próximo evento */ }
      }, 300);
    };
    const canal = sb.channel('jr-tempo-real');
    ['pedidos', 'comandas', 'comanda_itens', 'menu_itens'].forEach(tabela =>
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, agendar));
    canal.subscribe(st => { ok = st === 'SUBSCRIBED'; });
    setInterval(() => { if (!ok) agendar(); }, 15000); // reserva se o tempo real cair
  }

  /* ---------- erros ---------- */
  function traduz(e) {
    const m = (e && e.message) || '';
    if (e && e.code === '23505') return 'Essa mesa já tem uma comanda aberta.';
    if (e && (e.code === '42501' || /row-level security|permission denied/i.test(m))) return 'Você não tem permissão para essa ação.';
    if (/failed to fetch|networkerror/i.test(m)) return 'Sem conexão com o servidor.';
    return m ? 'Erro: ' + m : '';
  }
  function falha(e, padrao) {
    console.error(e);
    aviso(traduz(e) || padrao, 8000); // erro fica mais tempo na tela
    return null;
  }

  /* ---------- comanda selecionada (fica na URL: mesas.html?c=12) ---------- */
  function selecionada() {
    return Number(new URLSearchParams(location.search).get('c')) || null;
  }
  function selecionar(id) {
    const u = new URL(location.href);
    if (id) u.searchParams.set('c', id); else u.searchParams.delete('c');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }

  /* ---------- regras de negócio ---------- */
  function totais(c, desconto) {
    const sub = r2(c.itens.reduce((a, i) => a + i.preco * i.qtd, 0));
    const taxa = c.taxa ? r2(sub * TAXA) : 0;
    const bruto = r2(sub + taxa);
    const desc = Math.min(Math.max(r2(desconto), 0), bruto);
    return { sub, taxa, desconto: desc, total: r2(bruto - desc) };
  }

  function mesaOcupada(mesa) {
    return S.comandas.find(c => c.mesa === Number(mesa)) || null;
  }

  async function abrirComanda({ mesa, cliente, taxa }) {
    try {
      const { data, error } = await sb.from('comandas')
        .insert({ mesa: Number(mesa), cliente: cliente, taxa: !!taxa }).select().single();
      if (error) throw error;
      await carregar();
      return S.comandas.find(c => c.id === data.id) ||
        { id: data.id, num: data.id, mesa: data.mesa, cliente: data.cliente, aberta: data.aberta, taxa: data.taxa, itens: [] };
    } catch (e) { return falha(e, 'Não foi possível abrir a comanda.'); }
  }

  async function addItem(cmdId, { nome, preco, qtd, obs }) {
    try {
      const { data, error } = await sb.from('comanda_itens')
        .insert({ comanda_id: cmdId, nome: nome, preco: Number(preco), qtd: qtd || 1, obs: obs || '' })
        .select().single();
      if (error) throw error;          // o pedido da cozinha é criado automaticamente no banco
      await carregar();
      return mapItem(data);
    } catch (e) { return falha(e, 'Não foi possível adicionar o item.'); }
  }

  async function setQtd(cmdId, itemId, qtd) {
    try {
      const { error } = await sb.from('comanda_itens').update({ qtd: Math.max(1, qtd) }).eq('id', itemId);
      if (error) throw error;
      await carregar();
    } catch (e) { falha(e, 'Não foi possível alterar a quantidade.'); }
  }

  async function removerItem(cmdId, itemId) {
    try {
      const { error } = await sb.from('comanda_itens').delete().eq('id', itemId);
      if (error) throw error;
      await carregar();
    } catch (e) { falha(e, 'Não foi possível remover o item.'); }
  }

  async function setTaxa(cmdId, ligada) {
    try {
      const { error } = await sb.from('comandas').update({ taxa: !!ligada }).eq('id', cmdId);
      if (error) throw error;
      await carregar();
    } catch (e) { falha(e, 'Não foi possível alterar a taxa.'); }
  }

  async function cancelar(cmdId) {
    try {
      const { error } = await sb.rpc('cancelar_comanda', { p_id: cmdId });
      if (error) throw error;
      await carregar();
    } catch (e) { falha(e, 'Não foi possível cancelar a comanda.'); }
  }

  async function fechar(cmdId, { pagamento, desconto }) {
    try {
      const c = S.comandas.find(x => x.id === cmdId);
      const itens = c ? c.itens.map(x => ({ nome: x.nome, qtd: x.qtd, preco: x.preco })) : [];
      const { data, error } = await sb.rpc('fechar_comanda', { p_id: cmdId, p_pagamento: pagamento, p_desconto: desconto });
      if (error) throw error;
      await carregar();
      return {
        id: data.id, num: data.id, mesa: data.mesa, cliente: data.cliente,
        aberta: data.aberta, fechada: data.fechada, pagamento: data.pagamento,
        subtotal: Number(data.subtotal), taxa: Number(data.taxa_valor),
        desconto: Number(data.desconto), total: Number(data.total), itens: itens
      };
    } catch (e) { return falha(e, 'Não foi possível fechar a comanda.'); }
  }

  async function setStatus(pedidoId, status) {
    const p = S.pedidos.find(x => x.id === pedidoId);
    if (p) { p.status = status; p.atualizado = new Date().toISOString(); } // mostra na hora
    try {
      const { error } = await sb.from('pedidos').update({ status: status }).eq('id', pedidoId);
      if (error) throw error;
    } catch (e) { falha(e, 'Não foi possível atualizar o pedido.'); }
    try { await carregar(); } catch (e) { /* ignora */ }
  }

  /* ---------- cardápio ---------- */
  const colunasMenu = o => ({
    cat: o.cat, nome: o.nome, descricao: o.desc, preco: o.preco, foto_url: o.foto, disponivel: o.disponivel
  });

  async function menuAdd(o) {
    try {
      const { data, error } = await sb.from('menu_itens').insert(colunasMenu(o)).select();
      if (error) throw error;
      if (!data || !data.length) throw { code: '42501' };
      await carregar();
      return mapMenu(data[0]);
    } catch (e) { return falha(e, 'Não foi possível salvar o item.'); }
  }

  async function menuUpdate(id, o) {
    try {
      const dados = colunasMenu(o);
      if (o.limparDrive) dados.foto_drive_id = null;
      const { data, error } = await sb.from('menu_itens').update(dados).eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw { code: '42501' };
      await carregar();
      return mapMenu(data[0]);
    } catch (e) { return falha(e, 'Não foi possível atualizar o item.'); }
  }

  async function menuDelete(id) {
    try {
      const item = S.menu.find(m => m.id === id);
      const { data, error } = await sb.from('menu_itens').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw { code: '42501' };
      if (item && item.fotoDriveId) apagarFotoDrive(item.fotoDriveId); // limpa o Drive (sem travar)
      await carregar();
      return true;
    } catch (e) { falha(e, 'Não foi possível excluir o item.'); return false; }
  }

  /* ---------- Google Drive (via Edge Function upload-drive) ---------- */
  async function chamarDrive(metodo, corpo, tipoJson) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sessão expirada. Entre de novo.');
    const headers = { Authorization: 'Bearer ' + session.access_token, apikey: CFG.SUPABASE_KEY };
    if (tipoJson) headers['Content-Type'] = 'application/json';
    const r = await fetch(CFG.SUPABASE_URL + '/functions/v1/upload-drive', { method: metodo, headers: headers, body: corpo });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || ('Falha no envio (' + r.status + ')'));
    return j;
  }

  async function enviarFoto(arquivo, menuItemId) {
    try {
      if (arquivo.size > 25 * 1024 * 1024) { aviso('A foto passa de 25 MB.', 8000); return false; }
      const fd = new FormData();
      fd.append('file', arquivo);
      fd.append('tipo', 'foto_prato');
      fd.append('menu_item_id', String(menuItemId));
      await chamarDrive('POST', fd, false);
      await carregar();
      return true;
    } catch (e) { falha(e, 'Não foi possível enviar a foto.'); return false; }
  }

  async function apagarFotoDrive(driveId) {
    try { await chamarDrive('DELETE', JSON.stringify({ drive_file_id: driveId }), true); } catch (e) { /* melhor esforço */ }
  }

  /* ---------- comprovante (usado em Mesas e Histórico) ---------- */
  function preencherRecibo(rec) {
    const $ = id => document.getElementById(id);
    const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };

    set('r-cmd', pad(rec.num));
    set('r-mesa', rec.mesa);
    set('r-cliente', rec.cliente);
    set('r-data', dataHora(rec.fechada));
    set('r-sub', brl(rec.subtotal));
    set('r-taxa', brl(rec.taxa));
    set('r-total', brl(rec.total));
    set('r-forma', rec.pagamento);

    const temDesc = rec.desconto > 0;
    ['r-desc-t', 'r-desc'].forEach(id => { const e = $(id); if (e) e.hidden = !temDesc; });
    set('r-desc', '- ' + brl(rec.desconto));

    const corpo = $('r-itens');
    if (corpo) {
      corpo.textContent = '';
      rec.itens.forEach(i => {
        const tr = document.createElement('tr');
        [i.nome, i.qtd, brl(i.preco * i.qtd)].forEach(v => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        });
        corpo.appendChild(tr);
      });
    }
  }

  /* ---------- login, perfil e menu ---------- */
  const liberar = () => document.documentElement.classList.add('jr-ok');
  const nuncaResolve = () => new Promise(() => {});

  function paginaAtual() {
    let n = location.pathname.split('/').pop() || 'index.html';
    if (n.indexOf('.') < 0) n += '.html';
    return n;
  }

  async function sair() {
    try { await sb.auth.signOut(); } catch (e) { /* ignora */ }
    location.replace('login.html');
  }

  function montarMenu() {
    const permitidas = PAGINAS[perfil.papel] || [];
    const ul = document.querySelector('#menu ul');
    if (!ul) return;
    Array.from(ul.querySelectorAll('li')).forEach(li => {
      const a = li.querySelector('a[href]');
      const arq = a && a.getAttribute('href').split('#')[0];
      if (arq && /\.html$/.test(arq) && permitidas.indexOf(arq) < 0) li.remove();
    });
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.dataset.sair = '';
    a.textContent = 'Sair (' + (perfil.nome || perfil.papel) + ')';
    li.appendChild(a);
    ul.appendChild(li);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-sair]')) { e.preventDefault(); sair(); }
    if (e.target.closest('[data-imprimir]')) window.print();
  });

  async function init(op) {
    opcoes = op || {};
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { location.replace('login.html'); return nuncaResolve(); }

      const { data: p } = await sb.from('profiles').select('nome, papel, ativo').eq('id', session.user.id).maybeSingle();
      if (!p || !p.ativo) {
        await sb.auth.signOut();
        location.replace('login.html?erro=inativo');
        return nuncaResolve();
      }
      perfil = p;

      const permitidas = PAGINAS[p.papel] || [];
      if (permitidas.indexOf(paginaAtual()) < 0) {
        location.replace(permitidas[0] || 'login.html');
        return nuncaResolve();
      }

      sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });

      document.body.classList.add('papel-' + p.papel);
      montarMenu();
      await carregar();
      assinar();
      liberar();
    } catch (e) {
      liberar();
      falha(e, 'Não foi possível conectar ao banco de dados.');
      throw e;
    }
  }

  function pronto(fn, op) { return init(op).then(fn); }

  global.DB = {
    NOMES, TAXA, FOTO_VAZIA, brl, norm, esc, pad, dataHora, hora,
    get, onChange, selecionada, selecionar, init, pronto, sair,
    perfil: () => perfil,
    totais, mesaOcupada, abrirComanda, addItem, setQtd, removerItem, setTaxa,
    cancelar, fechar, setStatus, preencherRecibo, aviso,
    menuAdd, menuUpdate, menuDelete, enviarFoto
  };
})(window);
