-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SENDING', 'SENT', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "rules" ADD COLUMN     "sms_max_per_month" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "segment_key" TEXT NOT NULL,
    "template_key" TEXT,
    "message" TEXT NOT NULL,
    "offer_title" TEXT,
    "offer_valid_until" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'SENDING',
    "recipients_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_id" UUID,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_merchant_id_created_at_idx" ON "campaigns"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "campaign_recipients_merchant_id_customer_id_sent_at_idx" ON "campaign_recipients"("merchant_id", "customer_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_customer_id_key" ON "campaign_recipients"("campaign_id", "customer_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes
ALTER TABLE "rules" ADD CONSTRAINT sms_max_range CHECK (sms_max_per_month BETWEEN 1 AND 8);
ALTER TABLE "campaigns"
  ADD CONSTRAINT campaign_message_length CHECK (length(message) BETWEEN 1 AND 480),
  ADD CONSTRAINT campaign_offer_length CHECK (offer_title IS NULL OR length(offer_title) <= 80);

-- Droits et isolation (règle 1 de CLAUDE.md)
GRANT SELECT, INSERT, UPDATE ON campaigns TO revio_app;
GRANT SELECT, INSERT, UPDATE ON campaign_recipients TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns, campaign_recipients TO revio_system;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campaigns
  USING (merchant_id = app_current_merchant()) WITH CHECK (merchant_id = app_current_merchant());
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campaign_recipients
  USING (merchant_id = app_current_merchant()) WITH CHECK (merchant_id = app_current_merchant());
