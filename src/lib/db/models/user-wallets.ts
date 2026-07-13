import mongoose, { Schema } from "mongoose";

const walletSchema = new Schema(
  {
    address: { type: String, required: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    seed: { type: String, required: true },
    role: {
      type: String,
      enum: ["broker", "depositor", "borrower", "issuer"],
      required: true,
    },
    balance: { type: String },
  },
  { _id: false }
);

const userWalletsSchema = new Schema(
  {
    auth0Sub: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true },
    wallets: { type: [walletSchema], required: true },
    vaultId: { type: String },
    loanBrokerId: { type: String },
    issuedToken: {
      type: { type: String, enum: ["IOU", "MPT"] },
      currency: { type: String },
      issuer: { type: String },
      mptIssuanceId: { type: String },
    },
  },
  { timestamps: true }
);

export const UserWalletsModel =
  mongoose.models.UserWallets ||
  mongoose.model("UserWallets", userWalletsSchema);
