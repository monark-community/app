-- User-configurable trust window for new TrustedDevice rows. UI
-- exposes 30 / 60 / 90 days ; default 90 picks the longest option so
-- the first-time experience matches "stay signed in for a while" while
-- still landing inside the option list (a value the Select can't
-- display is surprising). The RFC 6265bis 400-day cookie ceiling is
-- still respected at write-time via `clampDeviceTtlDays` ; values
-- above 400 are physically impossible on the cookie side anyway.

ALTER TABLE "User"
  ADD COLUMN "trustedDeviceTtlDays" INTEGER NOT NULL DEFAULT 90;
