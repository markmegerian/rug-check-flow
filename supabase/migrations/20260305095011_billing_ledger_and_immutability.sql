-- Billing ledger and immutability enforcement
-- This migration creates the billing ledger (payments, allocations, credit memos)
-- and enforces invoice immutability once status is sent/overdue/paid/disputed

-- 1) Extend invoice_status enum with 'disputed' (safe if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'disputed' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')
    ) THEN
        ALTER TYPE "public"."invoice_status" ADD VALUE 'disputed';
    END IF;
END $$;

-- 2) Add invoices.balance NUMERIC NOT NULL DEFAULT 0, backfill balance=total
ALTER TABLE "public"."invoices" 
  ADD COLUMN IF NOT EXISTS "balance" NUMERIC NOT NULL DEFAULT 0;

-- Backfill balance = total for existing invoices
UPDATE "public"."invoices"
SET balance = COALESCE(total, 0)
WHERE balance = 0 OR balance IS NULL;

-- 3) Create payments (alias invoice_payments), payment_allocations, credit_memos, credit_memo_lines tables
-- Note: Using "payments" to match existing code references
CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "amount" NUMERIC NOT NULL,
    "method" text NOT NULL,
    "reference" text DEFAULT ''::text NOT NULL,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL,
    "entered_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (amount > 0),
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") 
        REFERENCES "public"."clients"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."payments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "payment_id" uuid NOT NULL,
    "invoice_id" uuid NOT NULL,
    "amount" NUMERIC NOT NULL,
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

CREATE TABLE IF NOT EXISTS "public"."credit_memos" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid,
    "client_id" uuid NOT NULL,
    "memo_number" text NOT NULL,
    "reason" text DEFAULT ''::text NOT NULL,
    "total" NUMERIC DEFAULT 0 NOT NULL,
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

CREATE TABLE IF NOT EXISTS "public"."credit_memo_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "credit_memo_id" uuid NOT NULL,
    "description" text DEFAULT ''::text NOT NULL,
    "quantity" NUMERIC DEFAULT 1 NOT NULL,
    "unit_price" NUMERIC DEFAULT 0 NOT NULL,
    "total" NUMERIC DEFAULT 0 NOT NULL,
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

-- 4) Add trigger-based recomputation of invoices.balance = total - allocated_payments - credit_memo_lines, clamped at 0
CREATE OR REPLACE FUNCTION "public"."compute_invoice_balance"(invoice_uuid uuid)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    invoice_total NUMERIC;
    total_allocated_payments NUMERIC;
    total_credit_memo_lines NUMERIC;
BEGIN
    -- Get invoice total
    SELECT COALESCE(total, 0) INTO invoice_total
    FROM "public"."invoices"
    WHERE id = invoice_uuid;
    
    -- Sum allocated payments
    SELECT COALESCE(SUM(amount), 0) INTO total_allocated_payments
    FROM "public"."payment_allocations"
    WHERE invoice_id = invoice_uuid;
    
    -- Sum credit memo lines (negative amounts)
    SELECT COALESCE(SUM(ABS(total)), 0) INTO total_credit_memo_lines
    FROM "public"."credit_memo_lines" cml
    JOIN "public"."credit_memos" cm ON cm.id = cml.credit_memo_id
    WHERE cm.invoice_id = invoice_uuid;
    
    -- Balance = total - payments - credits, clamped at 0
    RETURN GREATEST(invoice_total - total_allocated_payments - total_credit_memo_lines, 0);
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
    ELSIF TG_TABLE_NAME = 'credit_memo_lines' THEN
        -- Get invoice_id from credit_memo
        IF TG_OP = 'DELETE' THEN
            SELECT invoice_id INTO affected_invoice_id
            FROM "public"."credit_memos"
            WHERE id = OLD.credit_memo_id;
        ELSIF TG_OP = 'INSERT' THEN
            SELECT invoice_id INTO affected_invoice_id
            FROM "public"."credit_memos"
            WHERE id = NEW.credit_memo_id;
        ELSIF TG_OP = 'UPDATE' THEN
            SELECT invoice_id INTO affected_invoice_id
            FROM "public"."credit_memos"
            WHERE id = NEW.credit_memo_id;
            
            IF OLD.credit_memo_id IS DISTINCT FROM NEW.credit_memo_id THEN
                SELECT invoice_id INTO affected_invoice_id
                FROM "public"."credit_memos"
                WHERE id = OLD.credit_memo_id;
                
                IF affected_invoice_id IS NOT NULL THEN
                    UPDATE "public"."invoices"
                    SET balance = compute_invoice_balance(affected_invoice_id)
                    WHERE id = affected_invoice_id;
                END IF;
                
                SELECT invoice_id INTO affected_invoice_id
                FROM "public"."credit_memos"
                WHERE id = NEW.credit_memo_id;
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
DROP TRIGGER IF EXISTS "update_invoice_balance_on_allocation" ON "public"."payment_allocations";
CREATE TRIGGER "update_invoice_balance_on_allocation"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."payment_allocations"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_invoice_balance"();

