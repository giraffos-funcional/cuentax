CREATE TYPE "public"."rcv_sync_status" AS ENUM('pendiente', 'sincronizado', 'error');--> statement-breakpoint
CREATE TYPE "public"."rcv_tipo" AS ENUM('compras', 'ventas');--> statement-breakpoint
CREATE TABLE "rcv_detalles" (
	"id" serial PRIMARY KEY NOT NULL,
	"rcv_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"tipo_dte" integer NOT NULL,
	"folio" integer NOT NULL,
	"fecha_emision" text NOT NULL,
	"rut_contraparte" varchar(15) NOT NULL,
	"razon_social" text,
	"neto" bigint DEFAULT 0,
	"exento" bigint DEFAULT 0,
	"iva" bigint DEFAULT 0,
	"total" bigint DEFAULT 0,
	"iva_no_recuperable" bigint DEFAULT 0,
	"dte_document_id" integer,
	"odoo_move_id" integer,
	"estado_rcv" varchar(20),
	"detalle_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rcv_registros" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"tipo" "rcv_tipo" NOT NULL,
	"mes" integer NOT NULL,
	"year" integer NOT NULL,
	"total_neto" bigint DEFAULT 0,
	"total_iva" bigint DEFAULT 0,
	"total_exento" bigint DEFAULT 0,
	"total_registros" integer DEFAULT 0,
	"sync_status" "rcv_sync_status" DEFAULT 'pendiente',
	"sync_date" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sii_user" varchar(50);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sii_password_enc" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sii_rcv_auto_sync" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sii_rcv_last_sync" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rcv_detalles" ADD CONSTRAINT "rcv_detalles_rcv_id_rcv_registros_id_fk" FOREIGN KEY ("rcv_id") REFERENCES "public"."rcv_registros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rcv_detalles" ADD CONSTRAINT "rcv_detalles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rcv_detalles" ADD CONSTRAINT "rcv_detalles_dte_document_id_dte_documents_id_fk" FOREIGN KEY ("dte_document_id") REFERENCES "public"."dte_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rcv_registros" ADD CONSTRAINT "rcv_registros_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rcv_detalle_rcv_idx" ON "rcv_detalles" USING btree ("rcv_id");--> statement-breakpoint
CREATE INDEX "rcv_detalle_company_idx" ON "rcv_detalles" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rcv_detalle_folio_idx" ON "rcv_detalles" USING btree ("rcv_id","tipo_dte","folio");--> statement-breakpoint
CREATE UNIQUE INDEX "rcv_company_period_idx" ON "rcv_registros" USING btree ("company_id","tipo","year","mes");