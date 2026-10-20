// Generated from Supabase (supabase gen types) and trimmed. Regenerate after schema changes:
//   npx supabase gen types typescript --project-id craagbowsbjcqeizgjxe > src/lib/core/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };

export type WatchType = "genuine" | "replica";
export type WatchStatus = "owned" | "sold" | "traded" | "wishlist";
export type DealerType = "AD" | "grey_market" | "rep_dealer" | "private";

type DealerRow = { id: string; user_id: string; name: string; type: DealerType | null; contact: string | null; website: string | null; notes: string | null; created_at: string };
type StrapRow = { id: string; user_id: string; name: string; material: string | null; color: string | null; width_mm: number | null; notes: string | null; created_at: string };
type OccasionRow = { id: string; user_id: string; name: string; is_special: boolean; is_default: boolean; sort_order: number; created_at: string };
type WatchRow = {
  id: string; user_id: string; brand: string; model: string; reference: string | null; dial_color: string | null;
  case_size_mm: number | null; case_material: string | null; movement: string | null; type: WatchType;
  factory: string | null; factory_version: string | null; strap_id: string | null; condition: string | null;
  serial: string | null; notes: string | null; is_favorite: boolean; dealer_id: string | null;
  purchase_date: string | null; purchase_price: number | null; currency: string; gen_retail_price: number | null;
  status: WatchStatus; sale_date: string | null; sale_price: number | null; created_at: string; updated_at: string;
};
type WatchPhotoRow = { id: string; user_id: string; watch_id: string; storage_path: string; is_primary: boolean; sort_order: number; created_at: string };
type WearLogRow = { id: string; user_id: string; date: string; watch_id: string; strap_id: string | null; occasion_id: string | null; occasion_detail: string | null; notes: string | null; created_at: string };
type WatchStatsRow = { watch_id: string | null; user_id: string | null; wear_count: number | null; last_worn: string | null; wears_30: number | null; wears_90: number | null; wears_365: number | null };

type Opt<T, Req extends keyof T> = Partial<T> & Pick<T, Req>;
type Table<R, Req extends keyof R> = { Row: R; Insert: Opt<R, Req>; Update: Partial<R>; Relationships: Rel[] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      dealers: Table<DealerRow, "name">;
      straps: Table<StrapRow, "name">;
      occasions: Table<OccasionRow, "name">;
      watches: Table<WatchRow, "brand" | "model">;
      watch_photos: Table<WatchPhotoRow, "watch_id" | "storage_path">;
      wear_log: Table<WearLogRow, "date" | "watch_id">;
    };
    Views: { watch_stats: { Row: WatchStatsRow; Relationships: Rel[] } };
    Functions: Record<string, never>;
    Enums: { dealer_type: DealerType; watch_status: WatchStatus; watch_type: WatchType };
    CompositeTypes: Record<string, never>;
  };
};

export type Dealer = DealerRow;
export type Strap = StrapRow;
export type Occasion = OccasionRow;
export type Watch = WatchRow;
export type WatchPhoto = WatchPhotoRow;
export type WearLog = WearLogRow;
export type WatchStats = WatchStatsRow;
