export type EventType =
  | "concert"
  | "tribute_concert"
  | "recurring_experience"
  | "tour_announcement";

export type ArtistSource = "spotify" | "manual";
export type ArtistRelationship = "follow" | "pin" | "remove";
export type SeatQuality = "unknown" | "clear" | "restricted" | "obstructed" | "side";
export type PriceType = "from" | "exact" | "range";
export type AlertType = "new_event" | "price_drop" | "on_sale" | "announcement";
export type AlertStatus = "eligible" | "sent" | "rejected" | "expired" | "watching_for_dates";
export type MessageProvider = "console" | "twilio" | "meta";
export type MessageStatus = "pending" | "sent" | "delivered" | "failed" | "read";
export type ConsentType = "spotify" | "whatsapp";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          spotify_id: string | null;
          display_name: string;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          spotify_id?: string | null;
          display_name: string;
          email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      preferences: {
        Row: {
          id: string;
          user_id: string;
          home_postcode: string | null;
          preferred_cities: string[];
          max_price_gbp: number | null;
          ticket_count: number;
          max_radius_miles: number | null;
          reject_restricted_view: boolean;
          allow_tributes: boolean;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          home_postcode?: string | null;
          preferred_cities?: string[];
          max_price_gbp?: number | null;
          ticket_count?: number;
          max_radius_miles?: number | null;
          reject_restricted_view?: boolean;
          allow_tributes?: boolean;
          timezone?: string;
        };
        Update: Partial<Database["public"]["Tables"]["preferences"]["Insert"]>;
      };
      spotify_connections: {
        Row: {
          id: string;
          user_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          token_expires_at: string;
          scopes: string;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          token_expires_at: string;
          scopes?: string;
        };
        Update: Partial<Database["public"]["Tables"]["spotify_connections"]["Insert"]>;
      };
      artists: {
        Row: {
          id: string;
          name: string;
          spotify_id: string | null;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          spotify_id?: string | null;
          image_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["artists"]["Insert"]>;
      };
      user_artists: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string;
          source: ArtistSource;
          relationship: ArtistRelationship;
          spotify_score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_id: string;
          source: ArtistSource;
          relationship?: ArtistRelationship;
          spotify_score?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_artists"]["Insert"]>;
      };
      events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          title: string;
          event_type: EventType;
          artist_name: string | null;
          inspired_artist: string | null;
          performer: string | null;
          venue_name: string | null;
          venue_postcode: string | null;
          venue_city: string | null;
          starts_at: string | null;
          timezone: string;
          official_url: string | null;
          image_url: string | null;
          is_mock: boolean;
          source_payload: Record<string, unknown> | null;
          observed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          provider_event_id: string;
          title: string;
          event_type: EventType;
          artist_name?: string | null;
          inspired_artist?: string | null;
          performer?: string | null;
          venue_name?: string | null;
          venue_postcode?: string | null;
          venue_city?: string | null;
          starts_at?: string | null;
          timezone?: string;
          official_url?: string | null;
          image_url?: string | null;
          is_mock?: boolean;
          source_payload?: Record<string, unknown> | null;
          observed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
      };
      event_offers: {
        Row: {
          id: string;
          event_id: string;
          price_amount: number | null;
          price_currency: string;
          price_type: PriceType | null;
          section: string | null;
          row_name: string | null;
          seat_quality: SeatQuality;
          is_adjacent: boolean | null;
          seller: string | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          price_amount?: number | null;
          price_currency?: string;
          price_type?: PriceType | null;
          section?: string | null;
          row_name?: string | null;
          seat_quality?: SeatQuality;
          is_adjacent?: boolean | null;
          seller?: string | null;
          observed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_offers"]["Insert"]>;
      };
      alert_candidates: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          alert_type: AlertType;
          score: number;
          reasons: string[];
          warnings: string[];
          status: AlertStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id: string;
          alert_type?: AlertType;
          score?: number;
          reasons?: string[];
          warnings?: string[];
          status?: AlertStatus;
        };
        Update: Partial<Database["public"]["Tables"]["alert_candidates"]["Insert"]>;
      };
      message_deliveries: {
        Row: {
          id: string;
          alert_candidate_id: string;
          provider: MessageProvider;
          provider_message_id: string | null;
          recipient: string | null;
          status: MessageStatus;
          preview_text: string | null;
          sent_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alert_candidate_id: string;
          provider: MessageProvider;
          provider_message_id?: string | null;
          recipient?: string | null;
          status?: MessageStatus;
          preview_text?: string | null;
          sent_at?: string | null;
          error_message?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["message_deliveries"]["Insert"]>;
      };
      consents: {
        Row: {
          id: string;
          user_id: string;
          consent_type: ConsentType;
          granted_at: string;
          revoked_at: string | null;
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          consent_type: ConsentType;
          granted_at?: string;
          revoked_at?: string | null;
          source?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["consents"]["Insert"]>;
      };
    };
  };
}
