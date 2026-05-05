const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ ADVERTENCIA: Faltan SUPABASE_URL o SUPABASE_KEY en backend/.env');
  console.warn('La base de datos no funcionará hasta que los agregues.');
}

// Inicializar cliente de Supabase
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Función para asegurar que exista el admin (Opcional en la nube, pero lo mantenemos por consistencia)
async function initDb() {
  if (!supabaseUrl) return;

  try {
    const { data: admin, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', 'chalaca')
      .single();

    if (!admin && error?.code === 'PGRST116') { // PGRST116: JSON object requested, multiple (or no) rows returned
      console.log('Creando usuario admin por defecto...');
      const hash = bcrypt.hashSync('chalaca', 10);
      await supabase.from('users').insert([{ username: 'chalaca', password: hash, role: 'admin' }]);
    }
  } catch (err) {
    console.error('Error inicializando db admin:', err.message);
  }
}

initDb();

module.exports = supabase;
