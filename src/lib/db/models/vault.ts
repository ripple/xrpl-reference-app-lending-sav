import mongoose, { Schema } from "mongoose";

const vaultSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "UserWallets", required: true },
    vaultId: { type: String, required: true, unique: true },
    ownerAddress: { type: String, required: true },
    asset: {
      currency: { type: String, required: true },
      issuer: { type: String },
      mptIssuanceId: { type: String },
    },
    totalDeposited: { type: String, default: "0" },
    sharesMinted: { type: String, default: "0" },
    status: { type: String, enum: ["active", "deleted"], default: "active" },
  },
  { timestamps: true }
);

export const VaultModel =
  mongoose.models.Vault || mongoose.model("Vault", vaultSchema);
