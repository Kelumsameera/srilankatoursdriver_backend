// Runs before every test file (before src/config/env.ts is imported).
process.env.NODE_ENV = "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/unused-in-tests";
process.env.JWT_ACCESS_SECRET = "test_access_secret_test_access_secret_0123456789";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_test_refresh_secret_0123456789";
process.env.SEED_ADMIN_EMAIL = "admin@test.local";
process.env.SEED_ADMIN_PASSWORD = "AdminPassw0rd!";
process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
process.env.CLOUDINARY_API_KEY = "123456789012345";
process.env.CLOUDINARY_API_SECRET = "test-cloudinary-secret";
process.env.CLOUDINARY_ROOT_FOLDER = "srilankatoursdriver";
process.env.TRANSLATION_PROVIDER = "none";
