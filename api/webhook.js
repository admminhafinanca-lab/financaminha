import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Aceita evento order.paid ou order.created com status paid
    const event = body.event || body.topic;
    const order = body.data || body;

    const isPaid =
      event === 'order.paid' ||
      (event === 'order.created' && order?.financial_status === 'paid') ||
      order?.financial_status === 'paid';

    if (!isPaid) {
      return res.status(200).json({ message: 'Evento ignorado: ' + event });
    }

    // Extrai e-mail do cliente — tenta vários campos possíveis
    const email =
      order?.email ||
      order?.customer?.email ||
      order?.buyer?.email ||
      body?.email;

    if (!email) {
      console.error('E-mail não encontrado no payload:', JSON.stringify(body));
      return res.status(400).json({ error: 'E-mail não encontrado no payload' });
    }

    const name =
      order?.customer?.first_name ||
      order?.buyer?.first_name ||
      order?.name ||
      email.split('@')[0];

    // Gera senha temporária aleatória
    const tempPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();

    // Verifica se usuário já existe
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const alreadyExists = existingUsers?.users?.some(u => u.email === email);

    if (alreadyExists) {
      console.log('Usuário já existe:', email);
      return res.status(200).json({ message: 'Usuário já cadastrado: ' + email });
    }

    // Cria conta no Supabase com e-mail confirmation
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false, // exige confirmação pelo e-mail
      user_metadata: { full_name: name },
    });

    if (error) {
      console.error('Erro ao criar usuário:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // Envia e-mail de confirmação + link de acesso
    await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password: tempPassword,
      options: {
        redirectTo: 'https://minha-financa-nu.vercel.app',
      },
    });

    console.log('Usuário criado com sucesso:', email);
    return res.status(200).json({ message: 'Usuário criado: ' + email });

  } catch (err) {
    console.error('Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
