/* login.js — entrar com e-mail e senha (Supabase Auth) */
(function () {
  'use strict';

  const CFG = window.JR_CONFIG;
  const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
  const form = document.getElementById('form-login');
  const msg = document.getElementById('msg');

  function mostrar(texto) {
    msg.textContent = texto;
    msg.hidden = !texto;
  }

  if (new URLSearchParams(location.search).get('erro') === 'inativo') {
    mostrar('Sua conta ainda não foi ativada pelo gerente.');
  } else {
    // já está logado? vai direto para o sistema
    sb.auth.getSession().then(({ data }) => { if (data.session) location.replace('index.html'); });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    mostrar('');
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: form.email.value.trim(),
        password: form.senha.value
      });
      if (error) { mostrar('E-mail ou senha incorretos.'); return; }

      const { data: perfil } = await sb.from('profiles').select('ativo').eq('id', data.user.id).maybeSingle();
      if (!perfil || !perfil.ativo) {
        await sb.auth.signOut();
        mostrar('Sua conta ainda não foi ativada pelo gerente.');
        return;
      }
      location.replace('index.html'); // quem não puder ver essa página é levado para a certa
    } catch (err) {
      mostrar('Não foi possível conectar. Tente de novo.');
    } finally { btn.disabled = false; }
  });
})();
