import 'express-async-errors';
import express from 'express'
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDB, { isConnected } from './config/db';
import apiRouter from './routes/router';
import { errorHandler } from './middleware/errorHandler';
import { startReminderJob } from './jobs/reminderJob';

dotenv.config();

const app = express();

// Render (and most hosts) sit behind a proxy — trust the first hop so
// express-rate-limit keys off the real client IP, not the proxy's.
app.set('trust proxy', 1);

app.use (cors());
app.use (helmet());
app.use (morgan('dev'));
app.use (express.json());

// Answers as soon as the port is bound, whether or not Atlas has handed back a
// connection yet. That is deliberate: this endpoint has two jobs beyond telling a human
// the service is up — the uptime ping that stops Render idling the instance, and the poll
// `apps/mobile/store/wake.ts` holds the splash on. Both need a 2xx to make progress, and
// answering 503 for the seconds the handshake takes would mean the pinger records a
// failure and the app sits behind its splash for a database it is not about to query.
// `db` is there so the state is still legible when something is actually wrong.
app.get('/health', (_, res) => res.json({ ok: true, db: isConnected() ? 'connected' : 'connecting' }))
app.use ('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, statusCode: 404, message: 'Route not found', data: null });
});
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

// Listen FIRST, then connect. Render has nothing to route to until the port is bound, so an
// Atlas handshake in front of `listen` makes the service unreachable for as long as it takes —
// and if it fails, the container restarts and the 503s stretch across the backoff.
//
// Binding first costs nothing: mongoose buffers commands issued before the connection is
// ready, so a request arriving in the gap waits for the database rather than being told the
// service does not exist.
const start = (): void => {
  app.listen (PORT, '0.0.0.0', () => {
    console.log (`Server has started on port ${PORT}`);
  });

  // Not awaited, and it never rejects — it retries until Atlas answers. The reminder job
  // is scheduled only once that lands, because its first act is a query.
  void connectDB({ retryForever: true }).then(startReminderJob);
};

start();