-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('ESSENTIEL', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'STAFF', 'REVIO_ADMIN');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'WALLET_PASS', 'NFC_TAG', 'PAYMENT_CARD');

-- CreateEnum
CREATE TYPE "IdentificationMode" AS ENUM ('PIN', 'STAFF_VALIDATION');

-- CreateEnum
CREATE TYPE "EarnMode" AS ENUM ('PER_EURO', 'PER_VISIT');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'MARKETING_SMS', 'MARKETING_EMAIL', 'AGE_16_PLUS');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY_POLICY', 'MARKETING_SMS', 'MARKETING_EMAIL');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('EARN', 'TIER_BONUS', 'WHEEL_BONUS', 'REDEEM', 'ADJUSTMENT', 'EXPIRATION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "KioskSessionStatus" AS ENUM ('AWAITING_AUTH', 'IDENTIFIED', 'COMPLETED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WheelPrizeType" AS ENUM ('NOTHING', 'POINTS', 'REWARD');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('ACCESS', 'PORTABILITY', 'RECTIFICATION', 'ERASURE', 'MARKETING_OPT_OUT');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DEVICE', 'SYSTEM');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat_number" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'BE',
    "logo_url" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'ESSENTIEL',
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trial_ends_at" TIMESTAMP(3),
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "suspended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "merchant_id" UUID,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" BYTEA,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pairing_code_hash" TEXT,
    "pairing_code_expires_at" TIMESTAMP(3),
    "token_hash" TEXT,
    "paired_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "first_name" TEXT,
    "pin_hash" TEXT,
    "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "pin_locked_until" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "current_tier_id" UUID,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_visit_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identifiers" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "lookup_hash" TEXT NOT NULL,
    "value_enc" BYTEA NOT NULL,
    "display_hint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "customer_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_verifications" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "lookup_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "merchant_id" UUID,
    "type" "LegalDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "legal_document_id" UUID,
    "text_version" TEXT NOT NULL,
    "device_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "merchant_id" UUID NOT NULL,
    "earn_mode" "EarnMode" NOT NULL DEFAULT 'PER_EURO',
    "points_per_euro" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "points_per_visit" INTEGER NOT NULL DEFAULT 10,
    "min_purchase_cents" INTEGER NOT NULL DEFAULT 0,
    "identification_mode" "IdentificationMode" NOT NULL DEFAULT 'PIN',
    "pin_max_attempts" INTEGER NOT NULL DEFAULT 5,
    "points_expiry_months" INTEGER NOT NULL DEFAULT 12,
    "expiry_reminder_days" INTEGER NOT NULL DEFAULT 30,
    "inactivity_retention_months" INTEGER NOT NULL DEFAULT 24,
    "tiers_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tier_window_months" INTEGER NOT NULL DEFAULT 12,
    "wheel_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_points_cap" INTEGER DEFAULT 500,
    "adjustment_alert_daily_count" INTEGER NOT NULL DEFAULT 5,
    "kiosk_reset_seconds" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "tier_levels" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "min_points" INTEGER NOT NULL,
    "bonus_percent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tier_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "staff_user_id" UUID,
    "point_transaction_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wheel_prizes" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" "WheelPrizeType" NOT NULL,
    "points" INTEGER,
    "reward_id" UUID,
    "weight" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wheel_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wheel_spins" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "spin_date" DATE NOT NULL,
    "prize_id" UUID,
    "prize_label" TEXT NOT NULL,
    "point_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wheel_spins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "PointTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "purchase_amount_cents" INTEGER,
    "reason" TEXT,
    "staff_user_id" UUID,
    "device_id" UUID,
    "kiosk_session_id" UUID,
    "related_transaction_id" UUID,
    "idempotency_key" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_sessions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "KioskSessionStatus" NOT NULL DEFAULT 'AWAITING_AUTH',
    "auth_method" "IdentificationMode",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "identified_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "merchant_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_device_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "handled_by_id" UUID,

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_stripe_customer_id_key" ON "merchants"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_stripe_subscription_id_key" ON "merchants"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_merchant_id_idx" ON "users"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_hash_key" ON "devices"("token_hash");

-- CreateIndex
CREATE INDEX "devices_merchant_id_idx" ON "devices"("merchant_id");

-- CreateIndex
CREATE INDEX "customers_merchant_id_last_visit_at_idx" ON "customers"("merchant_id", "last_visit_at");

-- CreateIndex
CREATE INDEX "customer_identifiers_customer_id_idx" ON "customer_identifiers"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identifiers_merchant_id_type_lookup_hash_key" ON "customer_identifiers"("merchant_id", "type", "lookup_hash");

-- CreateIndex
CREATE INDEX "phone_verifications_merchant_id_lookup_hash_created_at_idx" ON "phone_verifications"("merchant_id", "lookup_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_merchant_id_type_version_key" ON "legal_documents"("merchant_id", "type", "version");

-- CreateIndex
CREATE INDEX "consents_merchant_id_customer_id_type_created_at_idx" ON "consents"("merchant_id", "customer_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tier_levels_merchant_id_rank_key" ON "tier_levels"("merchant_id", "rank");

-- CreateIndex
CREATE INDEX "rewards_merchant_id_active_idx" ON "rewards"("merchant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_point_transaction_id_key" ON "redemptions"("point_transaction_id");

-- CreateIndex
CREATE INDEX "redemptions_merchant_id_created_at_idx" ON "redemptions"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "wheel_prizes_merchant_id_active_idx" ON "wheel_prizes"("merchant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "wheel_spins_point_transaction_id_key" ON "wheel_spins"("point_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "wheel_spins_merchant_id_customer_id_spin_date_key" ON "wheel_spins"("merchant_id", "customer_id", "spin_date");

-- CreateIndex
CREATE INDEX "point_transactions_merchant_id_customer_id_occurred_at_idx" ON "point_transactions"("merchant_id", "customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "point_transactions_merchant_id_type_occurred_at_idx" ON "point_transactions"("merchant_id", "type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_merchant_id_idempotency_key_key" ON "point_transactions"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "kiosk_sessions_merchant_id_status_expires_at_idx" ON "kiosk_sessions"("merchant_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "audit_log_merchant_id_created_at_idx" ON "audit_log"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_merchant_id_action_created_at_idx" ON "audit_log"("merchant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "data_requests_merchant_id_status_idx" ON "data_requests"("merchant_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_current_tier_id_fkey" FOREIGN KEY ("current_tier_id") REFERENCES "tier_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identifiers" ADD CONSTRAINT "customer_identifiers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identifiers" ADD CONSTRAINT "customer_identifiers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_levels" ADD CONSTRAINT "tier_levels_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_point_transaction_id_fkey" FOREIGN KEY ("point_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_prizes" ADD CONSTRAINT "wheel_prizes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_prizes" ADD CONSTRAINT "wheel_prizes_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "wheel_prizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_point_transaction_id_fkey" FOREIGN KEY ("point_transaction_id") REFERENCES "point_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_kiosk_session_id_fkey" FOREIGN KEY ("kiosk_session_id") REFERENCES "kiosk_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "point_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_device_id_fkey" FOREIGN KEY ("actor_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

