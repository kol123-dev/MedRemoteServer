import { Request, Response } from 'express';
import { initiateStkPush, handleCallback } from '../services/mpesa.service';

export const stkPush = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, amount, userId } = req.body;

    if (!phoneNumber || !amount || !userId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = await initiateStkPush(phoneNumber, amount, userId);
    res.status(200).json({ success: true, message: 'Check your phone for the M-Pesa PIN prompt.', data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

export const mpesaCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    if (!body || !body.Body || !body.Body.stkCallback) {
      res.status(400).json({ error: 'Invalid callback data' });
      return;
    }

    await handleCallback(body.Body.stkCallback);

    // Always return success to Safaricom
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error: any) {
    res.status(500).json({ ResultCode: 1, ResultDesc: error.message });
  }
};