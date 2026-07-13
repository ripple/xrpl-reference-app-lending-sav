import mongoose from "mongoose";

// Lazy check — MONGODB_URI must be set at request time, not at build/import
// time. Failing fast on missing env breaks `next build` in CI where no DB
// is available, and the app is fine as long as no route actually connects.
const cached = global as typeof globalThis & {
  mongoose: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

if (!cached.mongoose) {
  cached.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.mongoose.conn) return cached.mongoose.conn;
  if (!cached.mongoose.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI environment variable is required");
    cached.mongoose.promise = mongoose.connect(uri);
  }
  cached.mongoose.conn = await cached.mongoose.promise;
  return cached.mongoose.conn;
}
