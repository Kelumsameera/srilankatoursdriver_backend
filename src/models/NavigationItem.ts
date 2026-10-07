import { Schema, model } from "mongoose";

const navigationItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, trim: true, default: "" },
    parent: { type: Schema.Types.ObjectId, ref: "NavigationItem", default: null, index: true },
    location: { type: String, enum: ["header"], default: "header" },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    openInNewTab: { type: Boolean, default: false },
    isCta: { type: Boolean, default: false },
    icon: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

navigationItemSchema.index({ location: 1, parent: 1, order: 1 });

export const NavigationItem = model("NavigationItem", navigationItemSchema);
