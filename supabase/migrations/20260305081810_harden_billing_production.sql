-- PR-5: Harden billing for production
-- Add 'disputed' status to invoice_status enum
ALTER TYPE "public"."invoice_status" ADD VALUE IF NOT EXISTS 'disputed';

-- Add balance column to invoices (computed from total - payments + credits)
ALTER TABLE "public"."invoices" 
  ADD COLUMN IF NOT EXISTS "balance" numeric DEFAULT 0 NOT NULL;

-- Create payments table
CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "amount" numeric NOT NULL,
    "method" text NOT NULL,
    "reference" text DEFAULT ''::text NOT NULL,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL,
    "entered_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (amount > 0),
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."payments" OWNER TO "postgres";

-- Create payment_allocations table
CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "payment_id" uuid NOT NULL,
    "invoice_id" uuid NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "payment_allocations_amount_check" CHECK (amount > 0),
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") 
        REFERENCES "public"."payments"("id") ON DELETE CASCADE,
    CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") 
        REFERENCES "public"."invoices"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";

-- Create credit_memos table
CREATE TABLE IF NOT EXISTS "public"."credit_memos" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid,
    "client_id" uuid NOT NULL,
    "memo_number" text NOT NULL,
    "reason" text DEFAULT ''::text NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "credit_memos_total_check" CHECK (total <= 0),
    CONSTRAINT "credit_memos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_memos_invoice_id_fkey" FOREIGN KEY ("invoice_id") 
        REFERENCES "public"."invoices"("id") ON DELETE SET NULL,
    CONSTRAINT "credit_memos_client_id_fkey" FOREIGN KEY ("client_id") 
        REFERENCES "public"."clients"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."credit_memos" OWNER TO "postgres";

-- Create credit_memo_lines table
CREATE TABLE IF NOT EXISTS "public"."credit_memo_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "credit_memo_id" uuid NOT NULL,
    "description" text DEFAULT ''::text NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "credit_memo_lines_total_check" CHECK (total <= 0),
    CONSTRAINT "credit_memo_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_memo_lines_credit_memo_id_fkey" FOREIGN KEY ("credit_memo_id") 
        REFERENCES "public"."credit_memos"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."credit_memo_lines" OWNER TO "postgres";

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "payments_client_id_idx" ON "public"."payments"("client_id");
CREATE INDEX IF NOT EXISTS "payments_received_at_idx" ON "public"."payments"("received_at");
CREATE INDEX IF NOT EXISTS "payment_allocations_payment_id_idx" ON "public"."payment_allocations"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_invoice_id_idx" ON "public"."payment_allocations"("invoice_id");
CREATE INDEX IF NOT EXISTS "credit_memos_invoice_id_idx" ON "public"."credit_memos"("invoice_id");
CREATE INDEX IF NOT EXISTS "credit_memos_client_id_idx" ON "public"."credit_memos"("client_id");
CREATE INDEX IF NOT EXISTS "credit_memo_lines_credit_memo_id_idx" ON "public"."credit_memo_lines"("credit_memo_id");

