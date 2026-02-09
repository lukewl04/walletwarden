/**
 * Gated Feature Routes — LLM Insights & CSV/PDF Export
 *
 * These routes are server-side gated by plan entitlements.
 * Even if someone crafts a direct API call, the middleware blocks it.
 *
 * LLM:    requireCapability('canUseLLM')     → Pro only
 * Export: requireCapability('canExport')      → Plus & Pro
 */

const express = require('express');
const { requireCapability } = require('../entitlements');

module.exports = function gatedFeatureRoutes(prisma) {
  const router = express.Router();

  // ── LLM-powered insights ───────────────────────────────────────────
  // Pro-only. Blocked server-side before any LLM call is made.
  router.post(
    '/llm/insights',
    requireCapability('canUseLLM'),
    async (req, res) => {
      try {
        const userId = req.auth?.sub;
        if (!userId) return res.status(401).json({ error: 'unauthorized' });

        // TODO: Implement LLM insight generation
        // - Load user transactions
        // - Build prompt
        // - Call LLM provider (OpenAI / Anthropic / etc.)
        // - Return structured insight

        return res.json({
          ok: true,
          insight: 'LLM insights coming soon — this endpoint is ready and gated to Pro users.',
        });
      } catch (err) {
        console.error('[LLM] Error:', err.message);
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── CSV export ─────────────────────────────────────────────────────
  // Plus & Pro.
  router.get(
    '/export/csv',
    requireCapability('canExport'),
    async (req, res) => {
      try {
        const userId = req.auth?.sub;
        if (!userId) return res.status(401).json({ error: 'unauthorized' });

        const transactions = await prisma.transaction.findMany({
          where: { user_id: userId },
          orderBy: { date: 'desc' },
          select: {
            id: true,
            type: true,
            amount: true,
            date: true,
            category: true,
            description: true,
            source: true,
          },
        });

        // Build CSV
        const headers = 'Date,Type,Amount,Category,Description,Source';
        const csvRows = transactions.map((t) => {
          const date = t.date ? new Date(t.date).toISOString().slice(0, 10) : '';
          const desc = (t.description || '').replace(/"/g, '""');
          return `${date},${t.type},${t.amount},"${t.category || ''}","${desc}",${t.source}`;
        });

        const csv = [headers, ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="walletwarden-export-${new Date().toISOString().slice(0, 10)}.csv"`);
        return res.send(csv);
      } catch (err) {
        console.error('[Export] CSV error:', err.message);
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  // ── PDF export (stub) ──────────────────────────────────────────────
  // Plus & Pro.
  router.get(
    '/export/pdf',
    requireCapability('canExport'),
    async (req, res) => {
      try {
        const userId = req.auth?.sub;
        if (!userId) return res.status(401).json({ error: 'unauthorized' });

        // TODO: Implement PDF generation (e.g. with puppeteer, pdfkit, or jsPDF)
        return res.status(501).json({
          ok: false,
          message: 'PDF export is coming soon. CSV export is available now.',
        });
      } catch (err) {
        console.error('[Export] PDF error:', err.message);
        return res.status(500).json({ error: 'internal_error', message: err.message });
      }
    }
  );

  return router;
};
