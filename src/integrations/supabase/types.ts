export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          company_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_analysis_feedback: {
        Row: {
          corrected_identification: string | null
          corrected_price: number | null
          corrected_service_name: string | null
          created_at: string | null
          feedback_type: string
          id: string
          inspection_id: string | null
          notes: string | null
          original_price: number | null
          original_rug_identification: string | null
          original_service_name: string | null
          rug_origin: string | null
          rug_type: string | null
          user_id: string
        }
        Insert: {
          corrected_identification?: string | null
          corrected_price?: number | null
          corrected_service_name?: string | null
          created_at?: string | null
          feedback_type: string
          id?: string
          inspection_id?: string | null
          notes?: string | null
          original_price?: number | null
          original_rug_identification?: string | null
          original_service_name?: string | null
          rug_origin?: string | null
          rug_type?: string | null
          user_id: string
        }
        Update: {
          corrected_identification?: string | null
          corrected_price?: number | null
          corrected_service_name?: string | null
          created_at?: string | null
          feedback_type?: string
          id?: string
          inspection_id?: string | null
          notes?: string | null
          original_price?: number | null
          original_rug_identification?: string | null
          original_service_name?: string | null
          rug_origin?: string | null
          rug_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_feedback_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_batch_training_items: {
        Row: {
          analysis_result: string | null
          corrections_applied: boolean
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          photo_path: string
          rug_type: string
          session_label: string
          status: string
        }
        Insert: {
          analysis_result?: string | null
          corrections_applied?: boolean
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          photo_path: string
          rug_type?: string
          session_label?: string
          status?: string
        }
        Update: {
          analysis_result?: string | null
          corrections_applied?: boolean
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          photo_path?: string
          rug_type?: string
          session_label?: string
          status?: string
        }
        Relationships: []
      }
      approved_estimates: {
        Row: {
          approved_by_staff_at: string | null
          approved_by_staff_user_id: string | null
          created_at: string | null
          id: string
          inspection_id: string
          job_id: string
          services: Json
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          approved_by_staff_at?: string | null
          approved_by_staff_user_id?: string | null
          created_at?: string | null
          id?: string
          inspection_id: string
          job_id: string
          services?: Json
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          approved_by_staff_at?: string | null
          approved_by_staff_user_id?: string | null
          created_at?: string | null
          id?: string
          inspection_id?: string
          job_id?: string
          services?: Json
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approved_estimates_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: true
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approved_estimates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      checkin_photos: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          job_id: string | null
          retention_policy: string
          rug_id: string | null
          storage_path: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          retention_policy?: string
          rug_id?: string | null
          storage_path: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          retention_policy?: string
          rug_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "intake_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_photos_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_job_access: {
        Row: {
          access_token: string
          access_token_hash: string | null
          auth_user_id: string | null
          client_id: string | null
          company_id: string | null
          consumed_at: string | null
          created_at: string | null
          email_error: string | null
          email_sent_at: string | null
          expires_at: string | null
          first_accessed_at: string | null
          id: string
          invited_email: string | null
          job_id: string
          password_set_at: string | null
        }
        Insert: {
          access_token: string
          access_token_hash?: string | null
          auth_user_id?: string | null
          client_id?: string | null
          company_id?: string | null
          consumed_at?: string | null
          created_at?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          expires_at?: string | null
          first_accessed_at?: string | null
          id?: string
          invited_email?: string | null
          job_id: string
          password_set_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_hash?: string | null
          auth_user_id?: string | null
          client_id?: string | null
          company_id?: string | null
          consumed_at?: string | null
          created_at?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          expires_at?: string | null
          first_accessed_at?: string | null
          id?: string
          invited_email?: string | null
          job_id?: string
          password_set_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_job_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_job_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_job_access_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_service_selections: {
        Row: {
          approved_estimate_id: string
          client_job_access_id: string
          created_at: string | null
          id: string
          selected_services: Json
          total_selected: number
          updated_at: string | null
        }
        Insert: {
          approved_estimate_id: string
          client_job_access_id: string
          created_at?: string | null
          id?: string
          selected_services?: Json
          total_selected?: number
          updated_at?: string | null
        }
        Update: {
          approved_estimate_id?: string
          client_job_access_id?: string
          created_at?: string | null
          id?: string
          selected_services?: Json
          total_selected?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_service_selections_approved_estimate_id_fkey"
            columns: ["approved_estimate_id"]
            isOneToOne: false
            referencedRelation: "approved_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_service_selections_client_job_access_id_fkey"
            columns: ["client_job_access_id"]
            isOneToOne: false
            referencedRelation: "client_job_access"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string
          billing_notes: string
          billing_reminder_preference: string
          company_id: string | null
          contact_name: string
          created_at: string
          email: string
          id: string
          invoice_terms_days: number
          name: string
          notes: string
          phone: string
          pricing_tier: Database["public"]["Enums"]["pricing_tier"]
          route_day: string
          updated_at: string
        }
        Insert: {
          address?: string
          billing_notes?: string
          billing_reminder_preference?: string
          company_id?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          invoice_terms_days?: number
          name: string
          notes?: string
          phone?: string
          pricing_tier?: Database["public"]["Enums"]["pricing_tier"]
          route_day?: string
          updated_at?: string
        }
        Update: {
          address?: string
          billing_notes?: string
          billing_reminder_preference?: string
          company_id?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          invoice_terms_days?: number
          name?: string
          notes?: string
          phone?: string
          pricing_tier?: Database["public"]["Enums"]["pricing_tier"]
          route_day?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_events: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["communication_channel"]
          client_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["communication_direction"]
          estimate_id: string | null
          event_type: string
          id: string
          invoice_id: string | null
          rug_id: string | null
          sent_to: string | null
          subject: string
        }
        Insert: {
          body?: string
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["communication_direction"]
          estimate_id?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          rug_id?: string | null
          sent_to?: string | null
          subject?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["communication_direction"]
          estimate_id?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          rug_id?: string | null
          sent_to?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          billing_status: Database["public"]["Enums"]["billing_status"]
          created_at: string
          id: string
          max_staff_users: number
          name: string
          payment_account_connected: boolean
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          settings: Json | null
          slug: string
          stripe_account_id: string | null
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_status?: Database["public"]["Enums"]["billing_status"]
          created_at?: string
          id?: string
          max_staff_users?: number
          name: string
          payment_account_connected?: boolean
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json | null
          slug: string
          stripe_account_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_status?: Database["public"]["Enums"]["billing_status"]
          created_at?: string
          id?: string
          max_staff_users?: number
          name?: string
          payment_account_connected?: boolean
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json | null
          slug?: string
          stripe_account_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_branding: {
        Row: {
          business_address: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          company_id: string
          created_at: string
          id: string
          logo_path: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          company_id: string
          created_at?: string
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          company_id?: string
          created_at?: string
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_branding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_enabled_services: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_enabled: boolean
          service_name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          service_name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          service_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_enabled_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_service_prices: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_additional: boolean
          service_name: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_additional?: boolean
          service_name: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_additional?: boolean
          service_name?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_service_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_memo_lines: {
        Row: {
          amount: number
          created_at: string
          credit_memo_id: string
          description: string
          id: string
          invoice_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_memo_id: string
          description?: string
          id?: string
          invoice_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_memo_id?: string
          description?: string
          id?: string
          invoice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_memo_lines_credit_memo_id_fkey"
            columns: ["credit_memo_id"]
            isOneToOne: false
            referencedRelation: "credit_memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_memo_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_memos: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          issued_at: string
          memo_number: string | null
          reason: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          memo_number?: string | null
          reason?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          memo_number?: string | null
          reason?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_memos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      declined_services: {
        Row: {
          acknowledged_at: string
          acknowledged_by_client_id: string | null
          created_at: string
          decline_consequence: string | null
          declined_amount: number
          id: string
          inspection_id: string
          job_id: string
          quantity: number
          restored_at: string | null
          service_category: string
          service_id: string
          service_name: string
          unit_price: number
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by_client_id?: string | null
          created_at?: string
          decline_consequence?: string | null
          declined_amount?: number
          id?: string
          inspection_id: string
          job_id: string
          quantity?: number
          restored_at?: string | null
          service_category: string
          service_id: string
          service_name: string
          unit_price?: number
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by_client_id?: string | null
          created_at?: string
          decline_consequence?: string | null
          declined_amount?: number
          id?: string
          inspection_id?: string
          job_id?: string
          quantity?: number
          restored_at?: string | null
          service_category?: string
          service_id?: string
          service_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "declined_services_acknowledged_by_client_id_fkey"
            columns: ["acknowledged_by_client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declined_services_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_list_items: {
        Row: {
          client_id: string | null
          confirmed_for_delivery: boolean
          created_at: string
          delivery_list_id: string
          id: string
          loaded_on_truck: boolean
          rug_id: string
        }
        Insert: {
          client_id?: string | null
          confirmed_for_delivery?: boolean
          created_at?: string
          delivery_list_id: string
          id?: string
          loaded_on_truck?: boolean
          rug_id: string
        }
        Update: {
          client_id?: string | null
          confirmed_for_delivery?: boolean
          created_at?: string
          delivery_list_id?: string
          id?: string
          loaded_on_truck?: boolean
          rug_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_list_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_list_items_delivery_list_id_fkey"
            columns: ["delivery_list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_list_items_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_lists: {
        Row: {
          checked_out_at: string | null
          checked_out_by: string | null
          compiled_by: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          route_day: string
          status: Database["public"]["Enums"]["delivery_list_status"]
          target_date: string
          updated_at: string
        }
        Insert: {
          checked_out_at?: string | null
          checked_out_by?: string | null
          compiled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          route_day?: string
          status?: Database["public"]["Enums"]["delivery_list_status"]
          target_date: string
          updated_at?: string
        }
        Update: {
          checked_out_at?: string | null
          checked_out_by?: string | null
          compiled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          route_day?: string
          status?: Database["public"]["Enums"]["delivery_list_status"]
          target_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string
          rug_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          type: Database["public"]["Enums"]["dispute_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          rug_id: string
          status?: Database["public"]["Enums"]["dispute_status"]
          type: Database["public"]["Enums"]["dispute_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          rug_id?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          type?: Database["public"]["Enums"]["dispute_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          company_id: string | null
          created_at: string
          id: string
          subject: string
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          company_id?: string | null
          created_at?: string
          id?: string
          subject: string
          template_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          company_id?: string | null
          created_at?: string
          id?: string
          subject?: string
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_items: {
        Row: {
          client_approved: boolean | null
          client_decision_at: string | null
          created_at: string
          description: string
          estimate_id: string
          id: string
          quantity: number
          rug_service_id: string | null
          service_category: string
          total: number
          unit_price: number
        }
        Insert: {
          client_approved?: boolean | null
          client_decision_at?: string | null
          created_at?: string
          description?: string
          estimate_id: string
          id?: string
          quantity?: number
          rug_service_id?: string | null
          service_category?: string
          total?: number
          unit_price?: number
        }
        Update: {
          client_approved?: boolean | null
          client_decision_at?: string | null
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          quantity?: number
          rug_service_id?: string | null
          service_category?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_rug_service_id_fkey"
            columns: ["rug_service_id"]
            isOneToOne: false
            referencedRelation: "rug_services"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          approved_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          estimate_number: string
          expires_at: string | null
          id: string
          rejected_at: string | null
          rug_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["estimate_status"]
          total: number
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          estimate_number: string
          expires_at?: string | null
          id?: string
          rejected_at?: string | null
          rug_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          total?: number
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          estimate_number?: string
          expires_at?: string | null
          id?: string
          rejected_at?: string | null
          rug_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          total?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          actor: string
          company_id: string | null
          created_at: string
          event_type: string
          id: string
          job_id: string | null
          payload: Json | null
        }
        Insert: {
          actor: string
          company_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          job_id?: string | null
          payload?: Json | null
        }
        Update: {
          actor?: string
          company_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          analysis_report: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          company_id: string | null
          condition_flags: Json | null
          created_at: string
          estimate_approved: boolean | null
          id: string
          image_annotations: Json | null
          job_id: string | null
          length: number | null
          notes: string | null
          photo_urls: string[] | null
          rug_number: string
          rug_type: string
          structured_findings: Json | null
          system_services: Json | null
          user_id: string | null
          width: number | null
        }
        Insert: {
          analysis_report?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          company_id?: string | null
          condition_flags?: Json | null
          created_at?: string
          estimate_approved?: boolean | null
          id?: string
          image_annotations?: Json | null
          job_id?: string | null
          length?: number | null
          notes?: string | null
          photo_urls?: string[] | null
          rug_number: string
          rug_type: string
          structured_findings?: Json | null
          system_services?: Json | null
          user_id?: string | null
          width?: number | null
        }
        Update: {
          analysis_report?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          company_id?: string | null
          condition_flags?: Json | null
          created_at?: string
          estimate_approved?: boolean | null
          id?: string
          image_annotations?: Json | null
          job_id?: string | null
          length?: number | null
          notes?: string | null
          photo_urls?: string[] | null
          rug_number?: string
          rug_type?: string
          structured_findings?: Json | null
          system_services?: Json | null
          user_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_jobs: {
        Row: {
          checkin_date: string
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          intake_date: string
          job_code: string
          pickup_request_id: string | null
          pickup_scheduled_date: string | null
          source: string
          updated_at: string
        }
        Insert: {
          checkin_date: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intake_date: string
          job_code: string
          pickup_request_id?: string | null
          pickup_scheduled_date?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          checkin_date?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intake_date?: string
          job_code?: string
          pickup_request_id?: string | null
          pickup_scheduled_date?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_jobs_pickup_request_id_fkey"
            columns: ["pickup_request_id"]
            isOneToOne: false
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          body: string
          channel: string
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          interaction_type: string
          job_id: string | null
          pickup_request_id: string | null
          rug_id: string | null
          subject: string
        }
        Insert: {
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interaction_type: string
          job_id?: string | null
          pickup_request_id?: string | null
          rug_id?: string | null
          subject?: string
        }
        Update: {
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interaction_type?: string
          job_id?: string | null
          pickup_request_id?: string | null
          rug_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "intake_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_pickup_request_id_fkey"
            columns: ["pickup_request_id"]
            isOneToOne: false
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          rug_id: string | null
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          quantity?: number
          rug_id?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          rug_id?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          method: string
          received_at: string
          reference: string | null
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          received_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          received_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance: number
          balance_due: number
          client_id: string | null
          created_at: string
          delivery_list_id: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          pdf_storage_path: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          balance?: number
          balance_due?: number
          client_id?: string | null
          created_at?: string
          delivery_list_id?: string | null
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          paid_at?: string | null
          pdf_storage_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          balance_due?: number
          client_id?: string | null
          created_at?: string
          delivery_list_id?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          paid_at?: string | null
          pdf_storage_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delivery_list_id_fkey"
            columns: ["delivery_list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          all_estimates_approved: boolean | null
          client_approved_at: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_portal_enabled: boolean | null
          company_id: string | null
          created_at: string
          follow_up_notes: string | null
          id: string
          job_number: string
          last_activity_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          payment_status: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_estimates_approved?: boolean | null
          client_approved_at?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_portal_enabled?: boolean | null
          company_id?: string | null
          created_at?: string
          follow_up_notes?: string | null
          id?: string
          job_number: string
          last_activity_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          payment_status?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_estimates_approved?: boolean | null
          client_approved_at?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_portal_enabled?: boolean | null
          company_id?: string | null
          created_at?: string
          follow_up_notes?: string | null
          id?: string
          job_number?: string
          last_activity_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          payment_status?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          client_id: string
          created_at: string
          entity_id: string | null
          id: string
          status: Database["public"]["Enums"]["thread_status"]
          thread_type: Database["public"]["Enums"]["thread_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          entity_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["thread_status"]
          thread_type: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["thread_status"]
          thread_type?: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          sender: string | null
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender?: string | null
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_cadence: {
        Row: {
          client_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          throttle_key: string
        }
        Insert: {
          client_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          notification_type: string
          scheduled_for: string
          sent_at?: string | null
          throttle_key: string
        }
        Update: {
          client_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          throttle_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_cadence_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_throttles: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_sent_at: string
          throttle_key: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_sent_at?: string
          throttle_key: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_sent_at?: string
          throttle_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_throttles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          attempted_at: string
          client_id: string | null
          error_message: string | null
          id: string
          invoice_id: string
          metadata: Json
          provider: string
          provider_payment_ref: string | null
          status: Database["public"]["Enums"]["payment_attempt_status"]
        }
        Insert: {
          amount?: number
          attempted_at?: string
          client_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          provider?: string
          provider_payment_ref?: string | null
          status?: Database["public"]["Enums"]["payment_attempt_status"]
        }
        Update: {
          amount?: number
          attempted_at?: string
          client_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          provider?: string
          provider_payment_ref?: string | null
          status?: Database["public"]["Enums"]["payment_attempt_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string | null
          currency: string | null
          entered_by: string | null
          id: string
          job_id: string
          metadata: Json | null
          method: string
          paid_at: string | null
          platform_fee: number | null
          received_at: string
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          entered_by?: string | null
          id?: string
          job_id: string
          metadata?: Json | null
          method?: string
          paid_at?: string | null
          platform_fee?: number | null
          received_at?: string
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          entered_by?: string | null
          id?: string
          job_id?: string
          metadata?: Json | null
          method?: string
          paid_at?: string | null
          platform_fee?: number | null
          received_at?: string
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string | null
          created_by: string | null
          gross_revenue: number | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          platform_fees_deducted: number | null
          reference_number: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          gross_revenue?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fees_deducted?: number | null
          reference_number?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          gross_revenue?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fees_deducted?: number | null
          reference_number?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_photos: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          pickup_item_id: string | null
          pickup_request_id: string | null
          retention_policy: string
          storage_path: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pickup_item_id?: string | null
          pickup_request_id?: string | null
          retention_policy?: string
          storage_path: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          pickup_item_id?: string | null
          pickup_request_id?: string | null
          retention_policy?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_photos_pickup_item_id_fkey"
            columns: ["pickup_item_id"]
            isOneToOne: false
            referencedRelation: "pickup_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_photos_pickup_request_id_fkey"
            columns: ["pickup_request_id"]
            isOneToOne: false
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_request_items: {
        Row: {
          checked_in_rug_id: string | null
          created_at: string
          driver_notes: string
          driver_photo_urls: string[]
          estimate_request_details: string | null
          estimate_requested: boolean
          id: string
          is_new: boolean
          length: number | null
          pickup_request_id: string
          rug_id: string | null
          rug_number: string
          rug_type: string
          verified: boolean
          width: number | null
        }
        Insert: {
          checked_in_rug_id?: string | null
          created_at?: string
          driver_notes?: string
          driver_photo_urls?: string[]
          estimate_request_details?: string | null
          estimate_requested?: boolean
          id?: string
          is_new?: boolean
          length?: number | null
          pickup_request_id: string
          rug_id?: string | null
          rug_number: string
          rug_type?: string
          verified?: boolean
          width?: number | null
        }
        Update: {
          checked_in_rug_id?: string | null
          created_at?: string
          driver_notes?: string
          driver_photo_urls?: string[]
          estimate_request_details?: string | null
          estimate_requested?: boolean
          id?: string
          is_new?: boolean
          length?: number | null
          pickup_request_id?: string
          rug_id?: string | null
          rug_number?: string
          rug_type?: string
          verified?: boolean
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_request_items_checked_in_rug_id_fkey"
            columns: ["checked_in_rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_request_items_pickup_request_id_fkey"
            columns: ["pickup_request_id"]
            isOneToOne: false
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_request_items_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_requests: {
        Row: {
          assigned_at: string | null
          assigned_driver_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string
          route_day: string
          scheduled_date: string
          signature_data_url: string | null
          status: Database["public"]["Enums"]["pickup_request_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_driver_id?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          route_day?: string
          scheduled_date: string
          signature_data_url?: string | null
          status?: Database["public"]["Enums"]["pickup_request_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_driver_id?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          route_day?: string
          scheduled_date?: string
          signature_data_url?: string | null
          status?: Database["public"]["Enums"]["pickup_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      portal_users: {
        Row: {
          client_id: string
          company_id: string | null
          created_at: string
          email: string
          id: string
          must_change_password: boolean
          onboarding_completed_at: string | null
          status: string
        }
        Insert: {
          client_id: string
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      price_overrides: {
        Row: {
          adjusted_price: number
          created_at: string
          id: string
          inspection_id: string | null
          job_id: string | null
          original_price: number
          overridden_by: string
          override_notes: string | null
          override_reason: string
          service_id: string
          service_name: string
        }
        Insert: {
          adjusted_price: number
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id?: string | null
          original_price: number
          overridden_by: string
          override_notes?: string | null
          override_reason: string
          service_id: string
          service_name: string
        }
        Update: {
          adjusted_price?: number
          created_at?: string
          id?: string
          inspection_id?: string | null
          job_id?: string | null
          original_price?: number
          overridden_by?: string
          override_notes?: string | null
          override_reason?: string
          service_id?: string
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_overrides_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_overrides_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bank_account_number: string | null
          bank_name: string | null
          bank_routing_number: string | null
          business_address: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          logo_path: string | null
          logo_url: string | null
          notification_preferences: Json | null
          payment_method: string | null
          payment_notes: string | null
          paypal_email: string | null
          updated_at: string
          user_id: string
          venmo_handle: string | null
          zelle_email: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          notification_preferences?: Json | null
          payment_method?: string | null
          payment_notes?: string | null
          paypal_email?: string | null
          updated_at?: string
          user_id: string
          venmo_handle?: string | null
          zelle_email?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          notification_preferences?: Json | null
          payment_method?: string | null
          payment_notes?: string | null
          paypal_email?: string | null
          updated_at?: string
          user_id?: string
          venmo_handle?: string | null
          zelle_email?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string | null
          id: string
          identifier: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          identifier: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      route_stop_events: {
        Row: {
          created_at: string
          created_by: string
          event_type: string
          id: string
          offline_event_id: string
          payload: Json
          route_stop_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          offline_event_id: string
          payload?: Json
          route_stop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          offline_event_id?: string
          payload?: Json
          route_stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stop_events_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stop_items: {
        Row: {
          created_at: string
          delivery_list_item_id: string | null
          exception_code: string | null
          id: string
          notes: string
          phase: Database["public"]["Enums"]["route_stop_phase"]
          photo_urls: string[]
          pickup_request_item_id: string | null
          route_stop_id: string
          rug_id: string | null
          status: Database["public"]["Enums"]["route_stop_item_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_list_item_id?: string | null
          exception_code?: string | null
          id?: string
          notes?: string
          phase: Database["public"]["Enums"]["route_stop_phase"]
          photo_urls?: string[]
          pickup_request_item_id?: string | null
          route_stop_id: string
          rug_id?: string | null
          status?: Database["public"]["Enums"]["route_stop_item_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_list_item_id?: string | null
          exception_code?: string | null
          id?: string
          notes?: string
          phase?: Database["public"]["Enums"]["route_stop_phase"]
          photo_urls?: string[]
          pickup_request_item_id?: string | null
          route_stop_id?: string
          rug_id?: string | null
          status?: Database["public"]["Enums"]["route_stop_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stop_items_delivery_list_item_id_fkey"
            columns: ["delivery_list_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stop_items_pickup_request_item_id_fkey"
            columns: ["pickup_request_item_id"]
            isOneToOne: false
            referencedRelation: "pickup_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stop_items_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stop_items_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          assigned_driver_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          delivery_list_id: string | null
          exception_code: string | null
          id: string
          notes: string
          pickup_request_id: string | null
          route_date: string
          route_day: string
          signature_data_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["route_stop_status"]
          updated_at: string
        }
        Insert: {
          assigned_driver_id?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          delivery_list_id?: string | null
          exception_code?: string | null
          id?: string
          notes?: string
          pickup_request_id?: string | null
          route_date: string
          route_day?: string
          signature_data_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["route_stop_status"]
          updated_at?: string
        }
        Update: {
          assigned_driver_id?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          delivery_list_id?: string | null
          exception_code?: string | null
          id?: string
          notes?: string
          pickup_request_id?: string | null
          route_date?: string
          route_day?: string
          signature_data_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["route_stop_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_delivery_list_id_fkey"
            columns: ["delivery_list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_pickup_request_id_fkey"
            columns: ["pickup_request_id"]
            isOneToOne: false
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rug_services: {
        Row: {
          approval_status: string
          created_at: string
          edges: string[]
          id: string
          line_total: number
          requires_estimate: boolean | null
          rug_id: string
          service_category: string | null
          service_id: string | null
          service_name: string
          service_unit: string | null
          unit_price: number
        }
        Insert: {
          approval_status?: string
          created_at?: string
          edges?: string[]
          id?: string
          line_total?: number
          requires_estimate?: boolean | null
          rug_id: string
          service_category?: string | null
          service_id?: string | null
          service_name?: string
          service_unit?: string | null
          unit_price?: number
        }
        Update: {
          approval_status?: string
          created_at?: string
          edges?: string[]
          id?: string
          line_total?: number
          requires_estimate?: boolean | null
          rug_id?: string
          service_category?: string | null
          service_id?: string | null
          service_name?: string
          service_unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "rug_services_rug_id_fkey"
            columns: ["rug_id"]
            isOneToOne: false
            referencedRelation: "rugs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rug_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      rugs: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          description: string
          id: string
          intake_date: string | null
          intake_source: string | null
          job_id: string | null
          notes: string
          photo_url: string | null
          picked_up_at: string | null
          services: string[]
          size_length: number | null
          size_width: number | null
          status: Database["public"]["Enums"]["rug_status"]
          tag: string
          updated_at: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          intake_date?: string | null
          intake_source?: string | null
          job_id?: string | null
          notes?: string
          photo_url?: string | null
          picked_up_at?: string | null
          services?: string[]
          size_length?: number | null
          size_width?: number | null
          status?: Database["public"]["Enums"]["rug_status"]
          tag: string
          updated_at?: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          intake_date?: string | null
          intake_source?: string | null
          job_id?: string | null
          notes?: string
          photo_url?: string | null
          picked_up_at?: string | null
          services?: string[]
          size_length?: number | null
          size_width?: number | null
          status?: Database["public"]["Enums"]["rug_status"]
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rugs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rugs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "intake_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_completions: {
        Row: {
          approved_estimate_id: string
          completed_at: string
          completed_by: string | null
          created_at: string
          id: string
          notes: string | null
          service_id: string
        }
        Insert: {
          approved_estimate_id: string
          completed_at?: string
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          service_id: string
        }
        Update: {
          approved_estimate_id?: string
          completed_at?: string
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_completions_approved_estimate_id_fkey"
            columns: ["approved_estimate_id"]
            isOneToOne: false
            referencedRelation: "approved_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          created_at: string
          id: string
          service_name: string
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_name: string
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_name?: string
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          base_price: number
          category: string
          created_at: string
          id: string
          name: string
          preferred_price: number
          requires_estimate: boolean
          sort_order: number
          unit: string
          updated_at: string
          vip_price: number
        }
        Insert: {
          active?: boolean
          base_price?: number
          category?: string
          created_at?: string
          id?: string
          name: string
          preferred_price?: number
          requires_estimate?: boolean
          sort_order?: number
          unit?: string
          updated_at?: string
          vip_price?: number
        }
        Update: {
          active?: boolean
          base_price?: number
          category?: string
          created_at?: string
          id?: string
          name?: string
          preferred_price?: number
          requires_estimate?: boolean
          sort_order?: number
          unit?: string
          updated_at?: string
          vip_price?: number
        }
        Relationships: []
      }
      token_validation_attempts: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          first_attempt_at: string
          id: string
          identifier: string
          last_attempt_at: string
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          first_attempt_at?: string
          id?: string
          identifier: string
          last_attempt_at?: string
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          first_attempt_at?: string
          id?: string
          identifier?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_route_stops_for_date: {
        Args: { target_date: string }
        Returns: {
          items_created: number
          stops_created: number
          stops_updated: number
        }[]
      }
      check_notification_throttle: {
        Args: { client_id: string; p_throttle_key: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      check_rate_limit: {
        Args: {
          p_action: string
          p_identifier: string
          p_max_requests?: number
          p_window_minutes?: number
        }
        Returns: boolean
      }
      check_token_rate_limit: {
        Args: {
          _block_seconds?: number
          _identifier: string
          _max_attempts?: number
          _window_seconds?: number
        }
        Returns: {
          allowed: boolean
          blocked_until_ts: string
          remaining_attempts: number
        }[]
      }
      cleanup_old_rate_limits: { Args: never; Returns: number }
      client_has_job_access: {
        Args: { check_job_id: string }
        Returns: boolean
      }
      company_can_create_jobs: {
        Args: { _company_id: string }
        Returns: boolean
      }
      company_has_feature: {
        Args: { _company_id: string; _feature: string }
        Returns: boolean
      }
      company_max_staff: { Args: { _company_id: string }; Returns: number }
      get_clients_for_weekly_statements: {
        Args: never
        Returns: {
          client_email: string
          client_id: string
          client_name: string
          open_invoice_count: number
          total_balance: number
        }[]
      }
      get_or_create_thread: {
        Args: {
          p_client_id: string
          p_entity_id?: string
          p_thread_type: Database["public"]["Enums"]["thread_type"]
        }
        Returns: string
      }
      get_pending_notifications: {
        Args: never
        Returns: {
          client_id: string
          entity_id: string
          entity_type: string
          id: string
          notification_type: string
          scheduled_for: string
          throttle_key: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_company_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_invoice_locked: { Args: { p_status: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_notification_sent: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      mark_portal_onboarding_complete: { Args: never; Returns: boolean }
      mark_portal_password_changed: { Args: never; Returns: boolean }
      recompute_invoice_balance: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_client_funnel_event: {
        Args: { _access_token: string; _event_type: string; _payload?: Json }
        Returns: undefined
      }
      record_notification_throttle: {
        Args: { client_id: string; p_throttle_key: string }
        Returns: undefined
      }
      reset_token_rate_limit: {
        Args: { _identifier: string }
        Returns: undefined
      }
      schedule_estimate_notifications: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      schedule_invoice_notifications: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      update_client_access_tracking: {
        Args: {
          _access_token: string
          _first_accessed?: boolean
          _password_set?: boolean
        }
        Returns: undefined
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      validate_access_token: {
        Args: { _token: string }
        Returns: {
          access_id: string
          auth_user_id: string
          client_id: string
          client_name: string
          company_id: string
          invited_email: string
          job_id: string
          job_number: string
          job_status: string
          staff_user_id: string
        }[]
      }
      validate_route_stop_completion: {
        Args: {
          p_new_status: Database["public"]["Enums"]["route_stop_status"]
          p_route_stop_id: string
        }
        Returns: boolean
      }
      validate_route_stop_item_status_transition: {
        Args: {
          new_status: Database["public"]["Enums"]["route_stop_item_status"]
          old_status: Database["public"]["Enums"]["route_stop_item_status"]
        }
        Returns: boolean
      }
      validate_route_stop_status_transition: {
        Args: {
          new_status: Database["public"]["Enums"]["route_stop_status"]
          old_status: Database["public"]["Enums"]["route_stop_status"]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "staff"
        | "client"
        | "admin"
        | "office"
        | "checkin_staff"
        | "driver"
      billing_status: "trialing" | "active" | "past_due" | "canceled"
      communication_channel: "email" | "in_app_chat"
      communication_direction: "outbound" | "inbound"
      company_role: "company_admin" | "staff"
      delivery_list_status: "compiling" | "confirmed" | "checked_out"
      dispute_status:
        | "open"
        | "investigating"
        | "resolved"
        | "credited"
        | "denied"
      dispute_type: "refused_delivery" | "post_delivery_claim"
      estimate_status: "draft" | "sent" | "approved" | "rejected" | "expired"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "disputed"
      payment_attempt_status: "pending" | "succeeded" | "failed"
      pickup_request_status:
        | "pending"
        | "confirmed"
        | "assigned"
        | "completed"
        | "cancelled"
      plan_tier: "starter" | "pro" | "enterprise"
      pricing_tier: "standard" | "preferred" | "vip"
      route_stop_item_status:
        | "pending"
        | "verified"
        | "disputed"
        | "exception"
        | "skipped"
      route_stop_phase: "delivery" | "pickup"
      route_stop_status:
        | "queued"
        | "in_progress"
        | "completed"
        | "completed_with_exceptions"
        | "unable_to_complete"
      rug_status: "checked_in" | "in_production" | "ready" | "picked_up"
      thread_status: "active" | "closed" | "archived"
      thread_type: "general" | "estimate" | "invoice"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "staff",
        "client",
        "admin",
        "office",
        "checkin_staff",
        "driver",
      ],
      billing_status: ["trialing", "active", "past_due", "canceled"],
      communication_channel: ["email", "in_app_chat"],
      communication_direction: ["outbound", "inbound"],
      company_role: ["company_admin", "staff"],
      delivery_list_status: ["compiling", "confirmed", "checked_out"],
      dispute_status: [
        "open",
        "investigating",
        "resolved",
        "credited",
        "denied",
      ],
      dispute_type: ["refused_delivery", "post_delivery_claim"],
      estimate_status: ["draft", "sent", "approved", "rejected", "expired"],
      invoice_status: ["draft", "sent", "paid", "overdue", "disputed"],
      payment_attempt_status: ["pending", "succeeded", "failed"],
      pickup_request_status: [
        "pending",
        "confirmed",
        "assigned",
        "completed",
        "cancelled",
      ],
      plan_tier: ["starter", "pro", "enterprise"],
      pricing_tier: ["standard", "preferred", "vip"],
      route_stop_item_status: [
        "pending",
        "verified",
        "disputed",
        "exception",
        "skipped",
      ],
      route_stop_phase: ["delivery", "pickup"],
      route_stop_status: [
        "queued",
        "in_progress",
        "completed",
        "completed_with_exceptions",
        "unable_to_complete",
      ],
      rug_status: ["checked_in", "in_production", "ready", "picked_up"],
      thread_status: ["active", "closed", "archived"],
      thread_type: ["general", "estimate", "invoice"],
    },
  },
} as const
