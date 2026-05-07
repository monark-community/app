-- High-entropy User-Agent Client Hints captured at recognize-time
-- (model, platform version, full version list). Stored as JSON ;
-- TrustedDeviceView prefers `clientHints.model` over the UA-string
-- parsed model so modern Chrome on Android shows "Pixel 7" instead
-- of the UA-reduced placeholder "K".
ALTER TABLE "TrustedDevice" ADD COLUMN "clientHints" JSONB;
