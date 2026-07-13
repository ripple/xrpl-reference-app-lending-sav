import mongoose, { Schema } from "mongoose";

const depositHistorySchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "UserWallets", required: true },
    vaultId: { type: String, required: true },
    type: { type: String, enum: ["deposit", "withdraw"], required: true },
    amountDrops: { type: String, required: true },
    txHash: { type: String },
  },
  { timestamps: true }
);

depositHistorySchema.index({ sessionId: 1, vaultId: 1 });

export const DepositHistoryModel =
  mongoose.models.DepositHistory ||
  mongoose.model("DepositHistory", depositHistorySchema);
