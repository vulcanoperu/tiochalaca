const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chalaca_super_secret_key_2026';

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').insert([{ username, password: hash, role: 'pending' }]);
    if (error) throw error;
    res.json({ success: true, message: 'Usuario registrado correctamente' });
  } catch (e) {
    if (e.message?.includes('duplicate') || e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();
    if (error || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || 'Desconocida';
    
    // Actualización asíncrona para no bloquear el login (si falla porque la columna no existe, se ignora)
    supabase.from('users').update({ last_ip: clientIp, last_login: new Date().toISOString() }).eq('id', user.id).then();

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar_url: user.avatar_url } });
  } catch(e) {
    res.status(500).json({ error: 'Error en login' });
  }
});

// Ver perfil (útil para revisar si el rol cambió)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users').select('role').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Google OAuth via Supabase
router.post('/google', async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'Falta access_token' });

  try {
    const { data: { user: googleUser }, error } = await supabase.auth.getUser(access_token);
    if (error || !googleUser) return res.status(401).json({ error: 'Token de Google inválido' });

    const email      = googleUser.email;
    const googleId   = googleUser.id;
    const avatarUrl  = googleUser.user_metadata?.avatar_url || null;
    const fullName   = googleUser.user_metadata?.full_name || googleUser.user_metadata?.name || email.split('@')[0];

    // Buscar usuario existente por google_id o email
    let { data: existing } = await supabase.from('users')
      .select('*')
      .or(`google_id.eq.${googleId},email.eq.${email}`)
      .maybeSingle();

    let dbUser = existing;
    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || 'Desconocida';

    if (!dbUser) {
      let username = fullName.replace(/\s+/g, '_').toLowerCase();
      
      const insertAttempt = async (uname) => {
        return await supabase.from('users')
          .insert([{ username: uname, email, google_id: googleId, avatar_url: avatarUrl, password: '', role: 'pending', last_ip: clientIp, last_login: new Date().toISOString() }])
          .select()
          .single();
      };

      let attempt = await insertAttempt(username);
      if (attempt.error && (attempt.error.code === '23505' || attempt.error.message.includes('duplicate'))) {
        username = `${username}_${Math.floor(Math.random() * 10000)}`;
        attempt = await insertAttempt(username);
      }

      if (attempt.error) throw attempt.error;
      dbUser = attempt.data;
    } else {
      const updatePayload = { last_ip: clientIp, last_login: new Date().toISOString() };
      if (!dbUser.google_id) {
        updatePayload.google_id = googleId;
        updatePayload.avatar_url = avatarUrl;
        updatePayload.email = email;
      }
      supabase.from('users').update(updatePayload).eq('id', dbUser.id).then();
    }

    const token = jwt.sign(
      { id: dbUser.id, username: dbUser.username, role: dbUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, avatar_url: avatarUrl } });
  } catch (e) {
    logger.error('Google Auth', e.message, e);
    res.status(500).json({ error: 'Error en autenticación con Google', details: e.message || e.toString() });
  }
});

module.exports = router;
