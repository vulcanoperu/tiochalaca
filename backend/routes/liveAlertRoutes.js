const express = require('express');
const supabase = require('../database');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', async (req, res) => {
  const alerts = req.body.alerts;
  if (!alerts || alerts.length === 0) return res.json({ success: true, count: 0 });
  
  try {
    const { data, error } = await supabase
      .from('live_alerts')
      .upsert(alerts, { onConflict: 'fixture_id,selection', ignoreDuplicates: true });
      
    if (error) throw error;
    res.json({ success: true, count: alerts.length });
  } catch (err) {
    logger.error('liveAlerts', 'Error saving live alerts:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
