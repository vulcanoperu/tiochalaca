const express = require('express');
const supabase = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { scannerStatus, forceScanNow } = require('../jobs/valueBetScanner');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('value_bets')
      .select('*')
      .order('discovered_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    res.json({
      success: true,
      lastScan: scannerStatus.lastScan,
      status: scannerStatus.status,
      scannedMatches: scannerStatus.scannedMatches,
      error: scannerStatus.lastError,
      bets: data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Forzar escaneo manual (solo admin)
router.post('/scan', authenticateToken, requireAdmin, async (req, res) => {
  if (scannerStatus.status === 'scanning') {
    return res.status(400).json({ success: false, error: 'Ya hay un escaneo en progreso' });
  }
  
  // No esperamos a que termine para responder, lo lanzamos en background
  forceScanNow().catch(e => console.error("Error manual scan:", e));
  
  res.json({ success: true, message: 'Escaneo iniciado en segundo plano' });
});

module.exports = router;
