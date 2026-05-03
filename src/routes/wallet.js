import { Router } from 'express';
import { createWallet } from '../xrpl/wallet.js';
import { db } from '../db.js';

const r = Router();

r.post('/', async (req, res, next) => {
  try {
    const { currency = 'XRP' } = req.body;
    const result = await createWallet('test-user-id', currency);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

r.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, xrpl_address, currency, balance, updated_at FROM wallets WHERE user_id = ',
      ['test-user-id']
    );
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
