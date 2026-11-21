import { verifyEmailConnection } from "../services/email/email.service.js";

const ok = await verifyEmailConnection();
console.log(ok
  ? "Frontend mail route reachable and Titan SMTP verified (no email sent)"
  : "Email verification failed. Check diagnostic logs.");
process.exitCode = ok ? 0 : 1;
