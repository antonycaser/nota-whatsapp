/** Dados de demonstração para o preview (usa as funções do backend diretamente). */
(function (G) {
  G.seedDemo = function () {
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const pick = a => a[Math.floor(rnd() * a.length)];

    instalar();
    usr_resetAdmin_();
    const admin = db_all_('Usuarios')[0];
    const salt = 'demo';
    db_update_('Usuarios', admin.id, { nome: 'Lara Altoé', salt, hash: auth_hash_('demo1234', salt), trocarSenha: 'nao' });
    cfg_gravar_(Object.assign(cfg_(), { studioNome: 'Lara Altoé Makeup & Beauty', responsavel: 'Lara', endereco: 'Rua Oscar Freire, 1200 – Jardins, São Paulo',
      instagram: '@laraaltoe', telefone: '11999998888', pix: 'contato@laraaltoe.com', mostrarEventosGoogle: true }));

    const julia = prof_salvar_({ nome: 'Júlia Martins', comissao: 40, cor: '#9c8074' });
    const camila = prof_salvar_({ nome: 'Lara Altoé', comissao: 0, cor: '#0f7f7c' });
    const servs = db_all_('Servicos');
    const S = n => servs.find(s => s.nome === n).id;

    const nomes = ['Ana Souza', 'Beatriz Lima', 'Carolina Alves', 'Daniela Costa', 'Eduarda Ribeiro', 'Fernanda Gomes', 'Gabriela Martins',
      'Helena Duarte', 'Isabela Freitas', 'Juliana Moreira', 'Larissa Pinto', 'Mariana Teixeira', 'Natália Barros', 'Paula Mendes', 'Rafaela Cardoso',
      'Sofia Araújo', 'Tatiane Rocha', 'Valentina Nunes', 'Yasmin Castro', 'Letícia Farias', 'Amanda Dias', 'Bruna Vieira'];
    const hoje = new Date();
    const clientes = nomes.map((n, i) => {
      const nasc = new Date(1985 + (i % 15), (i * 5 + hoje.getMonth()) % 12, 1 + (i * 7) % 27);
      if (i === 2) nasc.setMonth(hoje.getMonth(), hoje.getDate());
      return cli_salvar_({ nome: n, telefone: '119' + String(80000000 + i * 1234567).slice(0, 8), nascimento: ymd(nasc),
        instagram: '@' + n.split(' ')[0].toLowerCase() + '.' + n.split(' ')[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
        origem: pick(['Instagram', 'Indicação', 'Google', 'Instagram', 'TikTok']), tags: i % 6 === 0 ? 'noiva' : i % 4 === 0 ? 'VIP' : '',
        tipoPele: pick(['Mista', 'Oleosa', 'Seca', 'Normal', 'Sensível']), alergias: i === 0 ? 'Cola de cílios' : '', forcar: true });
    });
    // clientes "antigas" sem retorno
    const combos = [[S('Maquiagem social')], [S('Design de sobrancelha')], [S('Design com henna')], [S('Penteado social')],
      [S('Maquiagem social'), S('Penteado social')], [S('Brow lamination')], [S('Escova modelada')], [S('Cílios fio a fio')], [S('Maquiagem para madrinha'), S('Penteado social')]];
    const horas = ['09:00', '10:00', '11:00', '13:30', '14:00', '15:30', '16:00', '17:00', '18:00'];
    const formas = ['Pix', 'Pix', 'Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'];

    for (let dia = -150; dia <= 12; dia++) {
      const d = new Date(hoje.getTime() + dia * 86400000);
      if (d.getDay() === 0) continue;
      const qtd = dia === 0 ? 5 : Math.floor(rnd() * (d.getDay() === 6 ? 6 : 4)) + (d.getDay() === 6 ? 2 : 0);
      const usadas = {};
      for (let k = 0; k < qtd; k++) {
        let h = pick(horas); if (usadas[h]) continue; usadas[h] = 1;
        const cli = dia < -60 && k === 0 ? clientes[18 + (Math.abs(dia) % 4)] : clientes[Math.floor(rnd() * 18)];
        const sv = pick(combos);
        const noiva = rnd() < 0.04 && dia > -120;
        const p = { clienteId: cli.id, servicoIds: noiva ? [S('Maquiagem de noiva'), S('Penteado de noiva')] : sv, profissionalId: rnd() < 0.55 ? camila.id : julia.id,
          data: ymd(d), hora: h, forcar: true, sinal: noiva ? 300 : 0, local: noiva ? 'Domicílio' : 'Studio' };
        const a = ag_salvar_(p);
        if (dia < 0) {
          const r = rnd();
          if (r < 0.06) ag_status_({ id: a.id, status: 'faltou' });
          else if (r < 0.1) ag_status_({ id: a.id, status: 'cancelado' });
          else ag_finalizar_({ id: a.id, forma: pick(formas), pago: rnd() > 0.04, desconto: rnd() < 0.1 ? 20 : 0 });
        } else if (dia === 0) {
          const ag = db_get_('Agendamentos', a.id);
          if (ag.inicio.slice(11, 16) < '12:00') ag_finalizar_({ id: a.id, forma: 'Pix', pago: true });
          else if (k % 2) ag_status_({ id: a.id, status: 'confirmado' });
        } else if (rnd() < 0.45) ag_status_({ id: a.id, status: 'confirmado' });
        else if (rnd() < 0.08) ag_status_({ id: a.id, status: 'remarcar' });
      }
    }
    // Despesas mensais
    for (let m = -5; m <= 0; m++) {
      const base = new Date(hoje.getFullYear(), hoje.getMonth() + m, 5);
      const dt = ymd(base);
      const pago = m < 0 ? 'pago' : 'pago';
      fin_salvar_({ tipo: 'despesa', categoria: 'Aluguel', descricao: 'Aluguel da sala', valor: 1800, data: dt, status: pago, forma: 'Pix' });
      fin_salvar_({ tipo: 'despesa', categoria: 'Produtos e insumos', descricao: 'Reposição de maquiagem', valor: 600 + Math.round(rnd() * 700), data: ymd(new Date(base.getTime() + 6 * 864e5)), status: 'pago', forma: 'Cartão de crédito' });
      fin_salvar_({ tipo: 'despesa', categoria: 'Energia, água e internet', descricao: 'Luz + internet', valor: 280 + Math.round(rnd() * 80), data: ymd(new Date(base.getTime() + 10 * 864e5)), status: 'pago', forma: 'Pix' });
      fin_salvar_({ tipo: 'despesa', categoria: 'Marketing e anúncios', descricao: 'Anúncios Instagram', valor: 350, data: ymd(new Date(base.getTime() + 2 * 864e5)), status: 'pago', forma: 'Cartão de crédito' });
      fin_salvar_({ tipo: 'despesa', categoria: 'Impostos (MEI/DAS)', descricao: 'DAS MEI', valor: 75.6, data: ymd(new Date(base.getTime() + 15 * 864e5)), status: 'pago', forma: 'Pix' });
      if (m % 2 === 0) fin_salvar_({ tipo: 'receita', categoria: 'Venda de produtos', descricao: 'Venda de kit skincare', valor: 180 + Math.round(rnd() * 200), data: ymd(new Date(base.getTime() + 9 * 864e5)), status: 'pago', forma: 'Pix' });
    }
    fin_salvar_({ tipo: 'despesa', categoria: 'Equipamentos', descricao: 'Ring light nova', valor: 420, data: ymd(new Date(hoje.getTime() + 6 * 864e5)), status: 'pendente', vencimento: ymd(new Date(hoje.getTime() + 6 * 864e5)) });
    // WhatsApp configurado (demo)
    PropertiesService.getScriptProperties().setProperty('WA_SECRET', JSON.stringify(Object.assign(waSecret_(), { provedor: 'zapi', zapiInstancia: 'DEMO', zapiToken: 'DEMOTOKEN' })));
    const c = cfg_(); c.wa.ativo = true; cfg_gravar_(c);
    // compromisso pessoal no Google Agenda
    const amanha = new Date(hoje.getTime() + 864e5); amanha.setHours(12, 0, 0, 0);
    if (G.__MOCK) G.__MOCK.addExterno('Almoço com a mãe', amanha, new Date(amanha.getTime() + 90 * 60000));
    _memo = {};
    return true;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
