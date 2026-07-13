import mongoose, { Schema } from "mongoose";

const loanSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "UserWallets", required: true },
    loanId: { type: String, required: true, unique: true },
    loanBrokerId: { type: String, required: true },
    borrowerAddress: { type: String, required: true },
    principalRequested: { type: String, required: true },
    interestRate: { type: Number, required: true },
    paymentTotal: { type: Number, required: true },
    paymentInterval: { type: Number, required: true },
    gracePeriod: { type: Number, required: true },
    originationFee: { type: String, required: true },
    serviceFee: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "active", "repaid", "closed", "defaulted"],
      default: "active",
    },
    paymentsRemaining: { type: Number, required: true },
    principalOutstanding: { type: String, required: true },
  },
  { timestamps: true }
);

export const LoanModel =
  mongoose.models.Loan || mongoose.model("Loan", loanSchema);
