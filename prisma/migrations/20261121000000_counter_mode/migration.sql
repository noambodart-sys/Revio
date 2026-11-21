-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "kiosk_background" TEXT,
ADD COLUMN     "kiosk_theme" TEXT NOT NULL DEFAULT 'moderne',
ADD COLUMN     "kiosk_title" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "staff_pin_hash" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;


-- Contraintes
ALTER TABLE "merchants"
  ADD CONSTRAINT kiosk_theme_values CHECK (kiosk_theme IN ('moderne', 'chaleureux', 'elegant', 'pop')),
  ADD CONSTRAINT kiosk_title_length CHECK (kiosk_title IS NULL OR length(kiosk_title) <= 80);
-- Un compte avec e-mail doit avoir un mot de passe (et inversement) ; l'admin Revio en a toujours un
ALTER TABLE "users"
  ADD CONSTRAINT login_pair CHECK ((email IS NULL) = (password_hash IS NULL)),
  ADD CONSTRAINT admin_has_login CHECK (role <> 'REVIO_ADMIN' OR email IS NOT NULL),
  ADD CONSTRAINT user_can_work CHECK (email IS NOT NULL OR staff_pin_hash IS NOT NULL);

-- Le propriétaire gère son équipe : création et modification des comptes de SON commerce (RLS)
GRANT INSERT, UPDATE ON users TO revio_app;
