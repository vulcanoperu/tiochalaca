const express = require('express');
const supabase = require('../database');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware común: todas las rutas de picks requieren auth
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { data: picks, error } = await supabase.from('picks').select('*').eq('user_id', req.user.id).order('date', { ascending: false });
    if (error) throw error;
    const formatted = picks.map(p => ({
      ...p.pick_data,
      id: p.id
    }));
    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: 'Error obteniendo picks' });
  }
});

router.post('/', async (req, res) => {
  try {
    const entry = req.body;
    const { data, error } = await supabase.from('picks').insert([{
      user_id: req.user.id,
      fixture_id: entry.fixtureId,
      home_team: entry.home,
      away_team: entry.away,
      date: entry.date || new Date().toISOString(),
      pick_data: entry
    }]).select('id').single();
    
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: 'Error guardando pick' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('picks').update({ pick_data: req.body }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error actualizando pick' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('picks').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error borrando pick' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { error } = await supabase.from('picks').delete().eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error borrando historial' });
  }
});

module.exports = router;