-- Trigger to update balance when credit memo lines change
DROP TRIGGER IF EXISTS "update_invoice_balance_on_credit_memo_line" ON "public"."credit_memo_lines";
CREATE TRIGGER "update_invoice_balance_on_credit_memo_line"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."credit_memo_lines"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_invoice_balance"();

-- Trigger to update balance when credit memos change
DROP TRIGGER IF EXISTS "update_invoice_balance_on_credit_memo" ON "public"."credit_memos";
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
    memo_total NUMERIC;
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
DROP TRIGGER IF EXISTS "update_credit_memo_total_on_line_change" ON "public"."credit_memo_lines";
CREATE TRIGGER "update_credit_memo_total_on_line_change"
    AFTER INSERT OR UPDATE OR DELETE ON "public"."credit_memo_lines"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_credit_memo_total"();

-- 5) Add DB triggers to enforce immutability
CREATE OR REPLACE FUNCTION "public"."block_immutable_invoice_edits"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- If status is in immutable states, only allow specific field changes
    IF OLD.status IN ('sent', 'overdue', 'paid', 'disputed') THEN
        -- Allow status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RETURN NEW;
        END IF;
        
        -- Allow balance updates (computed by triggers)
        IF OLD.balance IS DISTINCT FROM NEW.balance THEN
            RETURN NEW;
        END IF;
        
        -- Allow pdf_storage_path updates
        IF OLD.pdf_storage_path IS DISTINCT FROM NEW.pdf_storage_path THEN
            RETURN NEW;
        END IF;
        
        -- Allow paid_at updates (when marking as paid)
        IF OLD.paid_at IS DISTINCT FROM NEW.paid_at THEN
            RETURN NEW;
        END IF;
        
        -- Allow updated_at (automatic)
        IF OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN
            RETURN NEW;
        END IF;
        
        -- Block changes to invoice totals and invoice_number
        IF OLD.total IS DISTINCT FROM NEW.total THEN
            RAISE EXCEPTION 'Cannot modify invoice total when status is %', OLD.status;
        END IF;
        
        IF OLD.invoice_number IS DISTINCT FROM NEW.invoice_number THEN
            RAISE EXCEPTION 'Cannot modify invoice number when status is %', OLD.status;
        END IF;
        
        -- Block changes to other immutable fields
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
DROP TRIGGER IF EXISTS "block_immutable_invoice_edits_trigger" ON "public"."invoices";
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
DROP TRIGGER IF EXISTS "block_immutable_invoice_items_edits_trigger" ON "public"."invoice_items";
CREATE TRIGGER "block_immutable_invoice_items_edits_trigger"
    BEFORE INSERT OR UPDATE OR DELETE ON "public"."invoice_items"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."block_immutable_invoice_items_edits"();

-- Initialize balance for existing invoices
UPDATE "public"."invoices"
SET balance = compute_invoice_balance(id);

-- 6) Enable RLS on new tables and add policies
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_memos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credit_memo_lines" ENABLE ROW LEVEL SECURITY;

-- Office/admin can manage all
DROP POLICY IF EXISTS "office_admin_manage_payments" ON "public"."payments";
CREATE POLICY "office_admin_manage_payments" ON "public"."payments"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role IN ('office', 'admin')
        )
    );

DROP POLICY IF EXISTS "office_admin_manage_payment_allocations" ON "public"."payment_allocations";
CREATE POLICY "office_admin_manage_payment_allocations" ON "public"."payment_allocations"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role IN ('office', 'admin')
        )
    );

DROP POLICY IF EXISTS "office_admin_manage_credit_memos" ON "public"."credit_memos";
CREATE POLICY "office_admin_manage_credit_memos" ON "public"."credit_memos"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role IN ('office', 'admin')
        )
    );

DROP POLICY IF EXISTS "office_admin_manage_credit_memo_lines" ON "public"."credit_memo_lines";
CREATE POLICY "office_admin_manage_credit_memo_lines" ON "public"."credit_memo_lines"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role IN ('office', 'admin')
        )
    );

-- Portal can SELECT only scoped to their client (match invoices_select_scoped pattern)
DROP POLICY IF EXISTS "portal_select_payments" ON "public"."payments";
CREATE POLICY "portal_select_payments" ON "public"."payments"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" pu
            WHERE pu.client_id = payments.client_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

DROP POLICY IF EXISTS "portal_select_payment_allocations" ON "public"."payment_allocations";
CREATE POLICY "portal_select_payment_allocations" ON "public"."payment_allocations"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."invoices" i
            JOIN "public"."portal_users" pu ON pu.client_id = i.client_id
            WHERE i.id = payment_allocations.invoice_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

DROP POLICY IF EXISTS "portal_select_credit_memos" ON "public"."credit_memos";
CREATE POLICY "portal_select_credit_memos" ON "public"."credit_memos"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" pu
            WHERE pu.client_id = credit_memos.client_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

DROP POLICY IF EXISTS "portal_select_credit_memo_lines" ON "public"."credit_memo_lines";
CREATE POLICY "portal_select_credit_memo_lines" ON "public"."credit_memo_lines"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."credit_memos" cm
            JOIN "public"."portal_users" pu ON pu.client_id = cm.client_id
            WHERE cm.id = credit_memo_lines.credit_memo_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );
