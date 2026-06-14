import mongoose from 'mongoose'

const connectDB = async () => {

  const MONGO_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.fhe4x2y.mongodb.net/?appName=Cluster0`
  
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