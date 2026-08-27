ALTER TABLE "quotation_settings"
  ADD COLUMN "defaultDocumentLanguage" TEXT NOT NULL DEFAULT 'sw';

ALTER TABLE "quotations"
  ADD COLUMN "documentLanguage" TEXT NOT NULL DEFAULT 'sw';
