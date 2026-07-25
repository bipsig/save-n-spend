import mongoose from 'mongoose'

// One Atlas cluster, two databases: prod in production, dev everywhere else.
// An explicit DB_NAME env var wins if set (e.g. a throwaway test db in CI).
export const resolveDbName = (): string => {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  return process.env.NODE_ENV === 'production' ? 'save-n-spend-prod' : 'save-n-spend-dev';
}

const connectDB = async (): Promise<void> => {

  const MONGO_URI = `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@ac-ubakita-shard-00-00.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-01.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-02.fhe4x2y.mongodb.net:27017/?ssl=true&replicaSet=atlas-sbadk3-shard-0&authSource=admin&appName=Cluster0`

  const dbName = resolveDbName();

  try {
    // dbName selects the database on the cluster — cleaner than editing the URI path.
    await mongoose.connect(MONGO_URI, { dbName });
    console.log (`MongoDB connected: ${mongoose.connection.host} (db: ${dbName})`);
  }
  catch (err) {
    console.error (`MongoDB connection failed: ${(err as Error).message}`);
    process.exit (1);
  }
}

export default connectDB;