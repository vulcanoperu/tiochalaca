const express = require('express');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const supabase = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware común para todas las rutas admin
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('id, username, role, created_at, email, google_id, last_ip, last_login').order('created_at', { ascending: false });
    if (error) throw error;
    
    // Obtener todas las picks
    const { data: allPicks } = await supabase.from('picks').select('user_id, pick_data');
    
    const usersWithStats = users.map(u => {
      const userPicks = (allPicks || []).filter(p => p.user_id === u.id);
      let total = 0, won = 0, lost = 0;
      userPicks.forEach(p => {
        const pd = p.pick_data;
        if (pd?.picks) {
          pd.picks.forEach(pick => {
            total++;
            if (pick.status === 'WON') won++;
            if (pick.status === 'LOST') lost++;
          });
        }
      });
      return { ...u, stats: { total, won, lost } };
    });

    res.json(usersWithStats);
  } catch (e) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

router.get('/users/:ip/location', async (req, res) => {
  const { ip } = req.params;
  // Fallbacks for localhost IPs
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    return res.json({ status: 'success', country: 'Localhost', regionName: 'Desarrollo', city: 'Local' });
  }
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}?lang=es`);
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching location' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'No puedes borrar tu propia cuenta' });
  try {
    await supabase.from('users').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Error borrando usuario' });
  }
});

// Cambiar rol de usuario
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['pending', 'user', 'vip', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  try {
    await supabase.from('users').update({ role }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar rol' });
  }
});

// Crear usuario desde el panel admin
router.post('/users', async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').insert([{ username, password: hash, role }]);
    if (error) throw error;
    res.json({ success: true, message: 'Usuario creado correctamente' });
  } catch (e) {
    if (e.message?.includes('duplicate') || e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error interno' });
  }
});

// Cambiar contraseña de usuario (Fuerza bruta de admin)
router.put('/users/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'La contraseña no puede estar vacía' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    await supabase.from('users').update({ password: hash }).eq('id', req.params.id);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// Endpoint para el panel admin (obtiene ultimas 50 alertas)
router.get('/live-alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('live_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ success: true, alerts: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
