import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/*
 * One AI-assistant chat with a website visitor.
 * The visitor's cookie holds a random id; only its SHA-256 hash is stored here (sessionHash),
 * so a database leak cannot be used to take over a chat.
 */

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const chatConversationSchema = new Schema(
  {
    sessionHash: { type: String, required: true, unique: true, select: false },
    locale: { type: String, default: "en" },
    /** Signed-in website customer this chat belongs to (set by POST /api/customer/chat/link); unset for guests. */
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: false, index: true },
    messages: { type: [chatMessageSchema], default: [] },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    /** Booking request the assistant prepared; only saved as a Booking when the visitor presses Confirm. */
    bookingDraft: { type: Schema.Types.Mixed, default: null },
    /** Booking created from this chat (reference + id), for the admin inbox. */
    booking: { reference: String, id: String },
    /** The visitor asked for a person: shown in the admin inbox. */
    handoff: { requested: { type: Boolean, default: false, index: true }, reason: { type: String, default: "" }, at: Date },
    /** Lead management in the admin inbox. */
    leadStatus: { type: String, enum: ["none", "new", "contacted", "converted", "closed"], default: "none", index: true },
    contact: { name: { type: String, default: "" }, email: { type: String, default: "" } },
    staffNote: { type: String, default: "", maxlength: 4000 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    /** Retention: MongoDB deletes the chat automatically after this date (moved forward on every message). */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

chatConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
chatConversationSchema.index({ updatedAt: -1 });

export const ChatConversation = model("ChatConversation", chatConversationSchema);
export type ChatConversationDocument = HydratedDocument<InferSchemaType<typeof chatConversationSchema>>;
