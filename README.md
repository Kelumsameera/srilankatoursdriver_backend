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

## Content translations

`npm run translations:audit` checks every registered content type and supported target language. It writes a detailed report to the ignored `translation-work/audit.json` file.

`npm run translations:complete` previews missing/outdated content and the amount of text to translate. Add `-- --apply` to translate and save using the configured Gemini key. Use `--locales=de,fr` to restrict the run. Existing locked translations remain protected, and changed source content or concurrent translation edits stop the save. A backup and resumable per-language checkpoints are kept under `translation-work/completion/`. URLs and placeholders are validated before saving, and affected frontend caches are revalidated.

`npm run translations:review -- --apply` checks checkpoint translations against their English source for incorrect meaning, omissions and mismatched fields. Corrections and reasons are saved locally. Review those corrections, then run `npm run translations:complete -- --apply --use-cache` to apply the corrected checkpoints to content. Source IDs, rather than array positions, associate generated translations with fields.

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
