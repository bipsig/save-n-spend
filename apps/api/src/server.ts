import express from 'express'
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDB from './config/db';

dotenv.config();

const app = express();

connectDB();

app.use (cors());
app.use (helmet());
app.use (morgan('dev'));
app.use (express.json());

app.get('/health', (_, res) => res.json({ ok: true }))

const PORT = Number(process.env.PORT) || 3000;

app.listen (PORT, '0.0.0.0', () => {
  console.log (`Server has started on port ${PORT}`);
})