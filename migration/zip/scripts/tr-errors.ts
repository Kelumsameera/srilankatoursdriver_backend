/** Read-only: groups translation errors. */
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { Translation } from "../../../src/models/index.js";
await connectDatabase();
const rows = await Translation.aggregate([
  { $group: { _id: { type: "$entityType", err: "$lastError", provider: "$provider", origin: "$origin" }, n: { $sum: 1 }, last: { $max: "$lastErrorAt" }, locales: { $addToSet: "$locale" } } },
  { $sort: { n: -1 } },
]);
for (const r of rows) console.log(r.n, JSON.stringify(r._id), r.last, r.locales.length);
await disconnectDatabase();
