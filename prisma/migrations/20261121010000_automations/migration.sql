-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "automation_kind" TEXT;

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "google_review_url" TEXT;

-- CreateTable
CREATE TABLE "automations" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automations_merchant_id_kind_key" ON "automations"("merchant_id", "kind");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "automations"
  ADD CONSTRAINT automation_kind_values CHECK (kind IN ('WELCOME', 'REWARD_READY', 'WIN_BACK', 'LOYALTY_ANNIVERSARY', 'POINTS_EXPIRING', 'REVIEW_REQUEST')),
  ADD CONSTRAINT automation_message_length CHECK (length(message) BETWEEN 5 AND 300);
ALTER TABLE "merchants"
  ADD CONSTRAINT google_review_url_https CHECK (google_review_url IS NULL OR (google_review_url LIKE 'https://%' AND length(google_review_url) <= 300));

-- Droits et isolation (règle 1 de CLAUDE.md)
GRANT SELECT, INSERT, UPDATE ON automations TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON automations TO revio_system;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON automations
  USING (merchant_id = app_current_merchant()) WITH CHECK (merchant_id = app_current_merchant());
