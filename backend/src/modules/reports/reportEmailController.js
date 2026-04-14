import * as reportEmailService from './reportEmailService.js';

export const addReportEmail = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    const savedEmail = await reportEmailService.addReportEmail(workspaceId, email.toLowerCase(), name);
    res.status(201).json(savedEmail);
  } catch (error) {
    console.error('Add report email error:', error);
    res.status(500).json({ message: 'Failed to add email' });
  }
};

export const removeReportEmail = async (req, res) => {
  try {
    const { workspaceId, emailId } = req.params;
    await reportEmailService.removeReportEmail(workspaceId, emailId);
    res.status(204).send();
  } catch (error) {
    console.error('Remove report email error:', error);
    res.status(500).json({ message: 'Failed to remove email' });
  }
};

export const getReportEmails = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const emails = await reportEmailService.getReportEmails(workspaceId);
    res.json(emails);
  } catch (error) {
    console.error('Get report emails error:', error);
    res.status(500).json({ message: 'Failed to get emails' });
  }
};

export const searchWorkspaceMembers = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { q } = req.query;
    
    if (!q || q.length < 1) {
      return res.json([]);
    }
    
    const members = await reportEmailService.searchWorkspaceMembers(workspaceId, q);
    res.json(members);
  } catch (error) {
    console.error('Search workspace members error:', error);
    res.status(500).json({ message: 'Failed to search members' });
  }
};