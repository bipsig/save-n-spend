import mongoose from 'mongoose'

const connectDB = async (): Promise<void> => {

  const MONGO_URI = `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@ac-ubakita-shard-00-00.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-01.fhe4x2y.mongodb.net:27017,ac-ubakita-shard-00-02.fhe4x2y.mongodb.net:27017/?ssl=true&replicaSet=atlas-sbadk3-shard-0&authSource=admin&appName=Cluster0`
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log (`MongoDB conencted: ${mongoose.connection.host}`);
  }
  catch (err) {
    console.error (`MongoDB connection failed: ${(err as Error).message}`);
    process.exit (1);
  }
}

export default connectDB;