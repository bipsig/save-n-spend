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

connectDB();

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

app.listen (PORT, '0.0.0.0', () => {
  console.log (`Server has started on port ${PORT}`);
})