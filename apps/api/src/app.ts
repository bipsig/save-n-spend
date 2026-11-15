import 'express-async-errors';
import express from 'express'
import cors from 'cors';
import helmet from 'helmet';
import { isConnected } from './config/db';
import apiRouter from './routes/router';
import { errorHandler, routeNotFound } from './middleware/errorHandler';
import { requireJsonBody } from './middleware/requireJsonBody';
import { requestLogger } from './middleware/requestLogger';

// The Express app without a port or a database: server.ts listens and connects; the tests
// mount it on an in-memory database (test/harness.ts).
const app = express();

// Render (and most hosts) sit behind a proxy — trust the first hop so
// express-rate-limit keys off the real client IP, not the proxy's.
app.set('trust proxy', 1);

// Exposed so the app can read the reference off a response and put it in an error message.
app.use (cors({ exposedHeaders: ['X-Request-Id'] }));
app.use (helmet());
// A reference per request and one structured log line when it's answered — see
// middleware/requestLogger. Replaces morgan's coloured one-liners.
app.use (requestLogger);
// Raised from the unconfigured 100kb default: a full backup export/restore is one JSON
// body carrying a lifetime of transactions. Global rather than a second per-route
// express.json() on the restore endpoint, to avoid double-consuming the same body stream.
app.use (express.json({ limit: '25mb' }));
app.use (requireJsonBody);

// Answers as soon as the port is bound, whether or not Atlas has handed back a
// connection yet. That is deliberate: this endpoint has two jobs beyond telling a human
// the service is up — the uptime ping that stops Render idling the instance, and the poll
// `apps/mobile/store/wake.ts` holds the splash on. Both need a 2xx to make progress, and
// answering 503 for the seconds the handshake takes would mean the pinger records a
// failure and the app sits behind its splash for a database it is not about to query.
// `db` is there so the state is still legible when something is actually wrong.
app.get('/health', (_, res) => res.json({ ok: true, db: isConnected() ? 'connected' : 'connecting' }))
app.use ('/api', apiRouter);

app.use(routeNotFound);
app.use(errorHandler);

export default app;
