import { connectDatabase, disconnectDatabase } from "../config/db.js";
async function test() {
  await connectDatabase();
  console.log("Connected successfully!");
  await disconnectDatabase();
}
test().catch(err => {
  console.error("Connection failed:", err.message);
  process.exit(1);
});

