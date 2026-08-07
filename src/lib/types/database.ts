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

type UsersInsert = {
  id?: string;
  spotify_id?: string | null;
  display_name: string;
  email?: string | null;
};

type PreferencesInsert = {
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

type SpotifyConnectionsInsert = {
  id?: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  scopes?: string;
};

type ArtistsInsert = {
  id?: string;
  name: string;
  spotify_id?: string | null;
  image_url?: string | null;
  genres?: string[];
};

type UserArtistsInsert = {
  id?: string;
  user_id: string;
  artist_id: string;
  source: ArtistSource;
  relationship?: ArtistRelationship;
  spotify_score?: number | null;
};

type EventsInsert = {
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
  source_payload?: Record<string, unknown> | null;
  observed_at?: string;
  genres?: string[];
  lineup?: string[];
};

type EventOffersInsert = {
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

type AlertCandidatesInsert = {
  id?: string;
  user_id: string;
  event_id: string;
  alert_type?: AlertType;
  score?: number;
  reasons?: string[];
  warnings?: string[];
  status?: AlertStatus;
  match_lane?: string;
  match_evidence?: Record<string, unknown>;
};

type MessageDeliveriesInsert = {
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

type ConsentsInsert = {
  id?: string;
  user_id: string;
  consent_type: ConsentType;
  granted_at?: string;
  revoked_at?: string | null;
  source?: string | null;
};

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
        Insert: UsersInsert;
        Update: Partial<UsersInsert>;
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
        Insert: PreferencesInsert;
        Update: Partial<PreferencesInsert>;
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
        Insert: SpotifyConnectionsInsert;
        Update: Partial<SpotifyConnectionsInsert>;
      };
      artists: {
        Row: {
          id: string;
          name: string;
          spotify_id: string | null;
          image_url: string | null;
          genres: string[];
          created_at: string;
        };
        Insert: ArtistsInsert;
        Update: Partial<ArtistsInsert>;
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
        Insert: UserArtistsInsert;
        Update: Partial<UserArtistsInsert>;
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
          source_payload: Record<string, unknown> | null;
          observed_at: string;
          genres: string[];
          lineup: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: EventsInsert;
        Update: Partial<EventsInsert>;
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
        Insert: EventOffersInsert;
        Update: Partial<EventOffersInsert>;
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
          match_lane: string;
          match_evidence: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: AlertCandidatesInsert;
        Update: Partial<AlertCandidatesInsert>;
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
        Insert: MessageDeliveriesInsert;
        Update: Partial<MessageDeliveriesInsert>;
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
        Insert: ConsentsInsert;
        Update: Partial<ConsentsInsert>;
      };
    };
  };
}
