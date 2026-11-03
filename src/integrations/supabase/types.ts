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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      registrations: {
        Row: {
          admin_note: string | null
          booking_id: string
          cohort: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          payment_submitted_at: string | null
          phone: string
          policy_version: string | null
          refund_ack_accepted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["reg_status"]
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
          utr: string | null
        }
        Insert: {
          admin_note?: string | null
          booking_id?: string
          cohort?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          payment_submitted_at?: string | null
          phone: string
          policy_version?: string | null
          refund_ack_accepted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["reg_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
          utr?: string | null
        }
        Update: {
          admin_note?: string | null
          booking_id?: string
          cohort?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          payment_submitted_at?: string | null
          phone?: string
          policy_version?: string | null
          refund_ack_accepted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["reg_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
          utr?: string | null
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
      create_registration:
      | {
        Args: { _full_name: string; _phone: string }
        Returns: {
          admin_note: string | null
          booking_id: string
          cohort: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          payment_submitted_at: string | null
          phone: string
          policy_version: string | null
          refund_ack_accepted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["reg_status"]
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
          utr: string | null
        }
      }
      | {
        Args: {
          _cohort: string
          _email: string
          _full_name: string
          _phone: string
          _policy_version: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      submit_payment:
      | {
        Args: {
          _policy_version: string
          _screenshot_path: string
          _utr: string
        }
        Returns: {
          admin_note: string | null
          booking_id: string
          cohort: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          payment_submitted_at: string | null
          phone: string
          policy_version: string | null
          refund_ack_accepted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["reg_status"]
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
          utr: string | null
        }
      }
      | {
        Args: {
          _policy_version: string
          _registration_id: string
          _screenshot_path: string
          _user_id: string
          _utr: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "student"
      reg_status:
      | "registration_started"
      | "email_verified"
      | "pending_verification"
      | "confirmed"
      | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "student"],
      reg_status: [
        "registration_started",
        "email_verified",
        "pending_verification",
        "confirmed",
        "rejected",
      ],
    },
  },
} as const
