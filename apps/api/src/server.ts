import 'express-async-errors';
import express from 'express'
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDB from './config/db';
import apiRouter from './routes/router';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();

// Render (and most hosts) sit behind a proxy — trust the first hop so
// express-rate-limit keys off the real client IP, not the proxy's.
app.set('trust proxy', 1);

app.use (cors());
app.use (helmet());
app.use (morgan('dev'));
app.use (express.json());

app.get('/health', (_, res) => res.json({ ok: true }))
app.use ('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, statusCode: 404, message: 'Route not found', data: null });
});
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

// Connect first, then listen — a failed DB connect exits before we accept traffic.
const start = async (): Promise<void> => {
  await connectDB();
  app.listen (PORT, '0.0.0.0', () => {
    console.log (`Server has started on port ${PORT}`);
  });
};

start();