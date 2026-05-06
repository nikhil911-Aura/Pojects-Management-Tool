import customFieldService from './customFieldService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

const customFieldController = {
  async getByProject(req, res) {
    const fields = await customFieldService.getByProject(req.params.projectId, req.user.id);
    return successResponse(res, fields);
  },

  async create(req, res) {
    const field = await customFieldService.create(req.params.projectId, req.user.id, req.body);
    return createdResponse(res, field);
  },

  async update(req, res) {
    const field = await customFieldService.update(req.params.fieldId, req.user.id, req.body);
    return successResponse(res, field);
  },

  async delete(req, res) {
    await customFieldService.delete(req.params.fieldId, req.user.id);
    return successResponse(res, null, 'Field deleted');
  },

  async setValue(req, res) {
    const result = await customFieldService.setValue(req.params.fieldId, req.params.taskId, req.user.id, req.body.value);
    return successResponse(res, result);
  },

  async getValues(req, res) {
    const values = await customFieldService.getValuesForProject(req.params.projectId, req.user.id);
    return successResponse(res, values);
  }
};

export default customFieldController;
