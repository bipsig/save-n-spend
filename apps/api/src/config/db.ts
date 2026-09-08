import mongoose from 'mongoose'

// One Atlas cluster, two databases: prod in production, dev everywhere else.
// An explicit DB_NAME env var wins if set (e.g. a throwaway test db in CI).
export const resolveDbName = (): string => {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  return process.env.NODE_ENV === 'production' ? 'save-n-spend-prod' : 'save-n-spend-dev';
}

const buildUri = (): string =>
  `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@ac-ubakita-shard-00-00.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-01.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-02.fhe4x2y.mongodb.net:27017/?ssl=true&replicaSet=atlas-sbadk3-shard-0&authSource=admin&appName=Cluster0`;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

/** Emitted after the first successful connect, so callers can defer DB-dependent work. */
export const isConnected = (): boolean => mongoose.connection.readyState === 1;

/**
 * Connect to Atlas.
 *
 * `retryForever` is for the long-running server, and the difference matters on Render's
 * free tier. The container is cold-started by an inbound request, and Atlas can take
 * longer to hand back a connection than the request is willing to wait. Exiting the
 * process on that first failure — which is what this used to do — is the worst available
 * answer: Render responds to the exit by restarting the container with backoff, so one
 * slow handshake turns into minutes during which nothing is listening and every request
 * gets a 503. Retrying leaves the already-bound port up and lets the next attempt win.
 *
 * The scripts want the opposite. They are interactive and short-lived, so they take the
 * default and get a rejected promise they can fail loudly on.
 */
const connectDB = async ({ retryForever = false }: { retryForever?: boolean } = {}): Promise<void> => {
  const dbName = resolveDbName();
  let delay = FIRST_RETRY_MS;

  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(buildUri(), { dbName });
      console.log(`MongoDB connected: ${mongoose.connection.host} (db: ${dbName})`);
      return;
    }
    catch (err) {
      const reason = (err as Error).message;
      if (!retryForever) {
        throw new Error(`MongoDB connection failed: ${reason}`);
      }
      console.error(`MongoDB connect attempt ${attempt} failed, retrying in ${delay / 1000}s: ${reason}`);
      await wait(delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    }
  }
}

export default connectDB;
