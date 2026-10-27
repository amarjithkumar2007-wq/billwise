import { supabase } from './supabase';

export interface BillRow { id: string; label: string; period_start: string; period_end: string; kwh: number; amount: number }
export interface ApplianceRow { id: string; name: string; watts: number; hours_per_day: number }

export async function listBills(): Promise<BillRow[]> {
  const { data, error } = await supabase.from('bills').select('*').order('period_start', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, kwh: Number(r.kwh), amount: Number(r.amount) }));
}

export async function listAppliances(): Promise<ApplianceRow[]> {
  const { data, error } = await supabase.from('appliances').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, watts: Number(r.watts), hours_per_day: Number(r.hours_per_day) }));
}