-- Function to compute invoice balance
CREATE OR REPLACE FUNCTION "public"."compute_invoice_balance"(invoice_uuid uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    invoice_total numeric;
    total_payments numeric;
    total_credits numeric;
BEGIN
    -- Get invoice total
    SELECT COALESCE(total, 0) INTO invoice_total
    FROM "public"."invoices"
    WHERE id = invoice_uuid;
    
    -- Sum allocated payments
    SELECT COALESCE(SUM(amount), 0) INTO total_payments
    FROM "public"."payment_allocations"
    WHERE invoice_id = invoice_uuid;
    
    -- Sum credit memos
    SELECT COALESCE(SUM(ABS(total)), 0) INTO total_credits
    FROM "public"."credit_memos"
    WHERE invoice_id = invoice_uuid;
    
    -- Balance = total - payments + credits
    RETURN invoice_total - total_payments + total_credits;
END;
$$;

-- Function to update invoice balance
CREATE OR REPLACE FUNCTION "public"."update_invoice_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    affected_invoice_id uuid;
BEGIN
    -- Update balance for affected invoice(s)
    IF TG_TABLE_NAME = 'payment_allocations' THEN
        IF TG_OP = 'DELETE' THEN
            affected_invoice_id := OLD.invoice_id;
        ELSIF TG_OP = 'INSERT' THEN
            affected_invoice_id := NEW.invoice_id;
        ELSIF TG_OP = 'UPDATE' THEN
            affected_invoice_id := NEW.invoice_id;
            IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
                UPDATE "public"."invoices"
                SET balance = compute_invoice_balance(OLD.invoice_id)
                WHERE id = OLD.invoice_id;
            END IF;
        END IF;
        
        IF affected_invoice_id IS NOT NULL THEN
            UPDATE "public"."invoices"
            SET balance = compute_invoice_balance(affected_invoice_id)
            WHERE id = affected_invoice_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'credit_memos' THEN
        IF TG_OP = 'DELETE' THEN
            affected_invoice_id := OLD.invoice_id;
        ELSIF TG_OP = 'INSERT' THEN
            affected_invoice_id := NEW.invoice_id;
        ELSIF TG_OP = 'UPDATE' THEN
            affected_invoice_id := NEW.invoice_id;
            IF OLD.invoice_id IS NOT NULL AND (OLD.invoice_id IS DISTINCT FROM NEW.invoice_id OR NEW.invoice_id IS NULL) THEN
                UPDATE "public"."invoices"
                SET balance = compute_invoice_balance(OLD.invoice_id)
                WHERE id = OLD.invoice_id;
            END IF;
        END IF;
        
        IF affected_invoice_id IS NOT NULL THEN
            UPDATE "public"."invoices"
            SET balance = compute_invoice_balance(affected_invoice_id)
            WHERE id = affected_invoice_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to update balance when allocations change
CREATE TRIGGER "update_invoice_balance_on_allocation"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."payment_allocations"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_invoice_balance"();

-- Trigger to update balance when credit memos change
CREATE TRIGGER "update_invoice_balance_on_credit_memo"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."credit_memos"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_invoice_balance"();

-- Function to update credit memo total from lines
CREATE OR REPLACE FUNCTION "public"."update_credit_memo_total"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    memo_total numeric;
BEGIN
    -- Recalculate total from lines
    SELECT COALESCE(SUM(total), 0) INTO memo_total
    FROM "public"."credit_memo_lines"
    WHERE credit_memo_id = COALESCE(NEW.credit_memo_id, OLD.credit_memo_id);
    
    -- Update credit memo total
    UPDATE "public"."credit_memos"
    SET total = memo_total
    WHERE id = COALESCE(NEW.credit_memo_id, OLD.credit_memo_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to update credit memo total when lines change
CREATE TRIGGER "update_credit_memo_total_on_line_change"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."credit_memo_lines"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_credit_memo_total"();

-- Function to block invoice edits when status is immutable
CREATE OR REPLACE FUNCTION "public"."block_immutable_invoice_edits"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- If status is in immutable states, only allow status changes
    IF OLD.status IN ('sent', 'overdue', 'paid', 'disputed') THEN
        -- Allow status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RETURN NEW;
        END IF;
        
        -- Block changes to invoice totals and invoice_number
        IF OLD.total IS DISTINCT FROM NEW.total THEN
            RAISE EXCEPTION 'Cannot modify invoice total when status is %', OLD.status;
        END IF;
        
        IF OLD.invoice_number IS DISTINCT FROM NEW.invoice_number THEN
            RAISE EXCEPTION 'Cannot modify invoice number when status is %', OLD.status;
        END IF;
        
        -- Block changes to other non-status fields (except timestamps and pdf_storage_path)
        IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
            RAISE EXCEPTION 'Cannot modify client_id when status is %', OLD.status;
        END IF;
        
        IF OLD.delivery_list_id IS DISTINCT FROM NEW.delivery_list_id THEN
            RAISE EXCEPTION 'Cannot modify delivery_list_id when status is %', OLD.status;
        END IF;
        
        IF OLD.issued_at IS DISTINCT FROM NEW.issued_at AND OLD.status != 'sent' THEN
            RAISE EXCEPTION 'Cannot modify issued_at when status is %', OLD.status;
        END IF;
        
        IF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
            RAISE EXCEPTION 'Cannot modify due_at when status is %', OLD.status;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger to block invoice edits
CREATE TRIGGER "block_immutable_invoice_edits_trigger"
    BEFORE UPDATE ON "public"."invoices"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."block_immutable_invoice_edits"();

-- Function to block invoice_items edits when invoice is immutable
CREATE OR REPLACE FUNCTION "public"."block_immutable_invoice_items_edits"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    invoice_status_val "public"."invoice_status";
BEGIN
    -- Get invoice status
    SELECT status INTO invoice_status_val
    FROM "public"."invoices"
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    
    -- Block all modifications (INSERT, UPDATE, DELETE) if invoice is immutable
    IF invoice_status_val IN ('sent', 'overdue', 'paid', 'disputed') THEN
        RAISE EXCEPTION 'Cannot modify invoice_items when invoice status is %', invoice_status_val;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to block invoice_items edits
CREATE TRIGGER "block_immutable_invoice_items_edits_trigger"
    BEFORE INSERT OR UPDATE OR DELETE ON "public"."invoice_items"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."block_immutable_invoice_items_edits"();

-- Initialize balance for existing invoices
UPDATE "public"."invoices"
SET balance = compute_invoice_balance(id);

-- Add RLS policies (if RLS is enabled)
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_memos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_memo_lines" ENABLE ROW LEVEL SECURITY;

-- Policy: Office users can manage payments
CREATE POLICY "office_users_manage_payments" ON "public"."payments"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role = 'office'
        )
    );

-- Policy: Office users can manage payment allocations
CREATE POLICY "office_users_manage_payment_allocations" ON "public"."payment_allocations"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role = 'office'
        )
    );

-- Policy: Office users can manage credit memos
CREATE POLICY "office_users_manage_credit_memos" ON "public"."credit_memos"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role = 'office'
        )
    );

-- Policy: Office users can manage credit memo lines
CREATE POLICY "office_users_manage_credit_memo_lines" ON "public"."credit_memo_lines"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role = 'office'
        )
    );
