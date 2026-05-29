const express = require('express');
const supabase = require('../database');
const logger = require('../utils/logger');
const { runDailyAudit } = require('../services/auditService');

const router = express.Router();

router.get('/global', async (req, res) => {
  try {
    const { data: users, error: errUsers } = await supabase.from('users').select('id');
    const { data: picks, error: errPicks } = await supabase.from('picks').select('pick_data');
    if (errUsers || errPicks) throw errUsers || errPicks;
    
    let totalPicks = 0, totalWon = 0, totalLost = 0;
    picks.forEach(p => {
      const pd = p.pick_data;
      if (pd?.picks) {
        pd.picks.forEach(pick => {
          totalPicks++;
          if (pick.status === 'WON') totalWon++;
          if (pick.status === 'LOST') totalLost++;
        });
      }
    });

    const activeMarkets = {};
    picks.forEach(p => {
      const pd = p.pick_data;
      if (pd?.picks) {
        pd.picks.forEach(pick => {
          if (pick.status === 'PENDING') {
            activeMarkets[pick.market] = (activeMarkets[pick.market] || 0) + 1;
          }
        });
      }
    });

    res.json({
      totalUsers: users.length,
      totalPicks,
      totalWon,
      totalLost,
      winRate: totalWon + totalLost > 0 ? ((totalWon / (totalWon + totalLost)) * 100).toFixed(1) : 0,
      activeMarkets
    });
  } catch(e) {
    res.status(500).json({ error: 'Error stats' });
  }
});

router.get('/audit', async (req, res) => {
  const { date, forceRefresh } = req.query;
  if (!date) return res.status(400).json({ error: 'Falta date' });
  
  try {
    const result = await runDailyAudit(date, forceRefresh === 'true');
    return res.json({ success: true, fromCache: result.fromCache, data: result.data });
  } catch (err) {
    logger.error('stats/audit', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
