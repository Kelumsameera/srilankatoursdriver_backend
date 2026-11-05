import { Schema, model } from "mongoose";
import { auditFields, publishableFields } from "./schemas/common.js";

// Facts the AI assistant may quote (policies, pick-up rules, what is included…). Edited in Admin → Content → AI Knowledge.
// Only "published" entries are given to the assistant.
const chatKnowledgeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    ...publishableFields,
    ...auditFields,
  },
  { timestamps: true },
);

export const ChatKnowledge = model("ChatKnowledge", chatKnowledgeSchema);
