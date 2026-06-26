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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          away_score: number
          created_at: string
          home_score: number
          id: string
          locked_at: string | null
          match_id: string
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          away_score: number
          created_at?: string
          home_score: number
          id?: string
          locked_at?: string | null
          match_id: string
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          away_score?: number
          created_at?: string
          home_score?: number
          id?: string
          locked_at?: string | null
          match_id?: string
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          id: string
          name: string
          season: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          season?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          season?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          activated_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          note: string | null
          pool_id: string
          requested_at: string
          status: string
          terms_accepted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          pool_id: string
          requested_at?: string
          status?: string
          terms_accepted_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          pool_id?: string
          requested_at?: string
          status?: string
          terms_accepted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pool_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pool_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      match_imports: {
        Row: {
          created_at: string
          created_count: number
          errors: Json
          id: string
          imported_by: string | null
          skipped_count: number
          source_version: string | null
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_count?: number
          errors?: Json
          id?: string
          imported_by?: string | null
          skipped_count?: number
          source_version?: string | null
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_count?: number
          errors?: Json
          id?: string
          imported_by?: string | null
          skipped_count?: number
          source_version?: string | null
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          api_match_id: string | null
          api_provider: string | null
          away_score: number
          away_team_id: string | null
          city: string | null
          competition_id: string | null
          country: string | null
          created_at: string
          external_key: string | null
          group_name: string | null
          home_score: number
          home_team_id: string | null
          id: string
          kickoff_at: string
          last_synced_at: string | null
          manual_override: boolean
          match_number: number | null
          stage: string | null
          status: string
          update_mode: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          api_match_id?: string | null
          api_provider?: string | null
          away_score?: number
          away_team_id?: string | null
          city?: string | null
          competition_id?: string | null
          country?: string | null
          created_at?: string
          external_key?: string | null
          group_name?: string | null
          home_score?: number
          home_team_id?: string | null
          id?: string
          kickoff_at: string
          last_synced_at?: string | null
          manual_override?: boolean
          match_number?: number | null
          stage?: string | null
          status?: string
          update_mode?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          api_match_id?: string | null
          api_provider?: string | null
          away_score?: number
          away_team_id?: string | null
          city?: string | null
          competition_id?: string | null
          country?: string | null
          created_at?: string
          external_key?: string | null
          group_name?: string | null
          home_score?: number
          home_team_id?: string | null
          id?: string
          kickoff_at?: string
          last_synced_at?: string | null
          manual_override?: boolean
          match_number?: number | null
          stage?: string | null
          status?: string
          update_mode?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          capture_method: string | null
          checkout_url: string | null
          confirmed_by: string | null
          created_at: string
          enrollment_id: string
          id: string
          invoice_slug: string | null
          order_nsu: string
          paid_amount_cents: number | null
          paid_at: string | null
          provider: string
          receipt_url: string | null
          status: string
          transaction_nsu: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          capture_method?: string | null
          checkout_url?: string | null
          confirmed_by?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          invoice_slug?: string | null
          order_nsu: string
          paid_amount_cents?: number | null
          paid_at?: string | null
          provider?: string
          receipt_url?: string | null
          status?: string
          transaction_nsu?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          capture_method?: string | null
          checkout_url?: string | null
          confirmed_by?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          invoice_slug?: string | null
          order_nsu?: string
          paid_amount_cents?: number | null
          paid_at?: string | null
          provider?: string
          receipt_url?: string | null
          status?: string
          transaction_nsu?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_settings: {
        Row: {
          coming_soon_message: string | null
          competition_id: string | null
          created_at: string
          enrollment_closes_at: string | null
          enrollment_opens_at: string | null
          enrollments_mode: string | null
          entry_fee_cents: number
          free_ranking_starts_at: string | null
          id: string
          minimum_participants: number
          prize_description: string | null
          prize_percentage: number
          slug: string
          status: string
          terms: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          coming_soon_message?: string | null
          competition_id?: string | null
          created_at?: string
          enrollment_closes_at?: string | null
          enrollment_opens_at?: string | null
          enrollments_mode?: string | null
          entry_fee_cents?: number
          free_ranking_starts_at?: string | null
          id?: string
          minimum_participants?: number
          prize_description?: string | null
          prize_percentage?: number
          slug: string
          status?: string
          terms?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          coming_soon_message?: string | null
          competition_id?: string | null
          created_at?: string
          enrollment_closes_at?: string | null
          enrollment_opens_at?: string | null
          enrollments_mode?: string | null
          entry_fee_cents?: number
          free_ranking_starts_at?: string | null
          id?: string
          minimum_participants?: number
          prize_description?: string | null
          prize_percentage?: number
          slug?: string
          status?: string
          terms?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pool_settings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          paid_at: string | null
          pool_id: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          pool_id: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          pool_id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_requests_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pool_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_requests_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pool_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_theme: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          favorite_country_code: string | null
          first_access_completed_at: string | null
          id: string
          last_password_reset_at: string | null
          must_change_password: boolean
          nickname: string | null
          role: string
          status: string
          temporary_password_set_at: string | null
          updated_at: string
        }
        Insert: {
          accent_theme?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          favorite_country_code?: string | null
          first_access_completed_at?: string | null
          id: string
          last_password_reset_at?: string | null
          must_change_password?: boolean
          nickname?: string | null
          role?: string
          status?: string
          temporary_password_set_at?: string | null
          updated_at?: string
        }
        Update: {
          accent_theme?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          favorite_country_code?: string | null
          first_access_completed_at?: string | null
          id?: string
          last_password_reset_at?: string | null
          must_change_password?: boolean
          nickname?: string | null
          role?: string
          status?: string
          temporary_password_set_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      score_rules: {
        Row: {
          created_at: string
          exact_score_points: number
          goal_difference_bonus: number
          id: string
          outcome_points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          exact_score_points?: number
          goal_difference_bonus?: number
          id?: string
          outcome_points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          exact_score_points?: number
          goal_difference_bonus?: number
          id?: string
          outcome_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          country_code: string | null
          created_at: string
          external_key: string | null
          flag_url: string | null
          id: string
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          external_key?: string | null
          flag_url?: string | null
          id?: string
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          external_key?: string | null
          flag_url?: string | null
          id?: string
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      match_bet_trends: {
        Row: {
          away_pct: number | null
          draw_pct: number | null
          home_pct: number | null
          match_id: string | null
          total_bets: number | null
        }
        Relationships: []
      }
      pool_public_summary: {
        Row: {
          entry_fee_cents: number | null
          estimated_prize_cents: number | null
          id: string | null
          minimum_participants: number | null
          participants_count: number | null
          prize_description: string | null
          prize_percentage: number | null
          status: string | null
          terms: string | null
          title: string | null
        }
        Insert: {
          entry_fee_cents?: number | null
          estimated_prize_cents?: never
          id?: string | null
          minimum_participants?: number | null
          participants_count?: never
          prize_description?: string | null
          prize_percentage?: number | null
          status?: string | null
          terms?: string | null
          title?: string | null
        }
        Update: {
          entry_fee_cents?: number | null
          estimated_prize_cents?: never
          id?: string | null
          minimum_participants?: number | null
          participants_count?: never
          prize_description?: string | null
          prize_percentage?: number | null
          status?: string | null
          terms?: string | null
          title?: string | null
        }
        Relationships: []
      }
      ranking: {
        Row: {
          avatar_url: string | null
          bets_count: number | null
          display_name: string | null
          exact_scores_count: number | null
          nickname: string | null
          outcome_hits_count: number | null
          rank_position: number | null
          total_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ranking_free: {
        Row: {
          avatar_url: string | null
          bets_count: number | null
          display_name: string | null
          exact_scores_count: number | null
          nickname: string | null
          outcome_hits_count: number | null
          rank_position: number | null
          total_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ranking_pool: {
        Row: {
          avatar_url: string | null
          bets_count: number | null
          display_name: string | null
          exact_scores_count: number | null
          nickname: string | null
          outcome_hits_count: number | null
          rank_position: number | null
          total_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_recalculate_match_points: {
        Args: { _match_id: string }
        Returns: number
      }
      calc_bet_points: {
        Args: {
          _away_actual: number
          _away_bet: number
          _home_actual: number
          _home_bet: number
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "superadmin" | "admin" | "player"
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
      app_role: ["superadmin", "admin", "player"],
    },
  },
} as const
