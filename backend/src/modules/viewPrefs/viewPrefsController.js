import { viewPrefsService } from './viewPrefsService.js';

export const viewPrefsController = {
  async get(req, res, next) {
    try {
      const colWidths = await viewPrefsService.get(req.user.id, req.params.projectId);
      res.json({ colWidths });
    } catch (err) {
      next(err);
    }
  },

  async upsert(req, res, next) {
    try {
      const result = await viewPrefsService.upsert(req.user.id, req.params.projectId, req.body.colWidths);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
