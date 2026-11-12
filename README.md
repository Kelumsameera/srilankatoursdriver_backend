# Sri Lanka Tours Driver – Backend

Express 5 + TypeScript API supporting the Sri Lanka Tours Driver website. The repository includes MongoDB models, application routes, integrations, scripts, and tests.

## Stack

Node.js 24, Express, Mongoose / MongoDB, Zod, Cloudinary, Nodemailer, JSON Web Tokens, bcryptjs and Google AI libraries.

## Local development

```bash
npm install
# Configure the required environment variables in your local environment.
npm run dev
```

Do not commit MongoDB credentials, session/JWT secrets, email passwords or external API keys. Consult `src/config/` and integration services for required environment values.

## Scripts

- `npm run dev` — run TypeScript source with watch
- `npm run build` — TypeScript compile
- `npm run start` — run compiled server
- `npm run typecheck` — TypeScript type check
- `npm run lint` — ESLint
- `npm run test:email` — email-related tests
- `npm run test:awards` — awards-related tests

Other content, admin-bootstrap and integration verification scripts are listed in `package.json`. Check their prerequisites before running them against real data.

## Layout

- `src/routes/` — API route definitions
- `src/controllers/` — handlers
- `src/models/` — data models
- `src/middleware/` — request security and middleware
- `src/validations/` — schema validation
- `src/services/` — integrations and business operations
- `src/scripts/` — maintenance and content operations
- `tests/` — automated tests

## Frontend

[Frontend repository](https://github.com/Kelumsameera/srilankatoursdriver_frontend).

## Deployment checklist

Configure the database, secure authentication cookies, CORS/trusted proxy, rate limits, cloud media and mail integration. Review admin bootstrap and any scripts that mutate production data. Run build, typecheck, lint and relevant integration tests before deployment.

This documentation update does not imply that the current commit has passed CI or live deployment checks.
