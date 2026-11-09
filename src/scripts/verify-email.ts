import { verifyEmailConnection } from "../services/email/email.service.js";

const ok = await verifyEmailConnection();
console.log(ok ? "Titan SMTP connection and authentication verified (no email sent)" : "Titan SMTP verification failed; check safe diagnostic logs");
process.exitCode = ok ? 0 : 1;
