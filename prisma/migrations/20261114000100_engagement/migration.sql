-- Heures creuses, bonus de régularité, message du jour, métier du commerce

ALTER TABLE "merchants" ADD COLUMN "kiosk_message" TEXT, ADD COLUMN "business_type" TEXT;

ALTER TABLE "rules"
  ADD COLUMN "visit_milestone_every" INTEGER,
  ADD COLUMN "visit_milestone_points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "streak_weeks" INTEGER,
  ADD COLUMN "streak_points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "anniversary_points" INTEGER;

ALTER TABLE "rules"
  ADD CONSTRAINT milestone_range CHECK (visit_milestone_every IS NULL OR (visit_milestone_every BETWEEN 2 AND 1000 AND visit_milestone_points > 0)),
  ADD CONSTRAINT streak_range CHECK (streak_weeks IS NULL OR (streak_weeks BETWEEN 2 AND 52 AND streak_points > 0)),
  ADD CONSTRAINT anniversary_range CHECK (anniversary_points IS NULL OR anniversary_points > 0);

ALTER TABLE "merchants"
  ADD CONSTRAINT kiosk_message_length CHECK (kiosk_message IS NULL OR length(kiosk_message) <= 200);

CREATE TABLE "bonus_periods" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "multiplier_percent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bonus_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT bonus_day CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT bonus_minutes CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute),
    CONSTRAINT bonus_multiplier CHECK (multiplier_percent BETWEEN 110 AND 500)
);
CREATE INDEX "bonus_periods_merchant_id_day_of_week_idx" ON "bonus_periods"("merchant_id", "day_of_week");
ALTER TABLE "bonus_periods" ADD CONSTRAINT "bonus_periods_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Droits et isolation (règle 1 de CLAUDE.md)
GRANT SELECT, INSERT, UPDATE, DELETE ON bonus_periods TO revio_app, revio_system;
ALTER TABLE bonus_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bonus_periods
  USING (merchant_id = app_current_merchant()) WITH CHECK (merchant_id = app_current_merchant());

-- Signe des nouveaux bonus : toujours positifs
ALTER TABLE point_transactions DROP CONSTRAINT points_sign;
ALTER TABLE point_transactions ADD CONSTRAINT points_sign CHECK (
  CASE type
    WHEN 'EARN' THEN points >= 0
    WHEN 'TIER_BONUS' THEN points > 0
    WHEN 'WHEEL_BONUS' THEN points > 0
    WHEN 'HAPPY_HOUR_BONUS' THEN points > 0
    WHEN 'VISIT_MILESTONE_BONUS' THEN points > 0
    WHEN 'STREAK_BONUS' THEN points > 0
    WHEN 'ANNIVERSARY_BONUS' THEN points > 0
    WHEN 'REDEEM' THEN points < 0
    WHEN 'EXPIRATION' THEN points < 0
    ELSE points <> 0
  END);
