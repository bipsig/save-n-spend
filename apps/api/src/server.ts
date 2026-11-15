import dotenv from 'dotenv';
import app from './app';
import connectDB from './config/db';
import { startReminderJob } from './jobs/reminderJob';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

// Loopback unless told otherwise: a dev server is for the machine it runs on. The deployed
// instance has to accept the platform's traffic, so Render (NODE_ENV=production, and its own
// RENDER variable) binds every interface. Set HOST=0.0.0.0 to reach a dev API from a phone
// on the LAN.
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : '127.0.0.1');

// Listen FIRST, then connect. Render has nothing to route to until the port is bound, so an
// Atlas handshake in front of `listen` makes the service unreachable for as long as it takes —
// and if it fails, the container restarts and the 503s stretch across the backoff.
//
// Binding first costs nothing: mongoose buffers commands issued before the connection is
// ready, so a request arriving in the gap waits for the database rather than being told the
// service does not exist.
const start = (): void => {
  app.listen (PORT, HOST, () => {
    console.log (`Server has started on ${HOST}:${PORT}`);
  });

  // Not awaited, and it never rejects — it retries until Atlas answers. The reminder job
  // is scheduled only once that lands, because its first act is a query.
  void connectDB({ retryForever: true }).then(startReminderJob);
};

start();
