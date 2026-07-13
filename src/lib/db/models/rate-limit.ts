import mongoose, { Schema } from "mongoose";

/**
 * Fixed-window rate-limit counter. One document per (base key, time bucket):
 * the `key` embeds the window bucket so each window is a distinct doc and we
 * never have to reset a counter in place. The TTL index purges expired
 * buckets automatically. See src/lib/rate-limit.ts for the access helper.
 */
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

// TTL index — Mongo deletes the doc once `expiresAt` is in the past.
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel =
  mongoose.models.RateLimit || mongoose.model("RateLimit", rateLimitSchema);
