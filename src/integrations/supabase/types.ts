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
      clients: {
        Row: {
          address: string
          contact_name: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string
          phone: string
          pricing_tier: Database["public"]["Enums"]["pricing_tier"]
          route_day: string
          updated_at: string
        }
        Insert: {
          address?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string
          phone?: string
          pricing_tier?: Database["public"]["Enums"]["pricing_tier"]
          route_day?: string
          updated_at?: string
        }
        Update: {
          address?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string
          phone?: string
          pricing_tier?: Database["public"]["Enums"]["pricing_tier"]
          route_day?: string
          updated_at?: string
        }
        Relationships: []
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
          route_day: string
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
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
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
        ]
      }
      portal_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
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
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rug_services: {
        Row: {
          created_at: string
          edges: string[]
          id: string
          line_total: number
          rug_id: string
          service_id: string
          service_name: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          edges?: string[]
          id?: string
          line_total: number
          rug_id: string
          service_id: string
          service_name?: string
          unit_price: number
        }
        Update: {
          created_at?: string
          edges?: string[]
          id?: string
          line_total?: number
          rug_id?: string
          service_id?: string
          service_name?: string
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
        ]
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
          sort_order?: number
          unit?: string
          updated_at?: string
          vip_price?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "office" | "checkin_staff" | "driver"
      delivery_list_status: "compiling" | "confirmed" | "checked_out"
      invoice_status: "draft" | "sent" | "paid" | "overdue"
      pricing_tier: "standard" | "preferred" | "vip"
      rug_status: "checked_in" | "in_production" | "ready" | "picked_up"
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
      app_role: ["admin", "office", "checkin_staff", "driver"],
      delivery_list_status: ["compiling", "confirmed", "checked_out"],
      invoice_status: ["draft", "sent", "paid", "overdue"],
      pricing_tier: ["standard", "preferred", "vip"],
      rug_status: ["checked_in", "in_production", "ready", "picked_up"],
    },
  },
} as const
