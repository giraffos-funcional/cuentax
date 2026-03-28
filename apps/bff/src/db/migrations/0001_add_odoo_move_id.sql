-- Add odoo_move_id column to dte_documents for Odoo accounting sync
ALTER TABLE "dte_documents" ADD COLUMN IF NOT EXISTS "odoo_move_id" integer;
