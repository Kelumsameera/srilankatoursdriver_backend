/** Read-only: prints document counts per collection. */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
await connectDatabase();
const cols = await mongoose.connection.db!.listCollections().toArray();
for (const c of cols.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(c.name.padEnd(22), await mongoose.connection.db!.collection(c.name).countDocuments());
}
for (const name of ["tours", "destinations", "excursions", "vehicles"]) {
  const docs = await mongoose.connection.db!.collection(name).find({}, { projection: { slug: 1, "heroMedia.url": 1, "images.url": 1 } }).toArray();
  console.log(`\n${name}:`, docs.map((d) => d.slug).join(", "));
}
await disconnectDatabase();
